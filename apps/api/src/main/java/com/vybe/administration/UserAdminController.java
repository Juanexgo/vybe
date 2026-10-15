package com.vybe.administration;

import com.vybe.identity.IdentityService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.util.*;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/admin/users")
public class UserAdminController {
  private final JdbcTemplate db;
  private final IdentityService identity;

  public UserAdminController(JdbcTemplate db, IdentityService identity) {
    this.db = db;
    this.identity = identity;
  }

  @GetMapping
  public List<Map<String, Object>> list(@RequestParam(defaultValue = "0") int page) {
    if (page < 0 || page > 100000)
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid page.");
    return db.queryForList(
        "SELECT u.id,u.email,u.verified,u.disabled,u.created_at AS \"createdAt\",(SELECT"
            + " string_agg(role,', ' ORDER BY role) FROM user_roles r WHERE r.user_id=u.id) AS"
            + " roles FROM users u ORDER BY u.created_at DESC,u.id LIMIT 50 OFFSET ?",
        page * 50);
  }

  public record Change(
      boolean disabled,
      @NotNull @Size(min = 1, max = 3)
          Set<@Pattern(regexp = "USER|ADMIN|CONTENT_MANAGER") String> roles) {}

  @PutMapping("/{id}")
  @Transactional
  public void update(@PathVariable UUID id, @Valid @RequestBody Change body, Authentication a) {
    db.execute("SELECT pg_advisory_xact_lock(7194521)");
    var rows = db.queryForList("SELECT email,verified FROM users WHERE id=? FOR UPDATE", id);
    if (rows.isEmpty())
      throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Account not found.");
    if (!Boolean.TRUE.equals(rows.getFirst().get("verified"))
        && body.roles().stream().anyMatch(r -> !r.equals("USER")))
      throw new ResponseStatusException(
          HttpStatus.CONFLICT, "Verify the account before granting elevated access.");
    boolean admin =
        Boolean.TRUE.equals(
            db.queryForObject(
                "SELECT EXISTS(SELECT 1 FROM user_roles r JOIN users u ON u.id=r.user_id WHERE"
                    + " r.user_id=? AND r.role='ADMIN' AND NOT u.disabled)",
                Boolean.class,
                id));
    if (admin
        && (body.disabled() || !body.roles().contains("ADMIN"))
        && db.queryForObject(
                "SELECT count(*) FROM user_roles r JOIN users u ON u.id=r.user_id WHERE"
                    + " r.role='ADMIN' AND NOT u.disabled",
                Integer.class)
            <= 1)
      throw new ResponseStatusException(
          HttpStatus.CONFLICT, "Keep at least one enabled administrator.");
    db.update("UPDATE users SET disabled=? WHERE id=?", body.disabled(), id);
    db.update("DELETE FROM user_roles WHERE user_id=?", id);
    for (String role : body.roles())
      db.update("INSERT INTO user_roles(user_id,role) VALUES (?,?)", id, role);
    db.update("DELETE FROM spring_session WHERE principal_name=?", rows.getFirst().get("email"));
    identity.audit(a.getName(), "account.permissions-changed", id.toString());
  }
}
