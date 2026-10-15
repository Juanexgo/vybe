package com.vybe.shared;

import jakarta.servlet.*;
import jakarta.servlet.http.*;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.AuthorityUtils;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;

public class MetricsAuthentication extends OncePerRequestFilter {
  private final String token;

  public MetricsAuthentication(String token) {
    this.token = token;
  }

  @Override
  protected void doFilterInternal(
      HttpServletRequest request, HttpServletResponse response, FilterChain chain)
      throws ServletException, IOException {
    if (request.getMethod().equals("GET")
        && request.getRequestURI().equals("/actuator/prometheus")
        && !token.isBlank()) {
      String supplied = request.getHeader("Authorization");
      if (supplied != null
          && MessageDigest.isEqual(
              ("Bearer " + token).getBytes(StandardCharsets.UTF_8),
              supplied.getBytes(StandardCharsets.UTF_8))) {
        var context = SecurityContextHolder.createEmptyContext();
        context.setAuthentication(
            new UsernamePasswordAuthenticationToken(
                "metrics-scraper", null, AuthorityUtils.createAuthorityList("ROLE_ADMIN")));
        SecurityContextHolder.setContext(context);
      }
    }
    chain.doFilter(request, response);
  }
}
