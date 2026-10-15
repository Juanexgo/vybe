package com.vybe.administration;

import com.vybe.catalog.CatalogService;
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
public class CollectionController {
  private final JdbcTemplate db;
  private final IdentityService identity;

  public CollectionController(JdbcTemplate db, IdentityService identity) {
    this.db = db;
    this.identity = identity;
  }

  @GetMapping("/api/catalog/collections")
  public List<Map<String, Object>> publicCollections() {
    return db.queryForList(
        "SELECT id,name,description FROM collections co WHERE EXISTS(SELECT 1 FROM collection_items"
            + " i JOIN content c ON c.id=i.content_id WHERE i.collection_id=co.id AND c.published)"
            + " ORDER BY name LIMIT 100");
  }

  @GetMapping("/api/catalog/collections/{id}")
  public List<Map<String, Object>> titles(@PathVariable UUID id) {
    return db.queryForList(
        "SELECT "
            + CatalogService.COLUMNS
            + ",'' AS genres FROM content c JOIN collection_items i ON i.content_id=c.id WHERE"
            + " i.collection_id=? AND c.published ORDER BY i.position,c.id LIMIT 100",
        id);
  }

  @GetMapping("/api/admin/collections")
  public List<Map<String, Object>> all() {
    var rows =
        db.queryForList("SELECT id,name,description FROM collections ORDER BY name LIMIT 100");
    for (var r : rows)
      r.put(
          "titles",
          db.queryForList(
              "SELECT content_id FROM collection_items WHERE collection_id=? ORDER BY position",
              UUID.class,
              r.get("id")));
    return rows;
  }

  public record Input(
      @NotBlank @Size(max = 100) String name,
      @NotBlank @Size(max = 1000) String description,
      @NotNull @Size(max = 100) List<@NotNull UUID> titles) {}

  private void save(UUID id, Input body, String actor) {
    db.update(
        "INSERT INTO collections(id,name,description) VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET"
            + " name=EXCLUDED.name,description=EXCLUDED.description",
        id,
        body.name().strip(),
        body.description().strip());
    db.update("DELETE FROM collection_items WHERE collection_id=?", id);
    int position = 0;
    for (UUID title : new LinkedHashSet<>(body.titles())) {
      if (!Boolean.TRUE.equals(
          db.queryForObject(
              "SELECT EXISTS(SELECT 1 FROM content WHERE id=?)", Boolean.class, title)))
        throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unknown catalog title.");
      db.update(
          "INSERT INTO collection_items(collection_id,content_id,position) VALUES (?,?,?)",
          id,
          title,
          position++);
    }
    identity.audit(actor, "collection.saved", id.toString());
  }

  @PostMapping("/api/admin/collections")
  @Transactional
  public Map<String, UUID> create(@Valid @RequestBody Input body, Authentication a) {
    UUID id = UUID.randomUUID();
    save(id, body, a.getName());
    return Map.of("id", id);
  }

  @PutMapping("/api/admin/collections/{id}")
  @Transactional
  public void update(@PathVariable UUID id, @Valid @RequestBody Input body, Authentication a) {
    if (!Boolean.TRUE.equals(
        db.queryForObject(
            "SELECT EXISTS(SELECT 1 FROM collections WHERE id=?)", Boolean.class, id)))
      throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Collection not found.");
    save(id, body, a.getName());
  }

  @DeleteMapping("/api/admin/collections/{id}")
  @Transactional
  public void delete(@PathVariable UUID id, Authentication a) {
    db.update("DELETE FROM collections WHERE id=?", id);
    identity.audit(a.getName(), "collection.deleted", id.toString());
  }
}
