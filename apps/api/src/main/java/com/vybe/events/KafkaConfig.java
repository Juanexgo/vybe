package com.vybe.events;

import org.apache.kafka.clients.admin.NewTopic;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.*;
import org.springframework.kafka.config.TopicBuilder;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.kafka.listener.*;
import org.springframework.util.backoff.FixedBackOff;

@Configuration
@ConditionalOnProperty(name = "vybe.kafka-enabled", havingValue = "true")
public class KafkaConfig {
  @Bean
  NewTopic eventsTopic() {
    return TopicBuilder.name(KafkaEvents.TOPIC).partitions(3).replicas(1).build();
  }

  @Bean
  NewTopic deadEventsTopic() {
    return TopicBuilder.name(KafkaEvents.TOPIC + ".DLT").partitions(3).replicas(1).build();
  }

  @Bean
  DefaultErrorHandler eventErrors(KafkaTemplate<String, String> template) {
    var recoverer =
        new DeadLetterPublishingRecoverer(
            template,
            (record, error) ->
                new org.apache.kafka.common.TopicPartition(
                    KafkaEvents.TOPIC + ".DLT", record.partition()));
    recoverer.setFailIfSendResultIsError(true);
    return new DefaultErrorHandler(recoverer, new FixedBackOff(1000, 3));
  }
}
