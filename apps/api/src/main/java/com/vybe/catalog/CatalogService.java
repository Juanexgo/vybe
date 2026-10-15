package com.vybe.catalog;

import java.util.*;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

@Service
public class CatalogService {
  private final NamedParameterJdbcTemplate db;

  public CatalogService(NamedParameterJdbcTemplate db) {
    this.db = db;
  }

  public static final String COLUMNS =
      "c.id,c.slug,c.title,c.kind,c.synopsis,c.release_year AS \"releaseYear\",c.duration_minutes"
          + " AS \"durationMinutes\",c.language,c.rating,c.artwork,c.accent,c.featured,c.attribution,c.source_url"
          + " AS \"sourceUrl\"";
  private static final String GENRES =
      ",COALESCE((SELECT string_agg(g.name, ', ' ORDER BY g.name) FROM genres g JOIN content_genres"
          + " cg ON cg.genre_id=g.id WHERE cg.content_id=c.id),'') AS genres";

  public Map<String, Object> browse(String q, String genre, String kind, int page) {
    if (page < 0
        || page > 1000
        || q.length() > 150
        || genre.length() > 60
        || !Set.of("", "MOVIE", "SERIES").contains(kind))
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid catalog filter.");
    var p = new HashMap<String, Object>();
    p.put("q", "%" + q.replace("!", "!!").replace("%", "!%").replace("_", "!_") + "%");
    p.put("genre", genre);
    p.put("kind", kind);
    p.put("offset", page * 12);
    String where =
        " FROM content c WHERE c.published AND (c.title ILIKE :q ESCAPE '!' OR c.synopsis ILIKE :q"
            + " ESCAPE '!') AND (:kind='' OR c.kind=:kind) AND (:genre='' OR EXISTS(SELECT 1 FROM"
            + " content_genres cg JOIN genres g ON g.id=cg.genre_id WHERE cg.content_id=c.id AND"
            + " g.name=:genre))";
    var items =
        db.queryForList(
            "SELECT "
                + COLUMNS
                + GENRES
                + where
                + " ORDER BY c.featured DESC,c.release_year DESC,c.id LIMIT 12 OFFSET :offset",
            p);
    return Map.of(
        "items",
        items,
        "total",
        Objects.requireNonNull(db.queryForObject("SELECT count(*)" + where, p, Long.class)),
        "page",
        page,
        "pageSize",
        12);
  }

  public Map<String, Object> detail(String slug) {
    var p = Map.of("slug", slug);
    var results =
        db.queryForList(
            "SELECT " + COLUMNS + GENRES + " FROM content c WHERE c.slug=:slug AND c.published", p);
    if (results.isEmpty())
      throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Title not found.");
    var title = results.getFirst();
    var available =
        db.queryForList(
            "SELECT id FROM media_assets WHERE content_id=:id AND episode_id IS NULL AND"
                + " status='READY' ORDER BY created_at DESC LIMIT 1",
            Map.of("id", title.get("id")),
            java.util.UUID.class);
    title.put("playableAssetId", available.isEmpty() ? null : available.getFirst());
    var id = Map.of("id", title.get("id"));
    title.put(
        "credits",
        db.queryForList(
            "SELECT p.name,cr.job FROM credits cr JOIN people p ON p.id=cr.person_id WHERE"
                + " cr.content_id=:id",
            id));
    title.put(
        "episodes",
        db.queryForList(
            "SELECT e.id,(SELECT m.id FROM media_assets m WHERE m.episode_id=e.id AND"
                + " m.status='READY' ORDER BY m.created_at DESC LIMIT 1) AS"
                + " \"playableAssetId\",s.number AS"
                + " season,e.number,e.title,e.synopsis,e.duration_minutes AS \"durationMinutes\""
                + " FROM episodes e JOIN seasons s ON s.id=e.season_id WHERE s.series_id=:id ORDER"
                + " BY s.number,e.number",
            id));
    return title;
  }

  public List<String> genres() {
    return db.queryForList("SELECT name FROM genres ORDER BY name", Map.of(), String.class);
  }
}
