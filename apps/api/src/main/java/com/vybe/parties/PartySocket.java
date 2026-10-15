package com.vybe.parties;

import com.fasterxml.jackson.databind.*;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.*;
import org.springframework.web.socket.handler.ConcurrentWebSocketSessionDecorator;
import org.springframework.web.socket.handler.TextWebSocketHandler;
import org.springframework.web.socket.server.support.HttpSessionHandshakeInterceptor;
import org.springframework.web.util.UriComponentsBuilder;

@Component
public class PartySocket extends TextWebSocketHandler {
  private record Connection(
      WebSocketSession socket, UUID room, UUID profile, String actor, String sessionId) {}

  private final Map<String, Connection> connections = new ConcurrentHashMap<>();
  private final PartyService service;
  private final PartyBus bus;
  private final ObjectMapper json;
  private final JdbcTemplate db;

  public PartySocket(PartyService service, PartyBus bus, ObjectMapper json, JdbcTemplate db) {
    this.service = service;
    this.bus = bus;
    this.json = json;
    this.db = db;
    bus.listen(this::broadcast);
  }

  private boolean valid(Connection c) {
    return Boolean.TRUE.equals(
        db.queryForObject(
            "SELECT EXISTS(SELECT 1 FROM spring_session WHERE session_id=? AND expiry_time>? AND"
                + " principal_name=?)",
            Boolean.class,
            c.sessionId(),
            System.currentTimeMillis(),
            c.actor()));
  }

  @Override
  public void afterConnectionEstablished(WebSocketSession session) throws Exception {
    try {
      if (session.getPrincipal() == null) throw new IllegalArgumentException("Sign in first");
      var params = UriComponentsBuilder.fromUri(session.getUri()).build().getQueryParams();
      UUID room = UUID.fromString(params.getFirst("room")),
          profile = UUID.fromString(params.getFirst("profile"));
      String actor = session.getPrincipal().getName(),
          id =
              (String)
                  session
                      .getAttributes()
                      .get(HttpSessionHandshakeInterceptor.HTTP_SESSION_ID_ATTR_NAME);
      if (connections.values().stream().filter(c -> c.actor().equals(actor)).count() >= 5)
        throw new IllegalArgumentException("Too many connections");
      var c =
          new Connection(
              new ConcurrentWebSocketSessionDecorator(session, 5000, 65536),
              room,
              profile,
              actor,
              id);
      if (!valid(c)) throw new IllegalArgumentException("Session expired");
      service.member(room, profile, actor);
      session.setTextMessageSizeLimit(2048);
      connections.put(session.getId(), c);
      bus.present(room, profile);
      service.broadcast(room, profile, actor);
      send(c, "messages", service.messages(room, profile, actor));
    } catch (Exception e) {
      session.close(CloseStatus.POLICY_VIOLATION);
    }
  }

  @Override
  protected void handleTextMessage(WebSocketSession session, TextMessage message) throws Exception {
    var c = connections.get(session.getId());
    if (c == null || !valid(c)) {
      session.close(CloseStatus.POLICY_VIOLATION);
      return;
    }
    try {
      service.member(c.room(), c.profile(), c.actor());
      var body = json.readTree(message.getPayload());
      String type = body.path("type").asText();
      switch (type) {
        case "ping" -> {
          bus.present(c.room(), c.profile());
          send(
              c,
              "pong",
              Map.of(
                  "clientTime",
                  body.path("clientTime").asLong(),
                  "serverTime",
                  System.currentTimeMillis()));
          send(c, "state", service.state(c.room(), c.profile(), c.actor()));
        }
        case "sync" ->
            service.sync(
                c.room(),
                c.profile(),
                c.actor(),
                body.path("position").asDouble(-1),
                body.path("playing").asBoolean());
        case "chat", "reaction" ->
            service.chat(
                c.room(),
                c.profile(),
                c.actor(),
                UUID.fromString(body.path("id").asText()),
                body.path("text").asText(),
                type.equals("reaction"));
        default -> send(c, "error", Map.of("message", "Unsupported room command."));
      }
    } catch (Exception e) {
      send(
          c,
          "error",
          Map.of(
              "message",
              e instanceof org.springframework.web.server.ResponseStatusException r
                  ? Objects.toString(r.getReason(), "Room request failed.")
                  : "Room request failed. Reconnect and try again."));
    }
  }

  private void send(Connection c, String type, Object payload) throws Exception {
    c.socket()
        .sendMessage(
            new TextMessage(json.writeValueAsString(Map.of("type", type, "payload", payload))));
  }

  private void broadcast(String text) {
    try {
      var event = json.readTree(text);
      UUID room = UUID.fromString(event.path("room").asText());
      for (var c : connections.values())
        if (c.room().equals(room)) {
          try {
            if (!valid(c)) {
              c.socket().close(CloseStatus.POLICY_VIOLATION);
              continue;
            }
            if(!event.path("type").asText().equals("closed"))service.member(c.room(),c.profile(),c.actor());c.socket().sendMessage(new TextMessage(text));
          } catch (Exception e) {
            connections.remove(c.socket().getId());
          }
        }
    } catch (Exception e) {
      org.slf4j.LoggerFactory.getLogger(getClass())
          .warn("Invalid party event ignored ({})", e.getClass().getSimpleName());
    }
  }

  @Override
  public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
    connections.remove(session.getId());
  }

  @Scheduled(fixedDelay = 15000)
  public void expireSessions() {
    for (var c : connections.values()) {
      try {
        if (!valid(c)) {
          c.socket().close(CloseStatus.POLICY_VIOLATION);
          connections.remove(c.socket().getId());
        } else service.member(c.room(), c.profile(), c.actor());
      } catch (Exception e) {
        try {
          c.socket().close(CloseStatus.POLICY_VIOLATION);
        } catch (Exception ignored) {
          org.slf4j.LoggerFactory.getLogger(getClass()).debug("Party socket already closed");
        }
        connections.remove(c.socket().getId());
      }
    }
  }
}
