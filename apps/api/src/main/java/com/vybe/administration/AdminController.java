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
@RequestMapping("/api/admin")
public class AdminController {
  private final JdbcTemplate db;
  private final IdentityService identity;

  public AdminController(JdbcTemplate db, IdentityService identity) {
    this.db = db;
    this.identity = identity;
  }

  public record ContentInput(
      @NotBlank @Pattern(regexp = "[a-z0-9]+(?:-[a-z0-9]+)*") @Size(max = 120) String slug,
      @NotBlank @Size(max = 160) String title,
      @NotNull @Pattern(regexp = "MOVIE|SERIES") String kind,
      @NotBlank @Size(max = 3000) String synopsis,
      @Min(1888) @Max(2200) int releaseYear,
      @Min(1) @Max(2000) int durationMinutes,
      @NotBlank @Size(max = 40) String language,
      @NotBlank @Size(max = 20) String rating,
      @NotNull @Pattern(regexp = "(?:/art/[a-z0-9-]+\\.svg|/api/catalog/artwork/[a-f0-9-]{36})")
          String artwork,
      @NotNull @Pattern(regexp = "#[a-fA-F0-9]{6}") String accent,
      @NotBlank @Size(max = 2000) String attribution,
      @NotNull @Pattern(regexp = "https://[^\\s]+") @Size(max = 500) String sourceUrl,
      @NotNull @Size(max = 10) List<@NotBlank @Size(max = 60) String> genres) {}

  @GetMapping("/content")
  public List<Map<String, Object>> content() {
    return db.queryForList(
        "SELECT id,slug,title,kind,published,updated_at FROM content ORDER BY updated_at DESC LIMIT"
            + " 200");
  }

  @PostMapping("/content")
  @Transactional
  public Map<String, UUID> create(@Valid @RequestBody ContentInput c, Authentication a) {
    UUID id = UUID.randomUUID();
    db.update(
        "INSERT INTO"
            + " content(id,slug,title,kind,synopsis,release_year,duration_minutes,language,rating,artwork,accent,attribution,source_url)"
            + " VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
        id,
        c.slug(),
        c.title(),
        c.kind(),
        c.synopsis(),
        c.releaseYear(),
        c.durationMinutes(),
        c.language(),
        c.rating(),
        c.artwork(),
        c.accent(),
        c.attribution(),
        c.sourceUrl());
    db.update(
        c.kind().equals("MOVIE")
            ? "INSERT INTO movies VALUES (?)"
            : "INSERT INTO series VALUES (?)",
        id);
    for (String genre : c.genres()) {
      db.update("INSERT INTO genres(name) VALUES (?) ON CONFLICT DO NOTHING", genre);
      db.update(
          "INSERT INTO content_genres SELECT ?,id FROM genres WHERE name=? ON CONFLICT DO NOTHING",
          id,
          genre);
    }
    identity.audit(a.getName(), "catalog.created", id.toString());
    return Map.of("id", id);
  }

  @GetMapping("/content/{id}")
  public Map<String, Object> get(@PathVariable UUID id) {
    var rows =
        db.queryForList(
            "SELECT " + com.vybe.catalog.CatalogService.COLUMNS + " FROM content c WHERE id=?", id);
    if (rows.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Title not found.");
    var row = rows.getFirst();
    row.put(
        "genres",
        db.queryForList(
            "SELECT g.name FROM genres g JOIN content_genres cg ON cg.genre_id=g.id WHERE"
                + " cg.content_id=? ORDER BY g.name",
            String.class,
            id));
    return row;
  }

  @PutMapping("/content/{id}")
  @Transactional
  public void update(@PathVariable UUID id, @Valid @RequestBody ContentInput c, Authentication a) {
    var existing =
        db.queryForList("SELECT kind FROM content WHERE id=? FOR UPDATE", String.class, id);
    if (existing.isEmpty())
      throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Title not found.");
    if (!existing.getFirst().equals(c.kind()))
      throw new ResponseStatusException(
          HttpStatus.BAD_REQUEST, "The content format cannot be changed after creation.");
    db.update(
        "UPDATE content SET"
            + " slug=?,title=?,synopsis=?,release_year=?,duration_minutes=?,language=?,rating=?,artwork=?,accent=?,attribution=?,source_url=?,updated_at=now()"
            + " WHERE id=?",
        c.slug(),
        c.title(),
        c.synopsis(),
        c.releaseYear(),
        c.durationMinutes(),
        c.language(),
        c.rating(),
        c.artwork(),
        c.accent(),
        c.attribution(),
        c.sourceUrl(),
        id);
    db.update("DELETE FROM content_genres WHERE content_id=?", id);
    for (String genre : c.genres()) {
      db.update("INSERT INTO genres(name) VALUES (?) ON CONFLICT DO NOTHING", genre);
      db.update(
          "INSERT INTO content_genres SELECT ?,id FROM genres WHERE name=? ON CONFLICT DO NOTHING",
          id,
          genre);
    }
    identity.audit(a.getName(), "catalog.updated", id.toString());
  }

  public record Visibility(boolean published) {}

  @PatchMapping("/content/{id}/visibility")
  @Transactional
  public void visibility(@PathVariable UUID id, @RequestBody Visibility body, Authentication a) {
    if (db.update(
            "UPDATE content SET published=?,updated_at=now() WHERE id=?", body.published(), id)
        == 0) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Title not found.");
    identity.audit(
        a.getName(), body.published() ? "catalog.published" : "catalog.unpublished", id.toString());
  }
}
