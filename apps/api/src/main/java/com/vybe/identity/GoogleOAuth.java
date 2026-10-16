package com.vybe.identity;

import java.util.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.*;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.oauth2.client.CommonOAuth2Provider;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.userdetails.User;
import org.springframework.security.oauth2.client.oidc.userinfo.OidcUserService;
import org.springframework.security.oauth2.client.registration.*;
import org.springframework.security.oauth2.client.web.*;
import org.springframework.security.oauth2.core.oidc.user.*;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.security.web.csrf.CsrfTokenRepository;

@Configuration
@Conditional(GoogleOAuth.Enabled.class)
public class GoogleOAuth {
  public static class Enabled implements Condition {
    public boolean matches(
        ConditionContext context, org.springframework.core.type.AnnotatedTypeMetadata metadata) {
      return !context.getEnvironment().getProperty("GOOGLE_CLIENT_ID", "").isBlank()
          && !context.getEnvironment().getProperty("GOOGLE_CLIENT_SECRET", "").isBlank();
    }
  }

  private final GoogleIdentity identities;
  private final String clientId, clientSecret, publicUrl;

  public GoogleOAuth(
      GoogleIdentity identities,
      @Value("${GOOGLE_CLIENT_ID}") String clientId,
      @Value("${GOOGLE_CLIENT_SECRET}") String clientSecret,
      @Value("${vybe.public-url}") String publicUrl) {
    this.identities = identities;
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.publicUrl = publicUrl;
  }

  @Bean
  ClientRegistrationRepository googleClients() {
    return new InMemoryClientRegistrationRepository(
        CommonOAuth2Provider.GOOGLE
            .getBuilder("google")
            .clientId(clientId)
            .clientSecret(clientSecret)
            .scope("openid", "profile", "email")
            .redirectUri(publicUrl + "/api/login/oauth2/code/google")
            .build());
  }

  public void configure(HttpSecurity http, CsrfTokenRepository csrf) throws Exception {
    var resolver =
        new DefaultOAuth2AuthorizationRequestResolver(googleClients(), "/api/oauth2/authorization");
    resolver.setAuthorizationRequestCustomizer(OAuth2AuthorizationRequestCustomizers.withPkce());
    var loader = new OidcUserService();
    http.oauth2Login(
        o ->
            o.loginPage("/login")
                .authorizationEndpoint(a -> a.authorizationRequestResolver(resolver))
                .redirectionEndpoint(r -> r.baseUri("/api/login/oauth2/code/*"))
                .userInfoEndpoint(
                    u ->
                        u.oidcUserService(
                            request -> {
                              var identity = loader.loadUser(request);
                              var roles =
                                  identities.authenticate(identity).stream()
                                      .map(role -> new SimpleGrantedAuthority("ROLE_" + role))
                                      .toList();
                              return new DefaultOidcUser(
                                  roles, identity.getIdToken(), identity.getUserInfo(), "email");
                            }))
                .successHandler(
                    (req, res, auth) -> {
                      var oidc = (OidcUser) auth.getPrincipal();
                      var user =
                          User.withUsername(IdentityService.email(oidc.getEmail()))
                              .password("")
                              .authorities(auth.getAuthorities())
                              .build();
                      var context = SecurityContextHolder.createEmptyContext();
                      context.setAuthentication(
                          UsernamePasswordAuthenticationToken.authenticated(
                              user, null, user.getAuthorities()));
                      SecurityContextHolder.setContext(context);
                      new HttpSessionSecurityContextRepository().saveContext(context, req, res);
                      csrf.saveToken(null, req, res);
                      res.sendRedirect(publicUrl + "/profiles");
                    })
                .failureHandler(
                    (req, res, error) -> {
                      String code =
                          error
                                      instanceof
                                      org.springframework.security.oauth2.core
                                              .OAuth2AuthenticationException
                                          oauth
                                  && "existing-account".equals(oauth.getError().getErrorCode())
                              ? "existing-account"
                              : "failed";
                      res.sendRedirect(publicUrl + "/login?oauth=" + code);
                    }));
  }
}
