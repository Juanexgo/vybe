package com.vybe.events;

import io.micrometer.core.instrument.*;
import java.util.concurrent.atomic.AtomicLong;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
public class EventMetrics {
  private final JdbcTemplate db;
  private final AtomicLong pending = new AtomicLong(), failed = new AtomicLong();

  public EventMetrics(JdbcTemplate db, MeterRegistry registry) {
    this.db = db;
    Gauge.builder("vybe.events.pending", pending, AtomicLong::get)
        .description("Events waiting for Kafka delivery")
        .register(registry);
    Gauge.builder("vybe.events.retrying", failed, AtomicLong::get)
        .description("Pending events with delivery failures")
        .register(registry);
  }

  @Scheduled(fixedDelay = 30000)
  public void refresh() {
    pending.set(
        db.queryForObject(
            "SELECT count(*) FROM event_outbox WHERE published_at IS NULL", Long.class));
    failed.set(
        db.queryForObject(
            "SELECT count(*) FROM event_outbox WHERE published_at IS NULL AND last_error IS NOT"
                + " NULL",
            Long.class));
  }
}
