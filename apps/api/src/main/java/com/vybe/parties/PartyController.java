package com.vybe.parties;

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
@RequestMapping("/api/parties")
public class PartyController {
  private final PartyService service;
  private final JdbcTemplate db;
  private final PartyBus bus;

  public PartyController(PartyService service, JdbcTemplate db, PartyBus bus) {
    this.service = service;
    this.db = db;
    this.bus = bus;
  }

  @GetMapping
  public List<Map<String, Object>> list(@RequestParam UUID profile, Authentication a) {
    service.owned(profile, a.getName());
    return db.queryForList(
        "SELECT r.id,r.name,r.expires_at AS \"expiresAt\" FROM watch_parties r JOIN party_members m"
            + " ON m.room_id=r.id WHERE m.profile_id=? AND r.expires_at>now() ORDER BY r.created_at"
            + " DESC LIMIT 50",
        profile);
  }

  @GetMapping("/{room}/preferences")
  public List<Integer> preferences(
      @PathVariable UUID room, @RequestParam UUID profile, Authentication a) {
    service.member(room, profile, a.getName());
    return db.queryForList(
        "SELECT genre_id FROM party_preferences WHERE room_id=? AND profile_id=?",
        Integer.class,
        room,
        profile);
  }

  @PostMapping("/{room}/invite")
  public Map<String, String> invite(
      @PathVariable UUID room, @RequestParam UUID profile, Authentication a) {
    return Map.of("invite", service.rotateInvite(room, profile, a.getName()));
  }

  public record Create(
      @NotNull UUID profile, @NotNull UUID asset, @NotBlank @Size(max = 80) String name) {}

  @PostMapping
  public Map<String, Object> create(@Valid @RequestBody Create body, Authentication a) {
    return service.create(body.profile(), body.asset(), body.name(), a.getName());
  }

  public record Join(@NotNull UUID profile, @NotBlank @Size(max = 100) String invite) {}

  @PostMapping("/{room}/join")
  public void join(@PathVariable UUID room, @Valid @RequestBody Join body, Authentication a) {
    service.join(room, body.profile(), body.invite(), a.getName());
  }

  @GetMapping("/{room}")
  public Map<String, Object> state(
      @PathVariable UUID room, @RequestParam UUID profile, Authentication a) {
    return service.state(room, profile, a.getName());
  }

  @GetMapping("/{room}/messages")
  public List<Map<String, Object>> messages(
      @PathVariable UUID room, @RequestParam UUID profile, Authentication a) {
    return service.messages(room, profile, a.getName());
  }

  @DeleteMapping("/{room}/membership")
  public void leave(@PathVariable UUID room, @RequestParam UUID profile, Authentication a) {
    service.leave(room, profile, a.getName());
  }

  public record Preferences(
      @NotNull UUID profile, @NotNull @Size(max = 5) List<@NotNull Integer> genres) {}

  @PutMapping("/{room}/preferences")
  @Transactional
  public void preferences(
      @PathVariable UUID room, @Valid @RequestBody Preferences body, Authentication a) {
    service.member(room, body.profile(), a.getName());
    db.update(
        "DELETE FROM party_preferences WHERE room_id=? AND profile_id=?", room, body.profile());
    for (Integer g : new HashSet<>(body.genres())) {
      if (!Boolean.TRUE.equals(
          db.queryForObject("SELECT EXISTS(SELECT 1 FROM genres WHERE id=?)", Boolean.class, g)))
        throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unknown genre.");
      db.update(
          "INSERT INTO party_preferences(room_id,profile_id,genre_id) VALUES (?,?,?)",
          room,
          body.profile(),
          g);
    }
  }

  public record Vote(@NotNull UUID profile, @Min(-1) @Max(1) int vote) {}

  @PutMapping("/{room}/votes/{content}")
  public void vote(
      @PathVariable UUID room,
      @PathVariable UUID content,
      @Valid @RequestBody Vote body,
      Authentication a) {
    service.member(room, body.profile(), a.getName());
    if (!Boolean.TRUE.equals(
        db.queryForObject(
            "SELECT EXISTS(SELECT 1 FROM content WHERE id=? AND published)",
            Boolean.class,
            content))) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Title not found.");
    db.update(
        "INSERT INTO party_votes(room_id,profile_id,content_id,vote) VALUES (?,?,?,?) ON"
            + " CONFLICT(room_id,profile_id,content_id) DO UPDATE SET vote=EXCLUDED.vote",
        room,
        body.profile(),
        content,
        body.vote());
  }

  @GetMapping("/{room}/match")
  public Map<String, Object> match(
      @PathVariable UUID room, @RequestParam UUID profile, Authentication a) {
    service.member(room, profile, a.getName());
    var candidates =
        db.queryForList(
            """
WITH individual AS (
 SELECT c.id,pm.profile_id,
  COALESCE((SELECT count(*)::float FROM party_preferences pp JOIN content_genres cg ON cg.genre_id=pp.genre_id AND cg.content_id=c.id WHERE pp.room_id=? AND pp.profile_id=pm.profile_id)/NULLIF((SELECT count(*) FROM party_preferences pp WHERE pp.room_id=? AND pp.profile_id=pm.profile_id),0),0.5)+COALESCE(v.vote,0)*0.5 AS satisfaction
 FROM content c CROSS JOIN party_members pm LEFT JOIN party_votes v ON v.room_id=pm.room_id AND v.profile_id=pm.profile_id AND v.content_id=c.id
 WHERE pm.room_id=? AND c.published AND c.kind='MOVIE' AND EXISTS(SELECT 1 FROM media_assets m WHERE m.content_id=c.id AND m.status='READY')
), ranked AS (SELECT id,MIN(satisfaction)*0.65+AVG(satisfaction)*0.35 AS score,MIN(satisfaction) AS lowest,COUNT(*) AS participants FROM individual GROUP BY id)
SELECT c.id,c.slug,c.title,c.artwork,r.score,r.lowest,r.participants,(SELECT m.id FROM media_assets m WHERE m.content_id=c.id AND m.status='READY' ORDER BY m.created_at DESC LIMIT 1) AS "assetId" FROM ranked r JOIN content c ON c.id=r.id ORDER BY r.score DESC,c.id LIMIT 12
""",
            room,
            room,
            room);
    return Map.of(
        "items",
        candidates,
        "explanation",
        "65% of the score protects the least satisfied participant; 35% reflects the group average."
            + " Every participant has equal weight.");
  }

  public record Select(@NotNull UUID profile, @NotNull UUID asset) {}

  @PostMapping("/{room}/selection")
  public void select(@PathVariable UUID room, @Valid @RequestBody Select body, Authentication a) {
    var state = service.member(room, body.profile(), a.getName());
    if (!body.profile().equals(state.get("owner_profile")))
      throw new ResponseStatusException(
          HttpStatus.FORBIDDEN, "Only the host can choose the final title.");
    if (!Boolean.TRUE.equals(
        db.queryForObject(
            "SELECT EXISTS(SELECT 1 FROM media_assets m JOIN content c ON c.id=m.content_id WHERE"
                + " m.id=? AND m.status='READY' AND c.published)",
            Boolean.class,
            body.asset())))
      throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Playable title not found.");
    db.update(
        "UPDATE watch_parties SET"
            + " asset_id=?,position_seconds=0,playing=false,version=version+1,updated_at=now()"
            + " WHERE id=?",
        body.asset(),
        room);
    service.broadcast(room, body.profile(), a.getName());
  }
}
