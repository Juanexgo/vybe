package com.vybe.parties;

import com.vybe.identity.IdentityService;
import com.vybe.media.MediaService;
import com.vybe.profiles.ProfileAccess;
import java.nio.charset.StandardCharsets;
import java.security.*;
import java.sql.Timestamp;
import java.time.*;
import java.util.*;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.server.ResponseStatusException;

@Service
public class PartyService {
  private final JdbcTemplate db;
  private final ProfileAccess profiles;
  private final MediaService media;
  private final PartyBus bus;
  private final IdentityService identity;
  private final TransactionTemplate tx;

  public PartyService(
      JdbcTemplate db,
      ProfileAccess profiles,
      MediaService media,
      PartyBus bus,
      IdentityService identity,
      TransactionTemplate tx) {
    this.db = db;
    this.profiles = profiles;
    this.media = media;
    this.bus = bus;
    this.identity = identity;
    this.tx = tx;
  }

  public void owned(UUID profile, String actor) {
    profiles.requireOwner(profile, actor);
  }

  public String rotateInvite(UUID room, UUID profile, String actor) {
    var r = member(room, profile, actor);
    if (!profile.equals(r.get("owner_profile")))
      throw new ResponseStatusException(
          HttpStatus.FORBIDDEN, "Only the host can create invitations.");
    byte[] random = new byte[32];
    new SecureRandom().nextBytes(random);
    String code = Base64.getUrlEncoder().withoutPadding().encodeToString(random);
    db.update("UPDATE watch_parties SET invite_hash=? WHERE id=?", hash(code), room);
    return code;
  }

  public String hash(String token) {
    try {
      return HexFormat.of()
          .formatHex(
              MessageDigest.getInstance("SHA-256").digest(token.getBytes(StandardCharsets.UTF_8)));
    } catch (Exception e) {
      throw new IllegalStateException(e);
    }
  }

  public Map<String, Object> create(UUID profile, UUID asset, String name, String actor) {
    profiles.requireOwner(profile, actor);
    media.playable(asset);
    identity.limit("party-create:" + actor, 20);
    UUID id = UUID.randomUUID();
    byte[] random = new byte[32];
    new SecureRandom().nextBytes(random);
    String code = Base64.getUrlEncoder().withoutPadding().encodeToString(random);
    tx.executeWithoutResult(
        s -> {
          db.update(
              "INSERT INTO watch_parties(id,owner_profile,asset_id,name,invite_hash,expires_at)"
                  + " VALUES (?,?,?,?,?,now()+interval '4 hours')",
              id,
              profile,
              asset,
              name.strip(),
              hash(code));
          db.update("INSERT INTO party_members(room_id,profile_id) VALUES (?,?)", id, profile);
        });
    return Map.of("id", id, "invite", code);
  }

  public void join(UUID room, UUID profile, String token, String actor) {
    profiles.requireOwner(profile, actor);
    identity.limit("party-join:" + actor, 60);
    tx.executeWithoutResult(
        s -> {
          var rows =
              db.queryForList(
                  "SELECT id FROM watch_parties WHERE id=? AND invite_hash=? AND expires_at>now()"
                      + " FOR UPDATE",
                  room,
                  hash(token));
          if (rows.isEmpty())
            throw new ResponseStatusException(
                HttpStatus.NOT_FOUND, "Invitation is invalid or expired.");
          boolean already =
              Boolean.TRUE.equals(
                  db.queryForObject(
                      "SELECT EXISTS(SELECT 1 FROM party_members WHERE room_id=? AND profile_id=?)",
                      Boolean.class,
                      room,
                      profile));
          if (!already
              && db.queryForObject(
                      "SELECT count(*) FROM party_members WHERE room_id=?", Integer.class, room)
                  >= 16)
            throw new ResponseStatusException(
                HttpStatus.CONFLICT, "This room has reached its 16-profile limit.");
          db.update(
              "INSERT INTO party_members(room_id,profile_id) VALUES (?,?) ON CONFLICT DO NOTHING",
              room,
              profile);
        });
  }

  public Map<String, Object> member(UUID room, UUID profile, String actor) {
    profiles.requireOwner(profile, actor);
    var rows =
        db.queryForList(
            "SELECT r.* FROM watch_parties r JOIN party_members m ON m.room_id=r.id WHERE r.id=?"
                + " AND m.profile_id=? AND r.expires_at>now()",
            room,
            profile);
    if (rows.isEmpty())
      throw new ResponseStatusException(
          HttpStatus.NOT_FOUND, "Room not found, membership missing or invitation expired.");
    media.playable((UUID) rows.getFirst().get("asset_id"));
    return rows.getFirst();
  }

  public Map<String, Object> state(UUID room, UUID profile, String actor) {
    var r = member(room, profile, actor);
    return snapshot(r);
  }

