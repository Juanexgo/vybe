package com.vybe.analytics;

import com.vybe.profiles.ProfileAccess;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

@RestController
public class AnalyticsController {
  private final JdbcTemplate db;
  private final ProfileAccess profiles;

  public AnalyticsController(JdbcTemplate db, ProfileAccess profiles) {
    this.db = db;
    this.profiles = profiles;
  }

  @GetMapping("/api/profiles/{profile}/analytics")
  public Map<String, Object> personal(@PathVariable UUID profile, Authentication a) {
    profiles.requireOwner(profile, a.getName());
    var result =
        db.queryForMap(
            "SELECT count(*) AS sessions,COALESCE(sum(watched_seconds),0) AS"
                + " \"watchedSeconds\",count(DISTINCT asset_id) AS titles FROM playback_sessions"
                + " WHERE profile_id=?",
            profile);
    result.put(
        "completed",
        db.queryForObject(
            "SELECT count(*) FROM asset_progress WHERE profile_id=? AND completed",
            Long.class,
            profile));
    result.put(
        "daily",
        db.queryForList(
            "SELECT (started_at AT TIME ZONE 'UTC')::date AS day,COALESCE(sum(watched_seconds),0)"
                + " AS seconds,count(*) AS sessions FROM playback_sessions WHERE profile_id=? AND"
                + " started_at>now()-interval '30 days' GROUP BY 1 ORDER BY 1",
            profile));
    result.put(
        "genres",
        db.queryForList(
            "SELECT g.name,sum(s.watched_seconds) AS seconds FROM playback_sessions s JOIN"
                + " media_assets m ON m.id=s.asset_id JOIN content_genres cg ON"
                + " cg.content_id=m.content_id JOIN genres g ON g.id=cg.genre_id WHERE"
                + " s.profile_id=? GROUP BY g.name ORDER BY seconds DESC LIMIT 8",
            profile));
    return result;
  }

  @GetMapping("/api/admin/analytics")
  public Map<String, Object> admin() {
    var r = new LinkedHashMap<String, Object>();
    r.put("users", db.queryForObject("SELECT count(*) FROM users", Long.class));
    r.put(
        "activeUsers",
        db.queryForObject(
            "SELECT count(DISTINCT p.user_id) FROM playback_sessions s JOIN profiles p ON"
                + " p.id=s.profile_id WHERE s.last_seen_at>now()-interval '30 days'",
            Long.class));
    r.put("sessions", db.queryForObject("SELECT count(*) FROM playback_sessions", Long.class));
    r.put(
        "sourceBytes",
        db.queryForObject("SELECT COALESCE(sum(source_bytes),0) FROM media_assets", Long.class));
    r.put(
        "jobs",
        db.queryForMap(
            "SELECT count(*) AS total,count(*) FILTER(WHERE status='READY') AS ready,count(*)"
                + " FILTER(WHERE status='FAILED') AS failed,avg(EXTRACT(EPOCH FROM"
                + " (finished_at-started_at))) FILTER(WHERE status='READY') AS \"averageSeconds\""
                + " FROM processing_jobs"));
    r.put(
        "popular",
        db.queryForList(
            "SELECT c.title,count(s.id) AS sessions,COALESCE(sum(s.watched_seconds),0) AS seconds"
                + " FROM content c JOIN media_assets m ON m.content_id=c.id JOIN playback_sessions"
                + " s ON s.asset_id=m.id GROUP BY c.id,c.title ORDER BY sessions DESC LIMIT 10"));
    r.put(
        "errors",
        db.queryForList(
            "SELECT j.id,c.title,j.error,j.finished_at AS \"finishedAt\" FROM processing_jobs j"
                + " JOIN media_assets m ON m.id=j.asset_id JOIN content c ON c.id=m.content_id"
                + " WHERE j.status='FAILED' ORDER BY j.finished_at DESC LIMIT 20"));
    return r;
  }
}
