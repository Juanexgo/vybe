package com.vybe.profiles;

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
@RequestMapping("/api/profiles")
public class ProfileController {
  private final JdbcTemplate db;
  private final IdentityService identity;

  public ProfileController(JdbcTemplate db, IdentityService identity) {
    this.db = db;
    this.identity = identity;
  }

  public record ProfileInput(
      @NotBlank @Size(max = 40) String name,
      @Pattern(regexp = "#[0-9a-fA-F]{6}") @NotNull String color) {}

  @GetMapping
  public List<Map<String, Object>> list(Authentication a) {
    return db.queryForList(
        "SELECT id,name,color FROM profiles WHERE user_id=? ORDER BY created_at",
        identity.id(a.getName()));
  }

  @PostMapping
  @Transactional
  public Map<String, Object> create(@Valid @RequestBody ProfileInput p, Authentication a) {
    UUID owner = identity.id(a.getName());
    db.queryForObject("SELECT id FROM users WHERE id=? FOR UPDATE", UUID.class, owner);
    if (db.queryForObject("SELECT count(*) FROM profiles WHERE user_id=?", Integer.class, owner)
        >= 5)
      throw new ResponseStatusException(
          HttpStatus.CONFLICT, "An account can have up to five profiles.");
    UUID id = UUID.randomUUID();
    db.update(
        "INSERT INTO profiles(id,user_id,name,color) VALUES (?,?,?,?)",
        id,
        owner,
        p.name().strip(),
        p.color());
    db.update(
        "INSERT INTO watchlists(id,profile_id,name) VALUES (?,?,'My list')", UUID.randomUUID(), id);
    return Map.of("id", id, "name", p.name(), "color", p.color());
  }

  @PutMapping("/{profile}")
  @Transactional
  public void edit(
      @PathVariable UUID profile, @Valid @RequestBody ProfileInput p, Authentication a) {
    int changed =
        db.update(
            "UPDATE profiles SET name=?,color=? WHERE id=? AND user_id=?",
            p.name().strip(),
            p.color(),
            profile,
            identity.id(a.getName()));
    if (changed == 0) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Profile not found.");
  }

  @DeleteMapping("/{profile}")
  @Transactional
  public void delete(@PathVariable UUID profile, Authentication a) {
    UUID owner = identity.id(a.getName());
    db.queryForObject("SELECT id FROM users WHERE id=? FOR UPDATE", UUID.class, owner);
    if (!Boolean.TRUE.equals(
        db.queryForObject(
            "SELECT EXISTS(SELECT 1 FROM profiles WHERE id=? AND user_id=?)",
            Boolean.class,
            profile,
            owner))) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Profile not found.");
    if (db.queryForObject("SELECT count(*) FROM profiles WHERE user_id=?", Integer.class, owner)
        <= 1)
      throw new ResponseStatusException(HttpStatus.CONFLICT, "Keep at least one viewing profile.");
    db.update("DELETE FROM profiles WHERE id=?", profile);
  }
}
