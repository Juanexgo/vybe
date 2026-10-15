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
@RequestMapping("/api/admin/content/{content}/episodes")
public class EpisodeController {
  private final JdbcTemplate db;
  private final IdentityService identity;

  public EpisodeController(JdbcTemplate db, IdentityService identity) {
    this.db = db;
    this.identity = identity;
  }

  public record Episode(
      @Min(1) @Max(1000) int season,
      @Min(1) @Max(10000) int number,
      @NotBlank @Size(max = 160) String title,
      @NotBlank @Size(max = 3000) String synopsis,
      @Min(1) @Max(2000) int durationMinutes) {}

  @GetMapping
  public List<Map<String, Object>> list(@PathVariable UUID content) {
    return db.queryForList(
        "SELECT e.id,s.number AS season,e.number,e.title,e.synopsis,e.duration_minutes AS"
            + " \"durationMinutes\" FROM episodes e JOIN seasons s ON s.id=e.season_id WHERE"
            + " s.series_id=? ORDER BY s.number,e.number",
        content);
  }

  @PostMapping
  @Transactional
  public Map<String, UUID> create(
      @PathVariable UUID content, @Valid @RequestBody Episode e, Authentication a) {
    if (db.queryForList(
            "SELECT content_id FROM series WHERE content_id=? FOR UPDATE", UUID.class, content)
        .isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Series not found.");
    db.update(
        "INSERT INTO seasons(id,series_id,number) VALUES (?,?,?) ON CONFLICT(series_id,number) DO"
            + " NOTHING",
        UUID.randomUUID(),
        content,
        e.season());
    UUID
        season =
            db.queryForObject(
                "SELECT id FROM seasons WHERE series_id=? AND number=?",
                UUID.class,
                content,
                e.season()),
        id = UUID.randomUUID();
    db.update(
        "INSERT INTO episodes(id,season_id,number,title,synopsis,duration_minutes) VALUES"
            + " (?,?,?,?,?,?)",
        id,
        season,
        e.number(),
        e.title(),
        e.synopsis(),
        e.durationMinutes());
    identity.audit(a.getName(), "episode.created", id.toString());
    return Map.of("id", id);
  }

  @PutMapping("/{id}")
  @Transactional
  public void update(
      @PathVariable UUID content,
      @PathVariable UUID id,
      @Valid @RequestBody Episode e,
      Authentication a) {
    if (db.update(
            "UPDATE episodes SET title=?,synopsis=?,duration_minutes=? WHERE id=? AND season_id IN"
                + " (SELECT id FROM seasons WHERE series_id=?)",
            e.title(),
            e.synopsis(),
            e.durationMinutes(),
            id,
            content)
        == 0) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Episode not found.");
    identity.audit(a.getName(), "episode.updated", id.toString());
  }
}
