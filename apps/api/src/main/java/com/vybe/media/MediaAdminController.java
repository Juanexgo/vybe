package com.vybe.media;

import java.io.IOException;
import java.util.*;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/admin/media")
public class MediaAdminController {
  private final MediaService media;
  private final JdbcTemplate db;
  private final com.vybe.identity.IdentityService identity;

  public MediaAdminController(
      MediaService media, JdbcTemplate db, com.vybe.identity.IdentityService identity) {
    this.media = media;
    this.db = db;
    this.identity = identity;
  }

  @PostMapping(value = "/{content}", consumes = "multipart/form-data")
  public Map<String, UUID> upload(
      @PathVariable UUID content,
      @RequestPart("file") MultipartFile file,
      @RequestParam(required = false) UUID episode,
      Authentication a)
      throws IOException {
    return Map.of("assetId", media.upload(content, episode, file, a.getName()));
  }

  @GetMapping("/jobs")
  public List<Map<String, Object>> jobs() {
    return db.queryForList(
        "SELECT j.id,j.asset_id AS \"assetId\",j.status,j.attempts,j.error,j.started_at AS"
            + " \"startedAt\",j.finished_at AS \"finishedAt\",c.title,m.source_bytes AS bytes FROM"
            + " processing_jobs j JOIN media_assets m ON m.id=j.asset_id JOIN content c ON"
            + " c.id=m.content_id ORDER BY j.created_at DESC LIMIT 100");
  }

  @PostMapping("/jobs/{id}/retry")
  @Transactional
  public void retry(@PathVariable UUID id, Authentication a) {
    var ids =
        db.queryForList(
            "UPDATE processing_jobs SET"
                + " status='QUEUED',attempts=0,error=NULL,lease_owner=NULL,lease_until=NULL WHERE"
                + " id=? AND status='FAILED' RETURNING asset_id",
            UUID.class,
            id);
    if (ids.isEmpty())
      throw new ResponseStatusException(HttpStatus.CONFLICT, "Only failed jobs can be retried.");
    db.update(
        "UPDATE media_assets SET status='QUEUED',updated_at=now() WHERE id=?", ids.getFirst());
    identity.audit(a.getName(), "media.retry", id.toString());
  }

  @PostMapping(value = "/{asset}/subtitles", consumes = "multipart/form-data")
  public Map<String, UUID> subtitle(
      @PathVariable UUID asset,
      @RequestPart("file") MultipartFile file,
      @RequestParam String language,
      @RequestParam String label,
      Authentication a)
      throws IOException {
    return Map.of("id", media.subtitle(asset, file, language, label, a.getName()));
  }
}
