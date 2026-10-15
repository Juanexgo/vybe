package com.vybe.recommendations;

import com.vybe.catalog.CatalogService;
import com.vybe.profiles.ProfileAccess;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.util.*;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/profiles/{profile}")
public class RecommendationController {
  private final NamedParameterJdbcTemplate db;
  private final ProfileAccess profiles;

  public RecommendationController(NamedParameterJdbcTemplate db, ProfileAccess profiles) {
    this.db = db;
    this.profiles = profiles;
  }

  @GetMapping("/recommendations")
  public Map<String, Object> recommendations(@PathVariable UUID profile, Authentication a) {
    profiles.requireOwner(profile, a.getName());
    var p = Map.of("profile", profile);
    String sql =
        """
WITH since AS (SELECT recommendation_reset_at AS stamp FROM profiles WHERE id=:profile),
likes AS (
 SELECT wi.content_id,1.5::float AS weight FROM watchlist_items wi JOIN watchlists w ON w.id=wi.watchlist_id WHERE w.profile_id=:profile AND wi.created_at>(SELECT stamp FROM since)
 UNION ALL SELECT content_id,2::float FROM watch_progress WHERE profile_id=:profile AND completed AND updated_at>(SELECT stamp FROM since)
 UNION ALL SELECT content_id,(score-3)::float FROM ratings WHERE profile_id=:profile AND updated_at>(SELECT stamp FROM since)
 UNION ALL SELECT c.id,0.25::float FROM content c WHERE c.published AND EXISTS(SELECT 1 FROM search_history h WHERE h.profile_id=:profile AND h.created_at>(SELECT stamp FROM since) AND c.search_document @@ websearch_to_tsquery('english',h.query))
), genre_signals AS (
 SELECT genre_id,SUM(weight) AS weight FROM (
   SELECT cg.genre_id,l.weight FROM likes l JOIN content_genres cg ON cg.content_id=l.content_id
   UNION ALL SELECT genre_id,weight*2 FROM profile_preferences WHERE profile_id=:profile
 ) all_signals GROUP BY genre_id
), preference_vector AS (SELECT avg(e.embedding) AS embedding FROM content_embeddings e JOIN likes l ON l.content_id=e.content_id WHERE l.weight>0),
ranked AS (
 SELECT c.id,COALESCE((SELECT sum(s.weight) FROM genre_signals s JOIN content_genres cg ON cg.genre_id=s.genre_id WHERE cg.content_id=c.id),0) AS affinity,
 COALESCE(1-(e.embedding <=> (SELECT embedding FROM preference_vector)),0) AS similarity,
 (SELECT count(*) FROM playback_sessions ps JOIN media_assets m ON m.id=ps.asset_id WHERE m.content_id=c.id) AS views
 FROM content c LEFT JOIN content_embeddings e ON e.content_id=c.id
 WHERE c.published AND NOT EXISTS(SELECT 1 FROM recommendation_feedback f WHERE f.profile_id=:profile AND f.content_id=c.id AND f.hidden)
 AND NOT EXISTS(SELECT 1 FROM watch_progress w WHERE w.profile_id=:profile AND w.content_id=c.id AND w.completed AND w.updated_at>(SELECT stamp FROM since))
 AND NOT EXISTS(SELECT 1 FROM ratings r WHERE r.profile_id=:profile AND r.content_id=c.id AND r.score<=2 AND r.updated_at>(SELECT stamp FROM since))
) SELECT
"""
            + CatalogService.COLUMNS
            + ",COALESCE((SELECT string_agg(g.name,', ') FROM genres g JOIN content_genres cg ON"
            + " cg.genre_id=g.id WHERE cg.content_id=c.id),'') AS"
            + " genres,r.affinity,r.similarity,r.views,(r.affinity+0.75*r.similarity+0.1*ln(1+r.views)+CASE"
            + " WHEN c.featured THEN 0.2 ELSE 0 END) AS score FROM ranked r JOIN content c ON"
            + " c.id=r.id ORDER BY score DESC,c.release_year DESC,c.id LIMIT 12";
    var items = db.queryForList(sql, p);
    for (var item : items) {
      List<String> reasons = new ArrayList<>();
      if (((Number) item.get("affinity")).doubleValue() > 0)
        reasons.add("Genres connect with your preferences, ratings, searches or viewing signals");
      if (((Number) item.get("similarity")).doubleValue() > 0.2)
        reasons.add("Semantically similar to stories you liked");
      if (((Number) item.get("views")).longValue() > 0)
        reasons.add("Watched by the VYBE community");
      if (reasons.isEmpty())
        reasons.add(
            Boolean.TRUE.equals(item.get("featured"))
                ? "An editorial starting point while we learn your taste"
                : "Explore a published title to discover your taste");
      item.put("reasons", reasons);
      item.remove("views");
    }
    return Map.of("items", items);
  }

