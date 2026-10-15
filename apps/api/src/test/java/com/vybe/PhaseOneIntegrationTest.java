package com.vybe;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.vybe.identity.IdentityService;
import jakarta.servlet.http.Cookie;
import java.nio.file.*;
import java.util.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.testcontainers.containers.PostgreSQLContainer;

@SpringBootTest(
    properties = {
      "vybe.mail-enabled=false",
      "vybe.ai-url=http://127.0.0.1:1",
      "vybe.index-delay-ms=3600000"
    })
@AutoConfigureMockMvc
class PhaseOneIntegrationTest {
  static PostgreSQLContainer<?> postgres;
  static org.testcontainers.containers.GenericContainer<?> redis;

  @DynamicPropertySource
  static void database(DynamicPropertyRegistry r) {
    String url = System.getenv("TEST_DATABASE_URL");
    if (url == null) {
      postgres =
          new PostgreSQLContainer<>(
              org.testcontainers.utility.DockerImageName.parse("pgvector/pgvector:pg17")
                  .asCompatibleSubstituteFor("postgres"));
      postgres.start();
      redis =
          new org.testcontainers.containers.GenericContainer<>("redis:7.4-alpine")
              .withExposedPorts(6379);
      redis.start();
      r.add("spring.data.redis.host", redis::getHost);
      r.add("spring.data.redis.port", () -> redis.getMappedPort(6379));
      r.add("spring.datasource.url", postgres::getJdbcUrl);
      r.add("spring.datasource.username", postgres::getUsername);
      r.add("spring.datasource.password", postgres::getPassword);
    } else {
      if (!url.endsWith("/vybe_test"))
        throw new IllegalStateException("External tests require a dedicated vybe_test database");
      r.add("spring.datasource.url", () -> url);
      r.add(
          "spring.datasource.username",
          () -> System.getenv().getOrDefault("TEST_DATABASE_USER", "vybe"));
      r.add(
          "spring.datasource.password",
          () -> System.getenv().getOrDefault("TEST_DATABASE_PASSWORD", "vybe_local"));
    }
  }

  @Autowired MockMvc mvc;
  @Autowired JdbcTemplate db;
  @Autowired IdentityService identity;

  @BeforeEach
  void reset() throws Exception {
    db.execute(
        "TRUNCATE"
            + " users,content,genres,people,collections,mail_outbox,rate_limits,audit_logs,spring_session"
            + " RESTART IDENTITY CASCADE");
    db.execute(Files.readString(Path.of("../../infrastructure/scripts/seed-demo.sql")));
  }

  String json(String email) {
    return "{\"email\":\""
        + email
        + "\",\"password\":\"correct-horse-test-47\",\"name\":\"Taylor\"}";
  }

  String token(String email, String purpose) {
    String body =
        db.queryForObject(
            "SELECT body FROM mail_outbox WHERE recipient=? ORDER BY created_at DESC LIMIT 1",
            String.class,
            email);
    assertNotNull(body);
    return body.split("#token=")[1].split("\\n")[0];
  }

  void verified(String email) {
    identity.register(email, "correct-horse-test-47", "Taylor");
    identity.redeem(token(email, "VERIFY"), "VERIFY", null);
  }

  @Test
  void registrationVerificationSessionAndReset() throws Exception {
    mvc.perform(
            post("/api/auth/register")
                .with(csrf())
                .contentType("application/json")
                .content(json("hello@example.test")))
        .andExpect(status().isOk());
    assertFalse(
        db.queryForObject("SELECT password_hash FROM users", String.class)
            .contains("correct-horse"));
    mvc.perform(
            post("/api/auth/login")
                .with(csrf())
                .contentType("application/json")
                .content(json("hello@example.test")))
        .andExpect(status().isForbidden());
    String token = token("hello@example.test", "VERIFY");
    mvc.perform(
            post("/api/auth/verify")
                .with(csrf())
                .contentType("application/json")
                .content("{\"token\":\"" + token + "\"}"))
        .andExpect(status().isOk());
    mvc.perform(
            post("/api/auth/verify")
                .with(csrf())
                .contentType("application/json")
                .content("{\"token\":\"" + token + "\"}"))
        .andExpect(status().isBadRequest());
    var response =
        mvc.perform(
                post("/api/auth/login")
                    .with(csrf())
                    .contentType("application/json")
                    .content(json("hello@example.test")))
            .andExpect(status().isOk())
            .andReturn()
            .getResponse();
    Cookie session = response.getCookie("VYBE_SESSION");
    assertNotNull(session);
    assertTrue(session.isHttpOnly());
    mvc.perform(get("/api/auth/me").cookie(session))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.email").value("hello@example.test"));
    identity.forgot("hello@example.test");
    identity.redeem(token("hello@example.test", "RESET"), "RESET", "a-new-correct-password-99");
    mvc.perform(get("/api/auth/me").cookie(session)).andExpect(status().isUnauthorized());
    mvc.perform(
            post("/api/auth/login")
                .with(csrf())
                .contentType("application/json")
                .content(json("hello@example.test")))
        .andExpect(status().isUnauthorized());
  }

