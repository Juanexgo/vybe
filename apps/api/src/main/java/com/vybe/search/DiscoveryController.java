package com.vybe.search;

import com.vybe.identity.IdentityService;
import com.vybe.profiles.ProfileAccess;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.constraints.*;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

@RestController
@Validated
@RequestMapping("/api/discovery")
public class DiscoveryController {
  private final DiscoveryService service;
  private final IdentityService identity;
  private final ProfileAccess profiles;
  private final JdbcTemplate db;

  public DiscoveryController(
      DiscoveryService service, IdentityService identity, ProfileAccess profiles, JdbcTemplate db) {
    this.service = service;
    this.identity = identity;
    this.profiles = profiles;
    this.db = db;
  }

  @GetMapping("/search")
  public Map<String, Object> search(
      @RequestParam(defaultValue = "") @Size(max = 300) String q,
      @RequestParam(defaultValue = "") @Size(max = 60) String genre,
      @RequestParam(defaultValue = "") @Size(max = 40) String language,
      @RequestParam(defaultValue = "0") @Min(0) @Max(2000) int maxMinutes,
      @RequestParam(defaultValue = "1888") @Min(1888) @Max(2200) int fromYear,
      @RequestParam(defaultValue = "2200") @Min(1888) @Max(2200) int toYear,
      @RequestParam(defaultValue = "0") @Min(0) @Max(1000) int page,
      HttpServletRequest request) {
    identity.limit("discovery:" + request.getRemoteAddr(), 120);
    return service.search(q, genre, language, maxMinutes, fromYear, toYear, page);
  }

  public record SearchRecord(@NotBlank @Size(max = 300) String query) {}

  @PostMapping("/history/{profile}")
  public void remember(
      @PathVariable UUID profile,
      @jakarta.validation.Valid @RequestBody SearchRecord body,
      Authentication a) {
    profiles.requireOwner(profile, a.getName());
    db.update(
        "INSERT INTO search_history(id,profile_id,query) VALUES (?,?,?)",
        UUID.randomUUID(),
        profile,
        body.query());
    db.update(
        "DELETE FROM search_history WHERE profile_id=? AND id NOT IN (SELECT id FROM search_history"
            + " WHERE profile_id=? ORDER BY created_at DESC LIMIT 50)",
        profile,
        profile);
  }
}