  public Map<String, Object> snapshot(Map<String, Object> r) {
    UUID room = (UUID) r.get("id"), asset = (UUID) r.get("asset_id");
    var m = media.playable(asset);
    double duration = ((Number) m.get("duration")).doubleValue(),
        position = ((Number) r.get("position_seconds")).doubleValue();
    long now = System.currentTimeMillis();
    if (Boolean.TRUE.equals(r.get("playing")))
      position += Math.max(0, now - ((Timestamp) r.get("updated_at")).getTime()) / 1000.0;
    Map<String, Object> result = new LinkedHashMap<>();
    result.put("id", room);
    result.put("assetId", asset);
    result.put("ownerProfile", r.get("owner_profile"));
    result.put("name", r.get("name"));
    result.put("position", Math.min(position, duration));
    result.put("playing", Boolean.TRUE.equals(r.get("playing")) && position < duration);
    result.put("version", r.get("version"));
    result.put("serverTime", now);
    result.put("expiresAt", r.get("expires_at"));
    var online = bus.online(room);
    var members =
        db.queryForList(
            "SELECT p.id,p.name,p.color FROM party_members m JOIN profiles p ON p.id=m.profile_id"
                + " WHERE m.room_id=? ORDER BY m.joined_at",
            room);
    for (var person : members) person.put("online", online.contains(person.get("id").toString()));
    result.put("members", members);
    return result;
  }

  public void sync(UUID room, UUID profile, String actor, double position, boolean playing) {
    var r = member(room, profile, actor);
    if (!profile.equals(r.get("owner_profile")))
      throw new ResponseStatusException(
          HttpStatus.FORBIDDEN, "Only the host can control shared playback.");
    if (!Double.isFinite(position) || position < 0)
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid playback position.");
    double duration =
        ((Number) media.playable((UUID) r.get("asset_id")).get("duration")).doubleValue();
    tx.executeWithoutResult(
        s ->
            db.update(
                "UPDATE watch_parties SET"
                    + " position_seconds=?,playing=?,updated_at=now(),version=version+1 WHERE id=?"
                    + " AND expires_at>now()",
                Math.min(position, duration),
                playing && position < duration,
                room));
    broadcast(room, profile, actor);
  }

  public void broadcast(UUID room, UUID profile, String actor) {
    var state = state(room, profile, actor);
    bus.cache(room, state);
    bus.publish(room, "state", state);
  }

  public List<Map<String, Object>> messages(UUID room, UUID profile, String actor) {
    member(room, profile, actor);
    return db.queryForList(
        "SELECT x.id,x.profile_id AS \"profileId\",p.name,x.text,x.kind,x.created_at AS"
            + " \"createdAt\" FROM (SELECT * FROM party_messages WHERE room_id=? ORDER BY"
            + " created_at DESC LIMIT 50) x JOIN profiles p ON p.id=x.profile_id ORDER BY"
            + " x.created_at",
        room);
  }

  public void chat(
      UUID room, UUID profile, String actor, UUID clientId, String text, boolean reaction) {
    member(room, profile, actor);
    identity.limit("party-chat:" + profile, 300);
    if (text == null || text.isBlank() || text.length() > 500)
      throw new ResponseStatusException(
          HttpStatus.BAD_REQUEST, "Messages must contain 1–500 characters.");
    if (reaction && !Set.of("❤️", "😂", "👏", "😮", "🔥").contains(text))
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unsupported reaction.");
    db.update(
        "INSERT INTO party_messages(id,room_id,profile_id,client_id,text,kind) VALUES (?,?,?,?,?,?)"
            + " ON CONFLICT(room_id,profile_id,client_id) DO NOTHING",
        UUID.randomUUID(),
        room,
        profile,
        clientId,
        text.strip(),
        reaction ? "REACTION" : "CHAT");
    bus.publish(room, "messages", messages(room, profile, actor));
  }

  public void leave(UUID room, UUID profile, String actor) {
    var r = member(room, profile, actor);
    if (profile.equals(r.get("owner_profile"))) {
      db.update("UPDATE watch_parties SET expires_at=now(),playing=false WHERE id=?", room);
      bus.publish(room, "closed", Map.of("reason", "The host ended the room."));
    } else {
      db.update("DELETE FROM party_members WHERE room_id=? AND profile_id=?", room, profile);
      bus.publish(room, "membership", Map.of("left", profile));
    }
  }

  @Scheduled(fixedDelay = 15000)
  public void pauseDisconnectedHosts() {
    try {
      for (var r :
          db.queryForList("SELECT * FROM watch_parties WHERE playing AND expires_at>now()")) {
        UUID room = (UUID) r.get("id"), owner = (UUID) r.get("owner_profile");
        if (!bus.online(room).contains(owner.toString())) {
          var state = snapshot(r);
          db.update(
              "UPDATE watch_parties SET"
                  + " position_seconds=?,playing=false,version=version+1,updated_at=now() WHERE"
                  + " id=? AND version=?",
              state.get("position"),
              room,
              r.get("version"));
          var updated = db.queryForMap("SELECT * FROM watch_parties WHERE id=?", room);
          bus.publish(room, "state", snapshot(updated));
        }
      }
    } catch (Exception e) {
      org.slf4j.LoggerFactory.getLogger(getClass())
          .warn("Party host-presence check unavailable ({})", e.getClass().getSimpleName());
    }
  }
}
