package com.vybe.identity;

import java.nio.charset.StandardCharsets;
import java.security.*;
import java.util.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.userdetails.User;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class IdentityService {
  private final Accounts accounts;
  private final JdbcTemplate db;
  private final PasswordEncoder encoder;
  private final String publicUrl;
  private final String dummy;

  public IdentityService(
      Accounts accounts,
      JdbcTemplate db,
      PasswordEncoder encoder,
      @Value("${vybe.public-url}") String publicUrl) {
    this.accounts = accounts;
    this.db = db;
    this.encoder = encoder;
    this.publicUrl = publicUrl;
    this.dummy = encoder.encode(UUID.randomUUID().toString());
  }

  public static String hash(String s) {
    try {
      return HexFormat.of()
          .formatHex(
              MessageDigest.getInstance("SHA-256").digest(s.getBytes(StandardCharsets.UTF_8)));
    } catch (NoSuchAlgorithmException e) {
      throw new IllegalStateException(e);
    }
  }

  private String encode(String password) {
    if (password.getBytes(StandardCharsets.UTF_8).length > 72)
      throw new ResponseStatusException(
          HttpStatus.BAD_REQUEST, "Password must be at most 72 UTF-8 bytes.");
    return encoder.encode(password);
  }

  public static String email(String s) {
    return s.strip().toLowerCase(Locale.ROOT);
  }

  public void limit(String key, int max) {
    Integer hits =
        db.queryForObject(
            "INSERT INTO rate_limits(bucket,hits,expires_at) VALUES (?,1,now()+interval '15"
                + " minutes') ON CONFLICT(bucket) DO UPDATE SET hits=CASE WHEN"
                + " rate_limits.expires_at<now() THEN 1 ELSE rate_limits.hits+1 END,"
                + " expires_at=CASE WHEN rate_limits.expires_at<now() THEN now()+interval '15"
                + " minutes' ELSE rate_limits.expires_at END RETURNING hits",
            Integer.class,
            hash(key));
    if (hits != null && hits > max)
      throw new ResponseStatusException(
          HttpStatus.TOO_MANY_REQUESTS, "Too many attempts. Try again in 15 minutes.");
  }

  @Transactional
  public void register(String email, String password, String name) {
    String normalized = email(email);
    if (accounts.findByEmail(normalized).isPresent()) return;
    var account = accounts.saveAndFlush(new Account(normalized, encode(password)));
    db.update("INSERT INTO user_roles VALUES (?,'USER')", account.id);
    UUID profile = UUID.randomUUID();
    db.update(
        "INSERT INTO profiles(id,user_id,name) VALUES (?,?,?)", profile, account.id, name.strip());
    db.update(
        "INSERT INTO watchlists(id,profile_id,name) VALUES (?,?,'My list')",
        UUID.randomUUID(),
        profile);
    token(account, "VERIFY");
    audit(normalized, "account.registered", account.id.toString());
  }

  public UserDetails login(String email, String password) {
    var a = accounts.findByEmail(email(email)).orElse(null);
    boolean valid =
        password.getBytes(StandardCharsets.UTF_8).length <= 72
            && encoder.matches(password, a == null ? dummy : a.passwordHash);
    if (!valid || a == null)
      throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Email or password is incorrect.");
    if (Boolean.TRUE.equals(
        db.queryForObject("SELECT disabled FROM users WHERE id=?", Boolean.class, a.id)))
      throw new ResponseStatusException(
          HttpStatus.FORBIDDEN, "This account is disabled. Contact the administrator.");
    if (!a.verified)
      throw new ResponseStatusException(
          HttpStatus.FORBIDDEN, "Verify your email before signing in.");
    var roles = db.queryForList("SELECT role FROM user_roles WHERE user_id=?", String.class, a.id);
    audit(a.email, "account.login", a.id.toString());
    return User.withUsername(a.email).password("").roles(roles.toArray(String[]::new)).build();
  }

  @Transactional
  public void forgot(String email) {
    accounts.findByEmail(email(email)).ifPresent(a -> token(a, "RESET"));
  }

  @Transactional
  public void resend(String email) {
    accounts.findByEmail(email(email)).filter(a -> !a.verified).ifPresent(a -> token(a, "VERIFY"));
  }

  private void token(Account a, String purpose) {
    byte[] bytes = new byte[32];
    new SecureRandom().nextBytes(bytes);
    String token = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    db.update("DELETE FROM auth_tokens WHERE user_id=? AND purpose=?", a.id, purpose);
    db.update(
        "INSERT INTO auth_tokens(token_hash,user_id,purpose,expires_at) VALUES"
            + " (?,?,?,now()+interval '30 minutes')",
        hash(token),
        a.id,
        purpose);
    String path = purpose.equals("VERIFY") ? "verify" : "reset";
    db.update(
        "INSERT INTO mail_outbox(id,recipient,subject,body) VALUES (?,?,?,?)",
        UUID.randomUUID(),
        a.email,
        purpose.equals("VERIFY") ? "Verify your VYBE account" : "Reset your VYBE password",
        "Open this link within 30 minutes: "
            + publicUrl
            + "/"
            + path
            + "#token="
            + token
            + "\nIf you did not request this, ignore this email.");
  }

  @Transactional
  public void redeem(String token, String purpose, String password) {
    var ids =
        db.queryForList(
            "DELETE FROM auth_tokens WHERE token_hash=? AND purpose=? AND expires_at>now()"
                + " RETURNING user_id",
            UUID.class,
            hash(token),
            purpose);
    if (ids.isEmpty())
      throw new ResponseStatusException(
          HttpStatus.BAD_REQUEST, "This link is invalid or has expired.");
    UUID id = ids.getFirst();
    var a = accounts.findById(id).orElseThrow();
    if (purpose.equals("VERIFY")) {
      a.verified = true;
    } else {
      a.passwordHash = encode(password);
      db.update("DELETE FROM spring_session WHERE principal_name=?", a.email);
      db.update("DELETE FROM auth_tokens WHERE user_id=?", id);
    }
    accounts.save(a);
    audit(a.email, "account." + purpose.toLowerCase(Locale.ROOT), id.toString());
  }

  public UUID id(String email) {
    return accounts
        .findByEmail(email)
        .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED))
        .id;
  }

  public void audit(String actor, String action, String target) {
    db.update("INSERT INTO audit_logs(actor,action,target) VALUES (?,?,?)", actor, action, target);
  }
}