  public record Rating(@Min(1) @Max(5) int score) {}

  @PutMapping("/ratings/{content}")
  @Transactional
  public void rate(
      @PathVariable UUID profile,
      @PathVariable UUID content,
      @Valid @RequestBody Rating body,
      Authentication a) {
    profiles.requireOwner(profile, a.getName());
    requirePublished(content);
    db.update(
        "INSERT INTO ratings(profile_id,content_id,score) VALUES (:profile,:content,:score) ON"
            + " CONFLICT(profile_id,content_id) DO UPDATE SET"
            + " score=EXCLUDED.score,updated_at=now()",
        Map.of("profile", profile, "content", content, "score", body.score()));
  }

  @GetMapping("/ratings/{content}")
  public Map<String, Object> rating(
      @PathVariable UUID profile, @PathVariable UUID content, Authentication a) {
    profiles.requireOwner(profile, a.getName());
    var scores =
        db.queryForList(
            "SELECT score FROM ratings WHERE profile_id=:profile AND content_id=:content",
            Map.of("profile", profile, "content", content),
            Integer.class);
    return Map.of("score", scores.isEmpty() ? 0 : scores.getFirst());
  }

  public record Feedback(boolean hidden) {}

  @PutMapping("/recommendations/{content}")
  public void feedback(
      @PathVariable UUID profile,
      @PathVariable UUID content,
      @RequestBody Feedback body,
      Authentication a) {
    profiles.requireOwner(profile, a.getName());
    requirePublished(content);
    db.update(
        "INSERT INTO recommendation_feedback(profile_id,content_id,hidden) VALUES"
            + " (:profile,:content,:hidden) ON CONFLICT(profile_id,content_id) DO UPDATE SET"
            + " hidden=EXCLUDED.hidden,updated_at=now()",
        Map.of("profile", profile, "content", content, "hidden", body.hidden()));
  }

  @GetMapping("/preferences")
  public List<Map<String, Object>> preferences(@PathVariable UUID profile, Authentication a) {
    profiles.requireOwner(profile, a.getName());
    return db.queryForList(
        "SELECT g.id,g.name,COALESCE(p.weight,0) AS weight FROM genres g LEFT JOIN"
            + " profile_preferences p ON p.genre_id=g.id AND p.profile_id=:profile ORDER BY g.name",
        Map.of("profile", profile));
  }

  public record Preference(@NotNull Integer genreId, @Min(-3) @Max(3) int weight) {}

  @PutMapping("/preferences")
  public void preference(
      @PathVariable UUID profile, @Valid @RequestBody Preference body, Authentication a) {
    profiles.requireOwner(profile, a.getName());
    if (!Boolean.TRUE.equals(
        db.queryForObject(
            "SELECT EXISTS(SELECT 1 FROM genres WHERE id=:id)",
            Map.of("id", body.genreId()),
            Boolean.class)))
      throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Genre not found.");
    db.update(
        "INSERT INTO profile_preferences(profile_id,genre_id,weight) VALUES"
            + " (:profile,:genre,:weight) ON CONFLICT(profile_id,genre_id) DO UPDATE SET"
            + " weight=EXCLUDED.weight",
        Map.of("profile", profile, "genre", body.genreId(), "weight", body.weight()));
  }

  @PostMapping("/recommendations/reset")
  @Transactional
  public void reset(@PathVariable UUID profile, Authentication a) {
    profiles.requireOwner(profile, a.getName());
    var p = Map.of("profile", profile);
    db.update("UPDATE profiles SET recommendation_reset_at=now() WHERE id=:profile", p);
    db.update("DELETE FROM recommendation_feedback WHERE profile_id=:profile", p);
    db.update("DELETE FROM profile_preferences WHERE profile_id=:profile", p);
  }

  private void requirePublished(UUID content) {
    if (!Boolean.TRUE.equals(
        db.queryForObject(
            "SELECT EXISTS(SELECT 1 FROM content WHERE id=:id AND published)",
            Map.of("id", content),
            Boolean.class)))
      throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Title not found.");
  }
}
