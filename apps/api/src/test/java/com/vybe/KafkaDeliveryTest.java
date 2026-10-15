package com.vybe;

import static org.awaitility.Awaitility.await;
import static org.junit.jupiter.api.Assertions.*;

import java.time.Duration;
import java.util.*;
import org.apache.kafka.clients.consumer.KafkaConsumer;
import org.apache.kafka.common.serialization.StringDeserializer;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.kafka.test.EmbeddedKafkaBroker;
import org.springframework.kafka.test.context.EmbeddedKafka;
import org.springframework.kafka.test.utils.KafkaTestUtils;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

@SpringBootTest(
    properties = {
      "vybe.kafka-enabled=true",
      "vybe.mail-enabled=false",
      "vybe.ai-url=http://127.0.0.1:1",
      "vybe.index-delay-ms=3600000"
    })
@EmbeddedKafka(
    partitions = 3,
    topics = {"vybe.events.v1", "vybe.events.v1.DLT"},
    bootstrapServersProperty = "spring.kafka.bootstrap-servers")
@org.springframework.test.annotation.DirtiesContext
class KafkaDeliveryTest {
  @DynamicPropertySource
  static void database(DynamicPropertyRegistry r) {
    PhaseOneIntegrationTest.database(r);
  }

  @Autowired JdbcTemplate db;
  @Autowired KafkaTemplate<String, String> kafka;
  @Autowired EmbeddedKafkaBroker broker;

  @Test
  void outboxReachesRealBrokerAndDuplicateEventsAreCountedOnce() throws Exception {
    UUID id = UUID.randomUUID();
    db.update(
        "INSERT INTO event_outbox(id,type,aggregate_id,payload) VALUES"
            + " (?,'verification.completed',?,'{}'::jsonb)",
        id,
        id.toString());
    await()
        .atMost(Duration.ofSeconds(40))
        .until(
            () ->
                db.queryForObject(
                        "SELECT count(*) FROM event_inbox WHERE event_id=?", Integer.class, id)
                    == 1);
    await()
        .atMost(Duration.ofSeconds(10))
        .until(
            () ->
                db.queryForObject(
                    "SELECT published_at IS NOT NULL FROM event_outbox WHERE id=?",
                    Boolean.class,
                    id));
    long before =
        db.queryForObject(
            "SELECT total FROM event_counts WHERE type='verification.completed'", Long.class);
    kafka
        .send(
            "vybe.events.v1",
            id.toString(),
            "{\"id\":\"" + id + "\",\"version\":1,\"type\":\"verification.completed\"}")
        .get();
    UUID fence = UUID.randomUUID();
    kafka
        .send(
            "vybe.events.v1",
            id.toString(),
            "{\"id\":\"" + fence + "\",\"version\":1,\"type\":\"verification.fence\"}")
        .get();
    await()
        .atMost(Duration.ofSeconds(15))
        .until(
            () ->
                db.queryForObject(
                        "SELECT count(*) FROM event_inbox WHERE event_id=?", Integer.class, fence)
                    == 1);
    assertEquals(
        before,
        db.queryForObject(
            "SELECT total FROM event_counts WHERE type='verification.completed'", Long.class));
  }

  @Test
  void invalidSchemaIsRetriedThenDeliveredToDeadLetterTopic() throws Exception {
    var props = KafkaTestUtils.consumerProps("dlt-test-" + UUID.randomUUID(), "false", broker);
    props.put("auto.offset.reset", "earliest");
    try (var consumer =
        new KafkaConsumer<String, String>(
            props, new StringDeserializer(), new StringDeserializer())) {
      consumer.subscribe(List.of("vybe.events.v1.DLT"));
      String value = "{\"version\":999,\"id\":\"" + UUID.randomUUID() + "\"}";
      kafka.send("vybe.events.v1", "invalid", value).get();
      await()
          .atMost(Duration.ofSeconds(25))
          .until(
              () -> {
                for (var record : consumer.poll(Duration.ofMillis(500)))
                  if (record.value().equals(value)) return true;
                return false;
              });
    }
  }
}
