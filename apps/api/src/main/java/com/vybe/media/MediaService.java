package com.vybe.media;

import com.vybe.identity.IdentityService;
import java.io.*;
import java.util.*;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

@Service
public class MediaService {
  private final JdbcTemplate db;
  private final ObjectStore store;
  private final TransactionTemplate tx;
  private final IdentityService identity;

  public MediaService(
      JdbcTemplate db, ObjectStore store, TransactionTemplate tx, IdentityService identity) {
    this.db = db;
    this.store = store;
    this.tx = tx;
    this.identity = identity;
  }

  public UUID upload(UUID content, UUID episode, MultipartFile file, String actor)
      throws IOException {
    var kinds = db.queryForList("SELECT kind FROM content WHERE id=?", String.class, content);
    if (kinds.isEmpty())
      throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Content not found.");
    if (kinds.getFirst().equals("MOVIE") && episode != null)
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Films do not have episodes.");
    if (kinds.getFirst().equals("SERIES")
        && (episode == null
            || !Boolean.TRUE.equals(
                db.queryForObject(
                    "SELECT EXISTS(SELECT 1 FROM episodes e JOIN seasons s ON s.id=e.season_id"
                        + " WHERE e.id=? AND s.series_id=?)",
                    Boolean.class,
                    episode,
                    content))))
      throw new ResponseStatusException(
          HttpStatus.BAD_REQUEST, "Select an episode belonging to this series.");
    if (file.isEmpty() || file.getSize() > 250L * 1024 * 1024)
      throw new ResponseStatusException(
          HttpStatus.BAD_REQUEST, "Upload a video between 1 byte and 250 MB.");
    if (!Set.of("video/mp4", "video/webm", "video/quicktime")
        .contains(Objects.toString(file.getContentType(), "")))
      throw new ResponseStatusException(
          HttpStatus.UNSUPPORTED_MEDIA_TYPE, "Use MP4, WebM or MOV video.");
    UUID asset = UUID.randomUUID();
    String key = "originals/" + asset + "/source";
    try (InputStream stream = file.getInputStream()) {
      store.put(key, stream, file.getSize(), file.getContentType());
    }
    try {
      tx.executeWithoutResult(
          status -> {
            db.update(
                "INSERT INTO"
                    + " media_assets(id,content_id,original_key,content_type,source_bytes,episode_id)"
                    + " VALUES (?,?,?,?,?,?)",
                asset,
                content,
                key,
                file.getContentType(),
                file.getSize(),
                episode);
            db.update(
                "INSERT INTO processing_jobs(id,asset_id) VALUES (?,?)", UUID.randomUUID(), asset);
            identity.audit(actor, "media.uploaded", asset.toString());
          });
    } catch (RuntimeException e) {
      store.remove(key);
      throw e;
    }
    return asset;
  }

  public Map<String, Object> playable(UUID asset) {
    var rows =
        db.queryForList(
            "SELECT m.id,m.content_id AS"
                + " \"contentId\",m.episode_id,m.manifest_key,m.duration_seconds AS duration,CASE"
                + " WHEN e.id IS NULL THEN c.title ELSE c.title || ' — ' || e.title END AS title"
                + " FROM media_assets m JOIN content c ON c.id=m.content_id LEFT JOIN episodes e ON"
                + " e.id=m.episode_id WHERE m.id=? AND m.status='READY' AND c.published",
            asset);
    if (rows.isEmpty())
      throw new ResponseStatusException(
          HttpStatus.NOT_FOUND, "This video is not available for playback.");
    return rows.getFirst();
  }

  public InputStream file(UUID asset, String key) {
    var media = playable(asset);
    String relative = key.startsWith("/") ? key.substring(1) : key;
    if (!relative.matches("master\\.m3u8|(?:[0-9]+p|audio[0-9]+)/(index\\.m3u8|seg_[0-9]+\\.ts)"))
      throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Media file not found.");
    String master = (String) media.get("manifest_key");
    return store.get(master.substring(0, master.lastIndexOf('/') + 1) + relative);
  }

  public List<Map<String, Object>> subtitles(UUID asset) {
    return db.queryForList(
        "SELECT id,language,label FROM subtitles WHERE asset_id=? ORDER BY created_at", asset);
  }

  public UUID subtitle(UUID asset, MultipartFile file, String language, String label, String actor)
      throws IOException {
    if (file.getSize() > 2 * 1024 * 1024
        || file.isEmpty()
        || !language.matches("[a-zA-Z]{2,3}(-[a-zA-Z]{2})?")
        || label.isBlank()
        || label.length() > 60)
      throw new ResponseStatusException(
          HttpStatus.BAD_REQUEST, "Provide a WebVTT subtitle, language code and label.");
    if (!Boolean.TRUE.equals(
        db.queryForObject(
            "SELECT EXISTS(SELECT 1 FROM media_assets WHERE id=?)", Boolean.class, asset)))
      throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Media not found.");
    byte[] bytes = file.getBytes();
    String text = new String(bytes, java.nio.charset.StandardCharsets.UTF_8);
    if (!text.startsWith("WEBVTT") || text.contains("\u0000"))
      throw new ResponseStatusException(
          HttpStatus.BAD_REQUEST, "Subtitles must be valid UTF-8 WebVTT.");
    UUID id = UUID.randomUUID();
    String key = "subtitles/" + asset + "/" + id + ".vtt";
    store.put(key, new ByteArrayInputStream(bytes), bytes.length, "text/vtt");
    try {
      tx.executeWithoutResult(
          s -> {
            db.update(
                "INSERT INTO subtitles(id,asset_id,language,label,storage_key) VALUES (?,?,?,?,?)",
                id,
                asset,
                language,
                label,
                key);
            identity.audit(actor, "media.subtitle-added", asset.toString());
          });
    } catch (RuntimeException e) {
      store.remove(key);
      throw e;
    }
    return id;
  }

  public InputStream subtitleFile(UUID asset, UUID id) {
    playable(asset);
    var keys =
        db.queryForList(
            "SELECT storage_key FROM subtitles WHERE id=? AND asset_id=?", String.class, id, asset);
    if (keys.isEmpty())
      throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Subtitle not found.");
    return store.get(keys.getFirst());
  }
}
