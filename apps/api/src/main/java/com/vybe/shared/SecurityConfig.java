package com.vybe.shared;

import org.springframework.context.annotation.*;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.csrf.*;

@Configuration
public class SecurityConfig {
  @Bean
  org.springframework.session.web.http.DefaultCookieSerializer sessionCookies(
      @org.springframework.beans.factory.annotation.Value("${COOKIE_DOMAIN:}") String domain,
      @org.springframework.beans.factory.annotation.Value("${COOKIE_SECURE:false}")
          boolean secure) {
    var cookie = new org.springframework.session.web.http.DefaultCookieSerializer();
    cookie.setCookieName("VYBE_SESSION");
    cookie.setCookiePath("/");
    cookie.setUseHttpOnlyCookie(true);
    cookie.setUseSecureCookie(secure);
    cookie.setSameSite("Lax");
    if (!domain.isBlank()) cookie.setDomainName(domain);
    return cookie;
  }

  @Bean
  PasswordEncoder passwords() {
    return new BCryptPasswordEncoder(12);
  }

  @Bean
  SecurityFilterChain security(
      HttpSecurity http,
      org.springframework.beans.factory.ObjectProvider<com.vybe.identity.GoogleOAuth> google,
      @org.springframework.beans.factory.annotation.Value("${vybe.metrics-token}")
          String metricsToken)
      throws Exception {
    // API clients and OAuth use explicit destinations. Saving anonymous requests creates
    // competing session cookies while the browser is establishing its CSRF token.
    http.requestCache(cache -> cache.disable());
    var csrf = CookieCsrfTokenRepository.withHttpOnlyFalse();
    http.csrf(
            c ->
                c.csrfTokenRepository(csrf)
                    .csrfTokenRequestHandler(new CsrfTokenRequestAttributeHandler()))
        .authorizeHttpRequests(
            a ->
                a.dispatcherTypeMatchers(jakarta.servlet.DispatcherType.ASYNC)
                    .permitAll()
                    .requestMatchers(
                        "/api/auth/csrf",
                        "/api/auth/providers",
                        "/api/oauth2/authorization/**",
                        "/api/login/oauth2/code/**",
                        "/api/auth/register",
                        "/api/auth/login",
                        "/api/auth/verify",
                        "/api/auth/forgot",
                        "/api/auth/reset",
                        "/api/auth/resend",
                        "/api/catalog/**",
                        "/api/discovery/search",
                        "/actuator/health/**")
                    .permitAll()
                    .requestMatchers("/api/admin/users/**")
                    .hasRole("ADMIN")
                    .requestMatchers("/api/admin/**")
                    .hasAnyRole("ADMIN", "CONTENT_MANAGER")
                    .requestMatchers(
                        "/v3/api-docs/**", "/swagger-ui/**", "/swagger-ui.html", "/actuator/**")
                    .hasRole("ADMIN")
                    .anyRequest()
                    .authenticated())
        .exceptionHandling(
            e ->
                e.authenticationEntryPoint(
                        (req, res, ex) -> {
                          res.setStatus(401);
                          res.setContentType("application/problem+json");
                          res.getWriter().write("{\"detail\":\"Sign in to continue.\"}");
                        })
                    .accessDeniedHandler(
                        (req, res, ex) -> {
                          res.setStatus(403);
                          res.setContentType("application/problem+json");
                          if (ex instanceof InvalidCsrfTokenException
                              || ex instanceof MissingCsrfTokenException) {
                            res.getWriter()
                                .write(
                                    "{\"code\":\"csrf_invalid\",\"detail\":\"Refresh your security"
                                        + " token and try again.\"}");
                            return;
                          }
                          res.getWriter()
                              .write(
                                  "{\"detail\":\"This action is not allowed. Refresh and try"
                                      + " again.\"}");
                        }))
        .logout(
            l ->
                l.logoutUrl("/api/auth/logout")
                    .logoutSuccessHandler((req, res, a) -> res.setStatus(204))
                    .deleteCookies("VYBE_SESSION"))
        .headers(h -> h.contentTypeOptions(c -> {}).frameOptions(f -> f.deny()));
    http.addFilterBefore(
        new MetricsAuthentication(metricsToken),
        org.springframework.security.web.access.intercept.AuthorizationFilter.class);
    if (google.getIfAvailable() != null) google.getObject().configure(http, csrf);
    return http.build();
  }
}
