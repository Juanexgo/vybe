package com.vybe.playback;

import com.vybe.media.MediaService;
import com.vybe.profiles.ProfileAccess;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.io.*;
import java.util.*;
import org.springframework.http.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;

@RestController
@RequestMapping("/api/playback")
public class PlaybackController {
  private final MediaService media;
  private final ProfileAccess profiles;
  private final JdbcTemplate db;

  public PlaybackController(MediaService media, ProfileAccess profiles, JdbcTemplate db) {
    this.media = media;
    this.profiles = profiles;
    this.db = db;
  }

  @GetMapping("/{asset}")
  public Map<String, Object> info(
      @PathVariable UUID asset, @RequestParam UUID profile, Authentication a) {
    profiles.requireOwner(profile, a.getName());
    var info = media.playable(asset);
    info.remove("manifest_key");
    info.put("manifest", "/api/playback/" + asset + "/files/master.m3u8");
    info.put("subtitles", media.subtitles(asset));
    var p =
        db.queryForList(
            "SELECT position_seconds FROM asset_progress WHERE profile_id=? AND asset_id=?",
            Double.class,
            profile,
            asset);
    info.put("position", p.isEmpty() ? 0 : p.getFirst());
    return info;
  }

  @GetMapping("/{asset}/files/{*key}")
  public ResponseEntity<StreamingResponseBody> file(
      @PathVariable UUID asset, @PathVariable String key) {
    InputStream in = media.file(asset, key);
    return stream(in, key.endsWith(".m3u8") ? "application/vnd.apple.mpegurl" : "video/mp2t");
  }

  @GetMapping("/{asset}/subtitles/{id}")
  public ResponseEntity<StreamingResponseBody> subtitle(
      @PathVariable UUID asset, @PathVariable UUID id) {
    return stream(media.subtitleFile(asset, id), "text/vtt; charset=utf-8");
  }

  private ResponseEntity<StreamingResponseBody> stream(InputStream in, String type) {
    return ResponseEntity.ok()
        .header("Cache-Control", "no-store")
        .contentType(MediaType.parseMediaType(type))
        .body(
            out -> {
              try (in) {
                in.transferTo(out);
              }
            });
  }

  public record Start(@NotNull UUID profile) {}

  @PostMapping("/{asset}/sessions")
  public Map<String, UUID> start(
      @PathVariable UUID asset, @Valid @RequestBody Start body, Authentication a) {
    profiles.requireOwner(body.profile(), a.getName());
    media.playable(asset);
    UUID id = UUID.randomUUID();
    db.update(
        "INSERT INTO playback_sessions(id,profile_id,asset_id) VALUES (?,?,?)",
        id,
        body.profile(),
        asset);
    return Map.of("id", id);
  }

  public record Progress(@DecimalMin("0") double position, boolean ended, boolean paused) {}

  @PutMapping("/sessions/{id}")
  @Transactional
  public void progress(@PathVariable UUID id, @Valid @RequestBody Progress body, Authentication a) {
    if (!Double.isFinite(body.position()))
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid playback position.");
    var sessions =
        db.queryForList(
            "SELECT s.profile_id,s.asset_id,m.content_id,m.duration_seconds FROM playback_sessions"
                + " s JOIN media_assets m ON m.id=s.asset_id WHERE s.id=?",
            id);
    if (sessions.isEmpty())
      throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Playback session not found.");
    var s = sessions.getFirst();
    UUID profile = (UUID) s.get("profile_id");
    profiles.requireOwner(profile, a.getName());
    double duration = ((Number) s.get("duration_seconds")).doubleValue();
    double position = Math.min(body.position(), duration);
    db.update(
        "INSERT INTO watch_progress(profile_id,content_id,position_seconds,completed) VALUES"
            + " (?,?,?,?) ON CONFLICT(profile_id,content_id) DO UPDATE SET"
            + " position_seconds=EXCLUDED.position_seconds,completed=EXCLUDED.completed,updated_at=now()",
        profile,
        s.get("content_id"),
        position,
        position >= duration * .95);
    db.update(
        "INSERT INTO asset_progress(profile_id,asset_id,position_seconds,completed) VALUES"
            + " (?,?,?,?) ON CONFLICT(profile_id,asset_id) DO UPDATE SET"
            + " position_seconds=EXCLUDED.position_seconds,completed=EXCLUDED.completed,updated_at=now()",
        profile,
        s.get("asset_id"),
        position,
        position >= duration * .95);
    db.update(
        "UPDATE playback_sessions SET playback_state=?,watched_seconds=watched_seconds+CASE WHEN ?"
            + " >=last_position AND ?-last_position <= LEAST(30,EXTRACT(EPOCH FROM"
            + " (now()-last_seen_at)))+2 THEN LEAST(?-last_position,LEAST(30,EXTRACT(EPOCH FROM"
            + " (now()-last_seen_at)))) ELSE 0 END,last_position=?,last_seen_at=now(),ended_at=CASE"
            + " WHEN ? THEN now() ELSE ended_at END WHERE id=?",
        body.ended() && position >= duration * .95
            ? "COMPLETED"
            : body.paused() ? "PAUSED" : "RESUMED",
        position,
        position,
        position,
        position,
        body.ended(),
        id);
  }

  @GetMapping("/history")
  public List<Map<String, Object>> history(
      @RequestParam UUID profile,
      @RequestParam(defaultValue = "false") boolean unfinished,
      Authentication a) {
    profiles.requireOwner(profile, a.getName());
    return db.queryForList(
        "SELECT c.id,c.slug,c.title,c.artwork,m.id AS \"assetId\",e.title AS"
            + " \"episodeTitle\",p.position_seconds AS position,m.duration_seconds AS"
            + " duration,p.completed,p.updated_at AS \"updatedAt\" FROM asset_progress p JOIN"
            + " media_assets m ON m.id=p.asset_id JOIN content c ON c.id=m.content_id LEFT JOIN"
            + " episodes e ON e.id=m.episode_id WHERE p.profile_id=? AND c.published AND"
            + " m.status='READY' AND (NOT ? OR (NOT p.completed AND p.position_seconds>0)) ORDER BY"
            + " p.updated_at DESC LIMIT 100",
        profile,
        unfinished);
  }

  @DeleteMapping("/history")
  @Transactional
  public void clearHistory(@RequestParam UUID profile, Authentication a) {
    profiles.requireOwner(profile, a.getName());
    db.update("DELETE FROM asset_progress WHERE profile_id=?", profile);
    db.update("DELETE FROM watch_progress WHERE profile_id=?", profile);
    db.update("DELETE FROM playback_sessions WHERE profile_id=?", profile);
  }
}
