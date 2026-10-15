package com.vybe.notifications;

import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mail.MailException;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Component
public class MailDelivery {
  private final JdbcTemplate db;
  private final JavaMailSender sender;
  private final String from;
  private final boolean enabled;

  public MailDelivery(
      JdbcTemplate db,
      JavaMailSender sender,
      @Value("${vybe.mail-from}") String from,
      @Value("${vybe.mail-enabled}") boolean enabled) {
    this.db = db;
    this.sender = sender;
    this.from = from;
    this.enabled = enabled;
  }

  @Scheduled(fixedDelay = 10000)
  @Transactional
  public void deliver() {
    if (!enabled) return;
    var pending =
        db.queryForList(
            "SELECT id,recipient,subject,body FROM mail_outbox WHERE sent_at IS NULL AND attempts<8"
                + " AND available_at<=now() ORDER BY created_at LIMIT 10 FOR UPDATE SKIP LOCKED");
    for (var row : pending) {
      try {
        var mail = new SimpleMailMessage();
        mail.setFrom(from);
        mail.setTo((String) row.get("recipient"));
        mail.setSubject((String) row.get("subject"));
        mail.setText((String) row.get("body"));
        sender.send(mail);
        db.update(
            "UPDATE mail_outbox SET sent_at=now(),body='[delivered]',attempts=attempts+1 WHERE"
                + " id=?",
            row.get("id"));
      } catch (MailException e) {
        db.update(
            "UPDATE mail_outbox SET attempts=attempts+1,available_at=now()+interval '1 minute' *"
                + " power(2,attempts) WHERE id=?",
            row.get("id"));
        LoggerFactory.getLogger(getClass())
            .warn(
                "Mail delivery failed for outbox {} ({})",
                row.get("id"),
                e.getClass().getSimpleName());
      }
    }
    db.update("DELETE FROM rate_limits WHERE expires_at<now()-interval '1 day'");
    db.update("DELETE FROM auth_tokens WHERE expires_at<now()");
    db.update("DELETE FROM mail_outbox WHERE created_at<now()-interval '7 days'");
  }
}
