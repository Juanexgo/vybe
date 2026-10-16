package com.vybe.identity;

import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.core.*;
import org.springframework.security.oauth2.core.oidc.user.OidcUser;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class GoogleIdentity {
  private final JdbcTemplate db;
  private final Accounts accounts;
  private final PasswordEncoder passwords;

  public GoogleIdentity(JdbcTemplate db, Accounts accounts, PasswordEncoder passwords) {
    this.db = db;
    this.accounts = accounts;
    this.passwords = passwords;
  }

  static OAuth2AuthenticationException failure(String code) {
    return new OAuth2AuthenticationException(new OAuth2Error(code));
  }

  @Transactional
  public List<String> authenticate(OidcUser identity) {
    if (!Boolean.TRUE.equals(identity.getEmailVerified())
        || identity.getEmail() == null
        || identity.getSubject() == null
        || identity.getSubject().isBlank()) throw failure("unverified-email");
    String email = IdentityService.email(identity.getEmail());
    if (email.length() > 254 || !email.contains("@")) throw failure("invalid-email");
    // Serialize first sign-ins so concurrent callbacks cannot create duplicate accounts.
    db.queryForObject(
        "SELECT pg_advisory_xact_lock(hashtext(?))",
        Object.class,
        "google:" + identity.getSubject());
    var linked =
        db.queryForList(
            "SELECT user_id FROM external_identities WHERE provider='google' AND subject=?",
            UUID.class,
            identity.getSubject());
    Account account;
    if (linked.isEmpty()) {
      if (accounts.findByEmail(email).isPresent()) throw failure("existing-account");
      account = new Account(email, passwords.encode(UUID.randomUUID().toString()));
      account.verified = true;
      accounts.saveAndFlush(account);
      db.update("INSERT INTO user_roles VALUES (?,'USER')", account.id);
      String name = identity.getFullName();
      if (name == null || name.isBlank()) name = "My profile";
      UUID profile = UUID.randomUUID();
      db.update(
          "INSERT INTO profiles(id,user_id,name) VALUES (?,?,?)",
          profile,
          account.id,
          name.substring(0, Math.min(40, name.length())));
      db.update(
          "INSERT INTO watchlists(id,profile_id,name) VALUES (?,?,'My list')",
          UUID.randomUUID(),
          profile);
      db.update(
          "INSERT INTO external_identities(provider,subject,user_id) VALUES ('google',?,?)",
          identity.getSubject(),
          account.id);
    } else {
      account = accounts.findById(linked.getFirst()).orElseThrow();
    }
    if (!account.email.equals(email)) throw failure("email-changed");
    if (Boolean.TRUE.equals(
        db.queryForObject("SELECT disabled FROM users WHERE id=?", Boolean.class, account.id)))
      throw failure("account-disabled");
    db.update(
        "INSERT INTO audit_logs(actor,action,target) VALUES (?,'account.google-login',?)",
        account.email,
        account.id.toString());
    return db.queryForList("SELECT role FROM user_roles WHERE user_id=?", String.class, account.id);
  }
}