  @Test
  void validatesInputAndRequiresCsrf() throws Exception {
    mvc.perform(
            post("/api/auth/register")
                .contentType("application/json")
                .content(json("a@example.test")))
        .andExpect(status().isForbidden());
    mvc.perform(
            post("/api/auth/register")
                .with(csrf())
                .contentType("application/json")
                .content("{\"email\":\"not-mail\",\"password\":\"weak\",\"name\":\"\"}"))
        .andExpect(status().isBadRequest());
    mvc.perform(get("/api/admin/content")).andExpect(status().isUnauthorized());
    mvc.perform(get("/api/auth/csrf"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.token").isNotEmpty());
  }

  @Test
  void filtersCatalogAndExcludesDrafts() throws Exception {
    mvc.perform(get("/api/catalog").param("q", "dragon"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.total").value(1))
        .andExpect(jsonPath("$.items[0].slug").value("sintel"));
    mvc.perform(get("/api/catalog").param("genre", "Science fiction"))
        .andExpect(jsonPath("$.total").value(2));
    mvc.perform(get("/api/catalog").param("q", "%' OR 1=1 --"))
        .andExpect(jsonPath("$.total").value(0));
    mvc.perform(get("/api/catalog").param("kind", "SERIES"))
        .andExpect(jsonPath("$.total").value(0));
    mvc.perform(get("/api/catalog").param("page", "-1")).andExpect(status().isBadRequest());
    db.update("UPDATE content SET published=false WHERE slug='sintel'");
    mvc.perform(get("/api/catalog/sintel")).andExpect(status().isNotFound());
    mvc.perform(get("/api/catalog/spring"))
        .andExpect(jsonPath("$.credits[0].name").value("Andy Goralczyk"));
  }

  @Test
  @WithMockUser(username = "owner@example.test")
  void watchlistIsIdempotentAndOwnerScoped() throws Exception {
    verified("owner@example.test");
    verified("other@example.test");
    UUID mine =
        db.queryForObject(
            "SELECT p.id FROM profiles p JOIN users u ON u.id=p.user_id WHERE"
                + " email='owner@example.test'",
            UUID.class);
    UUID other =
        db.queryForObject(
            "SELECT p.id FROM profiles p JOIN users u ON u.id=p.user_id WHERE"
                + " email='other@example.test'",
            UUID.class);
    UUID content = db.queryForObject("SELECT id FROM content WHERE slug='spring'", UUID.class);
    String path = "/api/profiles/" + mine + "/library/" + content;
    for (int i = 0; i < 2; i++) mvc.perform(put(path).with(csrf())).andExpect(status().isOk());
    mvc.perform(get("/api/profiles/" + mine + "/library"))
        .andExpect(jsonPath("$.length()").value(1));
    mvc.perform(put("/api/profiles/" + other + "/library/" + content).with(csrf()))
        .andExpect(status().isNotFound());
    mvc.perform(delete(path).with(csrf())).andExpect(status().isOk());
    mvc.perform(get("/api/profiles/" + mine + "/library"))
        .andExpect(jsonPath("$.length()").value(0));
  }

  @Test
  @WithMockUser(username = "viewer@example.test")
  void normalUsersCannotPublish() throws Exception {
    mvc.perform(get("/api/admin/content")).andExpect(status().isForbidden());
    UUID id = db.queryForObject("SELECT id FROM content LIMIT 1", UUID.class);
    mvc.perform(
            patch("/api/admin/content/" + id + "/visibility")
                .with(csrf())
                .contentType("application/json")
                .content("{\"published\":false}"))
        .andExpect(status().isForbidden());
  }

  @Test
  @WithMockUser(username = "manager@example.test", roles = "CONTENT_MANAGER")
  void managersCanPublishAndAudit() throws Exception {
    UUID id = db.queryForObject("SELECT id FROM content WHERE slug='spring'", UUID.class);
    mvc.perform(
            patch("/api/admin/content/" + id + "/visibility")
                .with(csrf())
                .contentType("application/json")
                .content("{\"published\":false}"))
        .andExpect(status().isOk());
    mvc.perform(get("/api/catalog/spring")).andExpect(status().isNotFound());
    assertEquals(
        1,
        db.queryForObject(
            "SELECT count(*) FROM audit_logs WHERE action='catalog.unpublished'", Integer.class));
  }

  @Test
  void rateLimitsPersistAndExpiredTokensFail() {
    for (int i = 0; i < 3; i++) identity.limit("test-limit", 3);
    assertThrows(
        org.springframework.web.server.ResponseStatusException.class,
        () -> identity.limit("test-limit", 3));
    identity.register("expired@example.test", "correct-horse-test-47", "Expired");
    String token = token("expired@example.test", "VERIFY");
    db.update("UPDATE auth_tokens SET expires_at=now()-interval '1 second'");
    assertThrows(
        org.springframework.web.server.ResponseStatusException.class,
        () -> identity.redeem(token, "VERIFY", null));
  }

  @Test
  @WithMockUser(username = "profiles@example.test")
  void profileLimitIsEnforced() throws Exception {
    verified("profiles@example.test");
    for (int i = 1; i <= 4; i++)
      mvc.perform(
              post("/api/profiles")
                  .with(csrf())
                  .contentType("application/json")
                  .content("{\"name\":\"Profile " + i + "\",\"color\":\"#aabbcc\"}"))
          .andExpect(status().isOk());
    mvc.perform(
            post("/api/profiles")
                .with(csrf())
                .contentType("application/json")
                .content("{\"name\":\"Too many\",\"color\":\"#aabbcc\"}"))
        .andExpect(status().isConflict());
  }

  @Test
  @WithMockUser(username = "manager@example.test", roles = "CONTENT_MANAGER")
  void metadataDraftCreateEditPublishAndOpenApi() throws Exception {
    String body =
        """
{"slug":"test-film","title":"Test Film","kind":"MOVIE","synopsis":"A test catalog entry.","releaseYear":2026,"durationMinutes":10,"language":"English","rating":"Unrated","artwork":"/art/spring.svg","accent":"#365643","attribution":"Test-only metadata","sourceUrl":"https://example.test/film","genres":["Drama"]}
""";
    mvc.perform(
            post("/api/admin/content").with(csrf()).contentType("application/json").content(body))
        .andExpect(status().isOk());
    UUID id = db.queryForObject("SELECT id FROM content WHERE slug='test-film'", UUID.class);
    mvc.perform(get("/api/catalog/test-film")).andExpect(status().isNotFound());
    mvc.perform(
            put("/api/admin/content/" + id)
                .with(csrf())
                .contentType("application/json")
                .content(body.replace("A test catalog entry.", "An updated catalog entry.")))
        .andExpect(status().isOk());
    mvc.perform(
            patch("/api/admin/content/" + id + "/visibility")
                .with(csrf())
                .contentType("application/json")
                .content("{\"published\":true}"))
        .andExpect(status().isOk());
    mvc.perform(get("/api/catalog/test-film"))
        .andExpect(jsonPath("$.synopsis").value("An updated catalog entry."));
    mvc.perform(get("/v3/api-docs")).andExpect(status().isForbidden());
  }

  @Test
  @WithMockUser(roles = "ADMIN")
  void openApiDescribesActualRoutes() throws Exception {
    mvc.perform(get("/v3/api-docs"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.paths['/api/catalog']").exists());
  }

  @Test
  void verificationCanBeResentAndUnicodeByteLimitIsEnforced() {
    identity.register("resend@example.test", "correct-horse-test-47", "Viewer");
    String old = token("resend@example.test", "VERIFY");
    identity.resend("resend@example.test");
    assertThrows(
        org.springframework.web.server.ResponseStatusException.class,
        () -> identity.redeem(old, "VERIFY", null));
    identity.redeem(token("resend@example.test", "VERIFY"), "VERIFY", null);
    assertThrows(
        org.springframework.web.server.ResponseStatusException.class,
        () -> identity.register("unicode@example.test", "🔐".repeat(24), "Viewer"));
  }

  @Test
  @WithMockUser(username = "playback@example.test")
  void playbackProgressIsPersistedClampedAndOwnerScoped() throws Exception {
    verified("playback@example.test");
    verified("other-viewer@example.test");
    UUID profile =
        db.queryForObject(
            "SELECT p.id FROM profiles p JOIN users u ON u.id=p.user_id WHERE"
                + " u.email='playback@example.test'",
            UUID.class);
    UUID other =
        db.queryForObject(
            "SELECT p.id FROM profiles p JOIN users u ON u.id=p.user_id WHERE"
                + " u.email='other-viewer@example.test'",
            UUID.class);
    UUID content = db.queryForObject("SELECT id FROM content WHERE slug='spring'", UUID.class),
        asset = UUID.randomUUID();
    db.update(
        "INSERT INTO"
            + " media_assets(id,content_id,original_key,content_type,source_bytes,status,manifest_key,duration_seconds)"
            + " VALUES (?,?,?,'video/mp4',10,'READY','hls/test/master.m3u8',60)",
        asset,
        content,
        "originals/" + asset);
    mvc.perform(get("/api/playback/" + asset).param("profile", other.toString()))
        .andExpect(status().isNotFound());
    var result =
        mvc.perform(
                post("/api/playback/" + asset + "/sessions")
                    .with(csrf())
                    .contentType("application/json")
                    .content("{\"profile\":\"" + profile + "\"}"))
            .andExpect(status().isOk())
            .andReturn();
    String id =
        new com.fasterxml.jackson.databind.ObjectMapper()
            .readTree(result.getResponse().getContentAsString())
            .get("id")
            .asText();
    mvc.perform(
            put("/api/playback/sessions/" + id)
                .with(csrf())
                .contentType("application/json")
                .content("{\"position\":999,\"ended\":true}"))
        .andExpect(status().isOk());
    assertEquals(
        60.0,
        db.queryForObject(
            "SELECT position_seconds FROM watch_progress WHERE profile_id=?",
            Double.class,
            profile));
    assertTrue(
        db.queryForObject(
            "SELECT completed FROM watch_progress WHERE profile_id=?", Boolean.class, profile));
    mvc.perform(get("/api/playback/" + asset).param("profile", profile.toString()))
        .andExpect(jsonPath("$.position").value(60));
    db.update("UPDATE content SET published=false WHERE id=?", content);
    mvc.perform(get("/api/playback/" + asset).param("profile", profile.toString()))
        .andExpect(status().isNotFound());
  }

  @Test
  @WithMockUser(roles = "ADMIN")
  void invalidMediaAndMissingCsrfAreRejectedBeforeStorage() throws Exception {
    UUID id = db.queryForObject("SELECT id FROM content WHERE slug='spring'", UUID.class);
    var file =
        new org.springframework.mock.web.MockMultipartFile(
            "file", "bad.txt", "text/plain", "not a video".getBytes());
    mvc.perform(multipart("/api/admin/media/" + id).file(file)).andExpect(status().isForbidden());
    mvc.perform(multipart("/api/admin/media/" + id).file(file).with(csrf()))
        .andExpect(status().isUnsupportedMediaType());
    assertEquals(0, db.queryForObject("SELECT count(*) FROM media_assets", Integer.class));
  }

  @Test
  @WithMockUser(username = "taste@example.test")
  void recommendationPreferencesFeedbackAndResetAreOwnerScoped() throws Exception {
    verified("taste@example.test");
    verified("stranger@example.test");
    UUID p =
        db.queryForObject(
            "SELECT p.id FROM profiles p JOIN users u ON u.id=p.user_id WHERE"
                + " u.email='taste@example.test'",
            UUID.class);
    UUID other =
        db.queryForObject(
            "SELECT p.id FROM profiles p JOIN users u ON u.id=p.user_id WHERE"
                + " u.email='stranger@example.test'",
            UUID.class);
    int genre =
        db.queryForObject("SELECT id FROM genres WHERE name='Science fiction'", Integer.class);
    mvc.perform(
            put("/api/profiles/" + p + "/preferences")
                .with(csrf())
                .contentType("application/json")
                .content("{\"genreId\":" + genre + ",\"weight\":3}"))
        .andExpect(status().isOk());
    mvc.perform(get("/api/profiles/" + p + "/recommendations"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.items[0].slug").value("tears-of-steel"));
    UUID title =
        db.queryForObject("SELECT id FROM content WHERE slug='tears-of-steel'", UUID.class);
    mvc.perform(
            put("/api/profiles/" + p + "/recommendations/" + title)
                .with(csrf())
                .contentType("application/json")
                .content("{\"hidden\":true}"))
        .andExpect(status().isOk());
    mvc.perform(get("/api/profiles/" + p + "/recommendations"))
        .andExpect(jsonPath("$.items[?(@.slug == 'tears-of-steel')]").isEmpty());
    mvc.perform(get("/api/profiles/" + other + "/recommendations"))
        .andExpect(status().isNotFound());
    mvc.perform(post("/api/profiles/" + p + "/recommendations/reset").with(csrf()))
        .andExpect(status().isOk());
    assertEquals(
        0,
        db.queryForObject(
            "SELECT count(*) FROM recommendation_feedback WHERE profile_id=?", Integer.class, p));
    mvc.perform(
            put("/api/profiles/" + p + "/ratings/" + title)
                .with(csrf())
                .contentType("application/json")
                .content("{\"score\":6}"))
        .andExpect(status().isBadRequest());
  }

  @Test
  void intelligentSearchFallsBackWithoutInventingTitles() throws Exception {
    mvc.perform(get("/api/discovery/search").param("q", "dragon"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.semanticAvailable").value(false))
        .andExpect(jsonPath("$.items[0].slug").value("sintel"));
    mvc.perform(get("/api/discovery/search").param("q", "zzxnonexistentzz"))
        .andExpect(jsonPath("$.total").value(0));
    mvc.perform(get("/api/discovery/search").param("maxMinutes", "1"))
        .andExpect(jsonPath("$.total").value(0));
    mvc.perform(get("/api/discovery/search").param("page", "-1"))
        .andExpect(status().isBadRequest());
  }

  @Test
  @WithMockUser(username = "episode@example.test", roles = "ADMIN")
  void episodesCanBeManagedAndHistoryIsProfileScoped() throws Exception {
    verified("episode@example.test");
    UUID p = db.queryForObject("SELECT id FROM profiles LIMIT 1", UUID.class);
    String body =
        """
{"slug":"episode-series","title":"Series Test","kind":"SERIES","synopsis":"A series for integration verification.","releaseYear":2026,"durationMinutes":20,"language":"English","rating":"Unrated","artwork":"/art/spring.svg","accent":"#365643","attribution":"Test fixture","sourceUrl":"https://example.test/series","genres":["Drama"]}
""";
    mvc.perform(
            post("/api/admin/content").with(csrf()).contentType("application/json").content(body))
        .andExpect(status().isOk());
    UUID c = db.queryForObject("SELECT id FROM content WHERE slug='episode-series'", UUID.class);
    mvc.perform(
            post("/api/admin/content/" + c + "/episodes")
                .with(csrf())
                .contentType("application/json")
                .content(
                    "{\"season\":1,\"number\":1,\"title\":\"Pilot\",\"synopsis\":\"An opening"
                        + " chapter.\",\"durationMinutes\":20}"))
        .andExpect(status().isOk());
    mvc.perform(get("/api/admin/content/" + c + "/episodes"))
        .andExpect(jsonPath("$[0].title").value("Pilot"));
    UUID episode = db.queryForObject("SELECT id FROM episodes LIMIT 1", UUID.class),
        asset = UUID.randomUUID();
    db.update("UPDATE content SET published=true WHERE id=?", c);
    db.update(
        "INSERT INTO"
            + " media_assets(id,content_id,episode_id,original_key,content_type,source_bytes,status,manifest_key,duration_seconds)"
            + " VALUES (?,?,?,?,'video/mp4',10,'READY','hls/test/master.m3u8',60)",
        asset,
        c,
        episode,
        "originals/" + asset);
    db.update(
        "INSERT INTO asset_progress(profile_id,asset_id,position_seconds) VALUES (?,?,15)",
        p,
        asset);
    mvc.perform(get("/api/catalog/episode-series"))
        .andExpect(jsonPath("$.playableAssetId").isEmpty())
        .andExpect(jsonPath("$.episodes[0].playableAssetId").value(asset.toString()));
    mvc.perform(
            get("/api/playback/history").param("profile", p.toString()).param("unfinished", "true"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$[0].episodeTitle").value("Pilot"));
    mvc.perform(delete("/api/playback/history").param("profile", p.toString()).with(csrf()))
        .andExpect(status().isOk());
    mvc.perform(get("/api/playback/history").param("profile", p.toString()))
        .andExpect(jsonPath("$.length()").value(0));
  }

  @Autowired com.vybe.parties.PartyService parties;

  @Test
  @WithMockUser(username = "host@example.test")
  void roomsRequireInvitesEnforceHostAndDeduplicateMessages() throws Exception {
    verified("host@example.test");
    verified("guest@example.test");
    UUID
        host =
            db.queryForObject(
                "SELECT p.id FROM profiles p JOIN users u ON u.id=p.user_id WHERE"
                    + " u.email='host@example.test'",
                UUID.class),
        guest =
            db.queryForObject(
                "SELECT p.id FROM profiles p JOIN users u ON u.id=p.user_id WHERE"
                    + " u.email='guest@example.test'",
                UUID.class);
    UUID title = db.queryForObject("SELECT id FROM content WHERE slug='spring'", UUID.class),
        asset = UUID.randomUUID();
    db.update(
        "INSERT INTO"
            + " media_assets(id,content_id,original_key,content_type,source_bytes,status,manifest_key,duration_seconds)"
            + " VALUES (?,?,?,'video/mp4',10,'READY','hls/test/master.m3u8',60)",
        asset,
        title,
        "originals/" + asset);
    var created = parties.create(host, asset, "Test room", "host@example.test");
    UUID room = (UUID) created.get("id");
    assertThrows(
        org.springframework.web.server.ResponseStatusException.class,
        () -> parties.join(room, guest, "wrong", "guest@example.test"));
    parties.join(room, guest, (String) created.get("invite"), "guest@example.test");
    assertThrows(
        org.springframework.web.server.ResponseStatusException.class,
        () -> parties.sync(room, guest, "guest@example.test", 10, true));
    parties.sync(room, host, "host@example.test", 12, false);
    assertEquals(
        12.0,
        ((Number) parties.state(room, guest, "guest@example.test").get("position")).doubleValue());
    UUID nonce = UUID.randomUUID();
    parties.chat(room, guest, "guest@example.test", nonce, "Hello", false);
    parties.chat(room, guest, "guest@example.test", nonce, "Hello", false);
    assertEquals(1, parties.messages(room, host, "host@example.test").size());
    mvc.perform(get("/api/parties/" + room + "/match").param("profile", host.toString()))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.items[0].assetId").value(asset.toString()));
    parties.leave(room, host, "host@example.test");
    assertThrows(
        org.springframework.web.server.ResponseStatusException.class,
        () -> parties.state(room, guest, "guest@example.test"));
  }

  @Test
  @WithMockUser(username = "lists@example.test")
  void watchlistsKeepPersonalLibrarySeparateAndProtectLastProfile() throws Exception {
    verified("lists@example.test");
    verified("outsider@example.test");
    UUID
        p =
            db.queryForObject(
                "SELECT p.id FROM profiles p JOIN users u ON u.id=p.user_id WHERE"
                    + " u.email='lists@example.test'",
                UUID.class),
        other =
            db.queryForObject(
                "SELECT p.id FROM profiles p JOIN users u ON u.id=p.user_id WHERE"
                    + " u.email='outsider@example.test'",
                UUID.class),
        title = db.queryForObject("SELECT id FROM content WHERE slug='spring'", UUID.class);
    var made =
        mvc.perform(
                post("/api/watchlists")
                    .with(csrf())
                    .contentType("application/json")
                    .content("{\"profile\":\"" + p + "\",\"name\":\"Weekend\"}"))
            .andExpect(status().isOk())
            .andReturn();
    String list =
        new com.fasterxml.jackson.databind.ObjectMapper()
            .readTree(made.getResponse().getContentAsString())
            .get("id")
            .asText();
    mvc.perform(
            put("/api/watchlists/" + list + "/items/" + title)
                .param("profile", p.toString())
                .with(csrf()))
        .andExpect(status().isOk());
    mvc.perform(get("/api/watchlists/" + list).param("profile", other.toString()))
        .andExpect(status().isNotFound());
    mvc.perform(get("/api/profiles/" + p + "/library")).andExpect(jsonPath("$.length()").value(0));
    mvc.perform(delete("/api/profiles/" + p + "/library/" + title).with(csrf()))
        .andExpect(status().isOk());
    mvc.perform(get("/api/watchlists/" + list).param("profile", p.toString()))
        .andExpect(jsonPath("$.items.length()").value(1));
    mvc.perform(delete("/api/profiles/" + p).with(csrf())).andExpect(status().isConflict());
    mvc.perform(
            put("/api/profiles/" + other)
                .with(csrf())
                .contentType("application/json")
                .content("{\"name\":\"Changed\",\"color\":\"#112233\"}"))
        .andExpect(status().isNotFound());
  }

  @Test
  @WithMockUser(username = "admin-check@example.test", roles = "ADMIN")
  void lastAdministratorCannotBeDisabledAndMetricsUseRealRows() throws Exception {
    verified("admin-check@example.test");
    UUID id = identity.id("admin-check@example.test");
    db.update("INSERT INTO user_roles VALUES (?,'ADMIN')", id);
    mvc.perform(
            put("/api/admin/users/" + id)
                .with(csrf())
                .contentType("application/json")
                .content("{\"disabled\":true,\"roles\":[\"USER\"]}"))
        .andExpect(status().isConflict());
    mvc.perform(get("/api/admin/analytics"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.users").value(1))
        .andExpect(jsonPath("$.sessions").value(0));
  }

  @Test
  @WithMockUser(roles = "CONTENT_MANAGER")
  void contentManagersCannotChangeAccountPermissions() throws Exception {
    mvc.perform(get("/api/admin/users")).andExpect(status().isForbidden());
  }

  @Test
  @WithMockUser(username = "time@example.test")
  void seekingDoesNotInflateViewingTime() throws Exception {
    verified("time@example.test");
    UUID p = db.queryForObject("SELECT id FROM profiles LIMIT 1", UUID.class),
        c = db.queryForObject("SELECT id FROM content WHERE slug='spring'", UUID.class),
        asset = UUID.randomUUID(),
        session = UUID.randomUUID();
    db.update(
        "INSERT INTO"
            + " media_assets(id,content_id,original_key,content_type,source_bytes,status,manifest_key,duration_seconds)"
            + " VALUES (?,?,?,'video/mp4',10,'READY','hls/test/master.m3u8',600)",
        asset,
        c,
        "originals/" + asset);
    db.update(
        "INSERT INTO playback_sessions(id,profile_id,asset_id,last_seen_at) VALUES"
            + " (?,?,?,now()-interval '10 seconds')",
        session,
        p,
        asset);
    mvc.perform(
            put("/api/playback/sessions/" + session)
                .with(csrf())
                .contentType("application/json")
                .content("{\"position\":500,\"paused\":true}"))
        .andExpect(status().isOk());
    mvc.perform(get("/api/profiles/" + p + "/analytics"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.watchedSeconds").value(0));
    db.update(
        "UPDATE playback_sessions SET last_seen_at=now()-interval '10 seconds' WHERE id=?",
        session);
    mvc.perform(
            put("/api/playback/sessions/" + session)
                .with(csrf())
                .contentType("application/json")
                .content("{\"position\":509}"))
        .andExpect(status().isOk());
    mvc.perform(get("/api/profiles/" + p + "/analytics"))
        .andExpect(jsonPath("$.watchedSeconds").value(9));
  }
}
