package com.vybe.watchlists;

import com.vybe.identity.IdentityService;
import com.vybe.profiles.ProfileAccess;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.nio.charset.StandardCharsets;
import java.security.*;
import java.util.*;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/watchlists")
public class WatchlistController {
  private final JdbcTemplate db;
  private final ProfileAccess profiles;
  private final IdentityService identity;

  public WatchlistController(JdbcTemplate db, ProfileAccess profiles, IdentityService identity) {
    this.db = db;
    this.profiles = profiles;
    this.identity = identity;
  }

  private Map<String, Object> access(UUID list, UUID profile, String actor, boolean owner) {
    profiles.requireOwner(profile, actor);
    var rows =
        db.queryForList(
            "SELECT w.id,w.name,w.profile_id AS owner FROM watchlists w WHERE w.id=? AND"
                + " (w.profile_id=? OR (NOT ? AND EXISTS(SELECT 1 FROM watchlist_members m WHERE"
                + " m.watchlist_id=w.id AND m.profile_id=?)))",
            list,
            profile,
            owner,
            profile);
    if (rows.isEmpty())
      throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Watchlist not found.");
    return rows.getFirst();
  }

  private String hash(String value) {
    try {
      return HexFormat.of()
          .formatHex(
              MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8)));
    } catch (NoSuchAlgorithmException e) {
      throw new IllegalStateException(e);
    }
  }

  @GetMapping
  public List<Map<String, Object>> lists(@RequestParam UUID profile, Authentication a) {
    profiles.requireOwner(profile, a.getName());
    return db.queryForList(
        "SELECT w.id,w.name,w.profile_id AS owner,(SELECT count(*) FROM watchlist_items i WHERE"
            + " i.watchlist_id=w.id) AS size FROM watchlists w WHERE w.profile_id=? OR"
            + " EXISTS(SELECT 1 FROM watchlist_members m WHERE m.watchlist_id=w.id AND"
            + " m.profile_id=?) ORDER BY w.created_at DESC LIMIT 100",
        profile,
        profile);
  }

  public record Named(@NotNull UUID profile, @NotBlank @Size(max = 80) String name) {}

  @PostMapping
  @Transactional
  public Map<String, UUID> create(@Valid @RequestBody Named body, Authentication a) {
    profiles.requireOwner(body.profile(), a.getName());
    db.queryForObject("SELECT id FROM profiles WHERE id=? FOR UPDATE", UUID.class, body.profile());
    if (db.queryForObject(
            "SELECT count(*) FROM watchlists WHERE profile_id=?", Integer.class, body.profile())
        >= 20)
      throw new ResponseStatusException(HttpStatus.CONFLICT, "A profile can own up to 20 lists.");
    UUID id = UUID.randomUUID();
    db.update(
        "INSERT INTO watchlists(id,profile_id,name) VALUES (?,?,?)",
        id,
        body.profile(),
        body.name().strip());
    return Map.of("id", id);
  }

  @PutMapping("/{list}")
  public void rename(@PathVariable UUID list, @Valid @RequestBody Named body, Authentication a) {
    var row = access(list, body.profile(), a.getName(), true);
    if (row.get("name").equals("My list") || body.name().strip().equals("My list"))
      throw new ResponseStatusException(
          HttpStatus.CONFLICT, "My list is reserved for your personal library.");
    db.update("UPDATE watchlists SET name=? WHERE id=?", body.name().strip(), list);
  }

  @DeleteMapping("/{list}")
  public void delete(@PathVariable UUID list, @RequestParam UUID profile, Authentication a) {
    var row = access(list, profile, a.getName(), true);
    if (row.get("name").equals("My list"))
      throw new ResponseStatusException(
          HttpStatus.CONFLICT, "Your personal library cannot be deleted.");
    db.update("DELETE FROM watchlists WHERE id=?", list);
  }

  @GetMapping("/{list}")
  public Map<String, Object> detail(
      @PathVariable UUID list, @RequestParam UUID profile, Authentication a) {
    var row = access(list, profile, a.getName(), false);
    row.put(
        "items",
        db.queryForList(
            "SELECT c.id,c.slug,c.title,c.artwork,c.accent,c.kind,c.release_year AS"
                + " \"releaseYear\",c.duration_minutes AS"
                + " \"durationMinutes\",c.rating,c.synopsis,c.language,'' AS genres FROM content c"
                + " JOIN watchlist_items i ON i.content_id=c.id WHERE i.watchlist_id=? AND"
                + " c.published ORDER BY i.created_at DESC",
            list));
    row.put(
        "members",
        db.queryForList(
            "SELECT p.id,p.name FROM profiles p WHERE p.id=? OR EXISTS(SELECT 1 FROM"
                + " watchlist_members m WHERE m.watchlist_id=? AND m.profile_id=p.id)",
            row.get("owner"),
            list));
    return row;
  }

  @PutMapping("/{list}/items/{content}")
  public void add(
      @PathVariable UUID list,
      @PathVariable UUID content,
      @RequestParam UUID profile,
      Authentication a) {
    access(list, profile, a.getName(), false);
    if (!Boolean.TRUE.equals(
        db.queryForObject(
            "SELECT EXISTS(SELECT 1 FROM content WHERE id=? AND published)",
            Boolean.class,
            content))) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Title not found.");
    db.update(
        "INSERT INTO watchlist_items(watchlist_id,content_id) VALUES (?,?) ON CONFLICT DO NOTHING",
        list,
        content);
  }

  @DeleteMapping("/{list}/items/{content}")
  public void remove(
      @PathVariable UUID list,
      @PathVariable UUID content,
      @RequestParam UUID profile,
      Authentication a) {
    access(list, profile, a.getName(), false);
    db.update("DELETE FROM watchlist_items WHERE watchlist_id=? AND content_id=?", list, content);
  }

  @PostMapping("/{list}/invite")
  public Map<String, String> invite(
      @PathVariable UUID list, @RequestParam UUID profile, Authentication a) {
    var row = access(list, profile, a.getName(), true);
    if (row.get("name").equals("My list"))
      throw new ResponseStatusException(
          HttpStatus.CONFLICT, "Create a separate list to collaborate.");
    byte[] bytes = new byte[32];
    new SecureRandom().nextBytes(bytes);
    String token = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    db.update(
        "UPDATE watchlists SET invite_hash=?,invite_expires_at=now()+interval '7 days' WHERE id=?",
        hash(token),
        list);
    return Map.of("invite", token);
  }

  public record Join(@NotNull UUID profile, @NotBlank @Size(max = 100) String invite) {}

  @PostMapping("/{list}/join")
  @Transactional
  public void join(@PathVariable UUID list, @Valid @RequestBody Join body, Authentication a) {
    profiles.requireOwner(body.profile(), a.getName());
    identity.limit("list-join:" + a.getName(), 60);
    var rows =
        db.queryForList(
            "SELECT id FROM watchlists WHERE id=? AND invite_hash=? AND invite_expires_at>now() FOR"
                + " UPDATE",
            list,
            hash(body.invite()));
    if (rows.isEmpty())
      throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Invitation invalid or expired.");
    if (db.queryForObject(
                "SELECT count(*) FROM watchlist_members WHERE watchlist_id=?", Integer.class, list)
            >= 20
        && !Boolean.TRUE.equals(
            db.queryForObject(
                "SELECT EXISTS(SELECT 1 FROM watchlist_members WHERE watchlist_id=? AND"
                    + " profile_id=?)",
                Boolean.class,
                list,
                body.profile())))
      throw new ResponseStatusException(
          HttpStatus.CONFLICT, "This list has reached its collaborator limit.");
    db.update(
        "INSERT INTO watchlist_members(watchlist_id,profile_id) SELECT ?,? WHERE NOT EXISTS(SELECT"
            + " 1 FROM watchlists WHERE id=? AND profile_id=?) ON CONFLICT DO NOTHING",
        list,
        body.profile(),
        list,
        body.profile());
  }

  @DeleteMapping("/{list}/members/{member}")
  public void removeMember(
      @PathVariable UUID list,
      @PathVariable UUID member,
      @RequestParam UUID profile,
      Authentication a) {
    access(list, profile, a.getName(), !profile.equals(member));
    db.update("DELETE FROM watchlist_members WHERE watchlist_id=? AND profile_id=?", list, member);
  }
}
