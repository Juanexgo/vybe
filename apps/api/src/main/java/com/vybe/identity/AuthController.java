package com.vybe.identity;

import jakarta.servlet.http.*;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.util.Map;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/auth")
public class AuthController {
  private final IdentityService service;

  public AuthController(IdentityService service) {
    this.service = service;
  }

  public record Registration(
      @Email @NotBlank @Size(max = 254) String email,
      @NotBlank @Size(min = 12, max = 64) String password,
      @NotBlank @Size(max = 40) String name) {}

  public record Login(
      @Email @NotBlank @Size(max = 254) String email, @NotBlank @Size(max = 64) String password) {}

  public record EmailInput(@Email @NotBlank @Size(max = 254) String email) {}

  public record Token(@NotBlank @Size(max = 100) String token) {}

  public record Reset(
      @NotBlank @Size(max = 100) String token,
      @NotBlank @Size(min = 12, max = 64) String password) {}

  @GetMapping("/csrf")
  public Map<String, String> csrf(CsrfToken token) {
    return Map.of("token", token.getToken());
  }

  @PostMapping("/register")
  public Map<String, String> register(
      @Valid @RequestBody Registration body, HttpServletRequest req) {
    service.limit("register:" + req.getRemoteAddr(), 10);
    service.register(body.email(), body.password(), body.name());
    return Map.of(
        "message",
        "Check your email for a verification link. If you already have an account, sign in.");
  }

  @PostMapping("/login")
  public Map<String, Object> login(
      @Valid @RequestBody Login body, HttpServletRequest req, HttpServletResponse res) {
    service.limit("login-ip:" + req.getRemoteAddr(), 60);
    service.limit("login:" + IdentityService.email(body.email()), 15);
    var user = service.login(body.email(), body.password());
    req.getSession();
    req.changeSessionId();
    var ctx = SecurityContextHolder.createEmptyContext();
    ctx.setAuthentication(
        UsernamePasswordAuthenticationToken.authenticated(user, null, user.getAuthorities()));
    SecurityContextHolder.setContext(ctx);
    new HttpSessionSecurityContextRepository().saveContext(ctx, req, res);
    org.springframework.security.web.csrf.CookieCsrfTokenRepository.withHttpOnlyFalse()
        .saveToken(null, req, res);
    return Map.of("email", user.getUsername(), "roles", user.getAuthorities());
  }

  @GetMapping("/me")
  public Map<String, Object> me(Authentication a) {
    return Map.of(
        "email",
        a.getName(),
        "roles",
        a.getAuthorities().stream().map(x -> x.getAuthority()).toList());
  }

  @PostMapping("/verify")
  public Map<String, String> verify(@Valid @RequestBody Token body, HttpServletRequest req) {
    service.limit("verify:" + req.getRemoteAddr(), 30);
    service.redeem(body.token(), "VERIFY", null);
    return Map.of("message", "Email verified. You can now sign in.");
  }

  @PostMapping("/forgot")
  public Map<String, String> forgot(@Valid @RequestBody EmailInput body, HttpServletRequest req) {
    service.limit("forgot:" + req.getRemoteAddr(), 10);
    service.forgot(body.email());
    return Map.of("message", "If this email has an account, a reset link is on its way.");
  }

  @PostMapping("/resend")
  public Map<String, String> resend(@Valid @RequestBody EmailInput body, HttpServletRequest req) {
    service.limit("resend:" + req.getRemoteAddr(), 10);
    service.resend(body.email());
    return Map.of("message", "If verification is needed, a new link is on its way.");
  }

  @PostMapping("/reset")
  public Map<String, String> reset(@Valid @RequestBody Reset body, HttpServletRequest req) {
    service.limit("reset:" + req.getRemoteAddr(), 20);
    service.redeem(body.token(), "RESET", body.password());
    return Map.of("message", "Password changed. Sign in with your new password.");
  }
}
