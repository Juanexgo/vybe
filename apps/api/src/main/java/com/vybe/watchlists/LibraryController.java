package com.vybe.watchlists;

import com.vybe.profiles.ProfileAccess;
import java.util.*;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/profiles/{profile}/library")
public class LibraryController {
  private final JdbcTemplate db;
  private final ProfileAccess profiles;

  public LibraryController(JdbcTemplate db, ProfileAccess profiles) {
    this.db = db;
    this.profiles = profiles;
  }

  @GetMapping
  public List<Map<String, Object>> list(@PathVariable UUID profile, Authentication a) {
    profiles.requireOwner(profile, a.getName());
    return db.queryForList(
        "SELECT c.id,c.slug,c.title,c.artwork,c.accent,c.kind,c.release_year AS"
            + " \"releaseYear\",c.duration_minutes AS"
            + " \"durationMinutes\",c.rating,c.synopsis,c.language,'' AS genres FROM"
            + " watchlist_items wi JOIN watchlists w ON w.id=wi.watchlist_id JOIN content c ON"
            + " c.id=wi.content_id WHERE w.profile_id=? AND w.name='My list' AND c.published ORDER"
            + " BY wi.created_at DESC",
        profile);
  }

  @PutMapping("/{content}")
  @Transactional
  public void save(@PathVariable UUID profile, @PathVariable UUID content, Authentication a) {
    profiles.requireOwner(profile, a.getName());
    if (!Boolean.TRUE.equals(
        db.queryForObject(
            "SELECT EXISTS(SELECT 1 FROM content WHERE id=? AND published)",
            Boolean.class,
            content))) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Title not found.");
    db.update(
        "INSERT INTO watchlist_items(watchlist_id,content_id) SELECT id,? FROM watchlists WHERE"
            + " profile_id=? AND name='My list' ON CONFLICT DO NOTHING",
        content,
        profile);
  }

  @DeleteMapping("/{content}")
  public void remove(@PathVariable UUID profile, @PathVariable UUID content, Authentication a) {
    profiles.requireOwner(profile, a.getName());
    db.update(
        "DELETE FROM watchlist_items WHERE content_id=? AND watchlist_id IN (SELECT id FROM"
            + " watchlists WHERE profile_id=? AND name='My list')",
        content,
        profile);
  }
}
