package com.vybe.events;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class EventConsumer {
  private final JdbcTemplate db;
  private final ObjectMapper json;

  public EventConsumer(JdbcTemplate db, ObjectMapper json) {
    this.db = db;
    this.json = json;
  }

  @Transactional
  public void accept(String value) throws Exception {
    var e = json.readTree(value);
    if (e.path("version").asInt() != 1
        || !e.path("type").asText().matches("[a-z]+(?:\\.[a-z]+){1,3}"))
      throw new IllegalArgumentException("Unsupported event schema");
    UUID id = UUID.fromString(e.path("id").asText());
    String type = e.path("type").asText();
    int added =
        db.update(
            "INSERT INTO event_inbox(event_id,type) VALUES (?,?) ON CONFLICT DO NOTHING", id, type);
    if (added == 1)
      db.update(
          "INSERT INTO event_counts(type,total) VALUES (?,1) ON CONFLICT(type) DO UPDATE SET"
              + " total=event_counts.total+1,updated_at=now()",
          type);
  }
}
