package com.vybe.events;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.*;
import java.util.concurrent.TimeUnit;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;

@Component
@ConditionalOnProperty(name = "vybe.kafka-enabled", havingValue = "true")
public class KafkaEvents {
  public static final String TOPIC = "vybe.events.v1";
  private final JdbcTemplate db;
  private final TransactionTemplate tx;
  private final KafkaTemplate<String, String> kafka;
  private final ObjectMapper json;
  private final EventConsumer consumer;

  public KafkaEvents(
      JdbcTemplate db,
      TransactionTemplate tx,
      KafkaTemplate<String, String> kafka,
      ObjectMapper json,
      EventConsumer consumer) {
    this.db = db;
    this.tx = tx;
    this.kafka = kafka;
    this.json = json;
    this.consumer = consumer;
  }

  @Scheduled(fixedDelay = 2000, initialDelay = 5000)
  public void deliver() {
    var batch =
        tx.execute(
            s ->
                db.queryForList(
                    "UPDATE event_outbox SET lease_until=now()+interval '3"
                        + " minutes',attempts=attempts+1 WHERE id IN (SELECT id FROM event_outbox"
                        + " WHERE published_at IS NULL AND available_at<=now() AND (lease_until IS"
                        + " NULL OR lease_until<now()) ORDER BY created_at LIMIT 20 FOR UPDATE SKIP"
                        + " LOCKED) RETURNING *"));
    for (var row : Objects.requireNonNull(batch)) {
      try {
        String event =
            json.writeValueAsString(
                Map.of(
                    "id",
                    row.get("id"),
                    "version",
                    1,
                    "type",
                    row.get("type"),
                    "aggregateId",
                    row.get("aggregate_id"),
                    "correlationId",
                    row.get("correlation_id"),
                    "occurredAt",
                    row.get("created_at").toString(),
                    "payload",
                    json.readTree(row.get("payload").toString())));
        kafka.send(TOPIC, row.get("aggregate_id").toString(), event).get(12, TimeUnit.SECONDS);
        db.update(
            "UPDATE event_outbox SET published_at=now(),lease_until=NULL,last_error=NULL WHERE"
                + " id=?",
            row.get("id"));
      } catch (Exception e) {
        if (e instanceof InterruptedException) Thread.currentThread().interrupt();
        db.update(
            "UPDATE event_outbox SET lease_until=NULL,available_at=now()+interval '30"
                + " seconds',last_error=? WHERE id=?",
            e.getClass().getSimpleName(),
            row.get("id"));
        org.slf4j.LoggerFactory.getLogger(getClass())
            .warn(
                "Event delivery deferred id={} reason={}",
                row.get("id"),
                e.getClass().getSimpleName());
      }
    }
  }

  @KafkaListener(topics = TOPIC)
  public void receive(String value) throws Exception {
    consumer.accept(value);
  }
}
