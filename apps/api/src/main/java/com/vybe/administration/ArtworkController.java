package com.vybe.administration;

import com.vybe.identity.IdentityService;
import com.vybe.media.ObjectStore;
import java.awt.image.BufferedImage;
import java.io.*;
import java.util.*;
import javax.imageio.ImageIO;
import org.springframework.http.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

@RestController
public class ArtworkController {
  private final JdbcTemplate db;
  private final ObjectStore store;
  private final TransactionTemplate tx;
  private final IdentityService identity;

  public ArtworkController(
      JdbcTemplate db, ObjectStore store, TransactionTemplate tx, IdentityService identity) {
    this.db = db;
    this.store = store;
    this.tx = tx;
    this.identity = identity;
  }

  @PostMapping("/api/admin/content/{content}/artwork")
  public Map<String, String> upload(
      @PathVariable UUID content, @RequestParam MultipartFile file, Authentication a)
      throws IOException {
    if (file.isEmpty() || file.getSize() > 5 * 1024 * 1024)
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Choose a JPEG or PNG up to 5 MB.");
    if (!Boolean.TRUE.equals(
        db.queryForObject(
            "SELECT EXISTS(SELECT 1 FROM content WHERE id=?)", Boolean.class, content)))
      throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Title not found.");
    BufferedImage original;
    try (var in = ImageIO.createImageInputStream(file.getInputStream())) {
      var readers = ImageIO.getImageReaders(in);
      if (!readers.hasNext())
        throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid image.");
      var reader = readers.next();
      try {
        reader.setInput(in);
        if (!Set.of("JPEG", "PNG").contains(reader.getFormatName().toUpperCase(Locale.ROOT))
            || reader.getWidth(0) > 4096
            || reader.getHeight(0) > 4096)
          throw new ResponseStatusException(
              HttpStatus.BAD_REQUEST, "Use a JPEG or PNG no larger than 4096 pixels per side.");
        original = reader.read(0);
      } finally {
        reader.dispose();
      }
    }
    double scale = Math.min(1, 2048.0 / Math.max(original.getWidth(), original.getHeight()));
    var image =
        new BufferedImage(
            Math.max(1, (int) (original.getWidth() * scale)),
            Math.max(1, (int) (original.getHeight() * scale)),
            BufferedImage.TYPE_INT_RGB);
    var graphics = image.createGraphics();
    try {
      graphics.drawImage(original, 0, 0, image.getWidth(), image.getHeight(), null);
    } finally {
      graphics.dispose();
    }
    var bytes = new ByteArrayOutputStream();
    ImageIO.write(image, "jpg", bytes);
    byte[] data = bytes.toByteArray();
    UUID id = UUID.randomUUID();
    String key = "artwork/" + id + ".jpg", url = "/api/catalog/artwork/" + id;
    store.put(key, new ByteArrayInputStream(data), data.length, "image/jpeg");
    try {
      tx.executeWithoutResult(
          s -> {
            db.update(
                "INSERT INTO artwork_assets(id,content_id,storage_key,bytes) VALUES (?,?,?,?)",
                id,
                content,
                key,
                data.length);
            db.update("UPDATE content SET artwork=?,updated_at=now() WHERE id=?", url, content);
            identity.audit(a.getName(), "catalog.artwork-updated", content.toString());
          });
    } catch (RuntimeException e) {
      store.remove(key);
      throw e;
    }
    return Map.of("artwork", url);
  }

  @GetMapping("/api/catalog/artwork/{id}")
  public ResponseEntity<byte[]> get(@PathVariable UUID id, Authentication a) throws IOException {
    boolean admin =
        a != null
            && a.getAuthorities().stream()
                .anyMatch(
                    r -> Set.of("ROLE_ADMIN", "ROLE_CONTENT_MANAGER").contains(r.getAuthority()));
    var keys =
        db.queryForList(
            "SELECT ar.storage_key FROM artwork_assets ar JOIN content c ON c.id=ar.content_id"
                + " WHERE ar.id=? AND (c.published OR ?)",
            String.class,
            id,
            admin);
    if (keys.isEmpty())
      throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Artwork not found.");
    try (var stream = store.get(keys.getFirst())) {
      return ResponseEntity.ok()
          .header("Cache-Control", "private, max-age=60")
          .contentType(MediaType.IMAGE_JPEG)
          .body(stream.readAllBytes());
    }
  }
}
