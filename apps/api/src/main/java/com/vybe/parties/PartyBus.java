package com.vybe.parties;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Duration;
import java.util.*;
import java.util.function.Consumer;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.DefaultRedisScript;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

@Component
public class PartyBus {
  public static final String CHANNEL = "vybe:party-events:v1";
  private final StringRedisTemplate redis;
  private final ObjectMapper json;
  private volatile Consumer<String> listener = s -> {};

  public PartyBus(StringRedisTemplate redis, ObjectMapper json) {
    this.redis = redis;
    this.json = json;
  }

  public void listen(Consumer<String> listener) {
    this.listener = listener;
  }

  public void receive(String text) {
    listener.accept(text);
  }

  public void publish(UUID room, String type, Object payload) {
    try {
      String value =
          json.writeValueAsString(Map.of("room", room, "type", type, "payload", payload));
      redis.convertAndSend(CHANNEL, value);
    } catch (Exception e) {
      throw new ResponseStatusException(
          HttpStatus.SERVICE_UNAVAILABLE,
          "Live synchronization is temporarily unavailable. Reconnect to refresh the room.",
          e);
    }
  }

  public void present(UUID room, UUID profile) {
    redis.opsForZSet().add("vybe:presence:" + room, profile.toString(), System.currentTimeMillis());
    redis.expire("vybe:presence:" + room, Duration.ofHours(8));
  }

  public Set<String> online(UUID room) {
    String key = "vybe:presence:" + room;
    redis.opsForZSet().removeRangeByScore(key, 0, System.currentTimeMillis() - 20000);
    var values = redis.opsForZSet().range(key, 0, -1);
    return values == null ? Set.of() : values;
  }

  public void cache(UUID room, Map<String, Object> state) {
    try {
      String text = json.writeValueAsString(state);
      var script =
          new DefaultRedisScript<Long>(
              "local old=redis.call('GET',KEYS[1]);if old then local a=cjson.decode(old);local"
                  + " b=cjson.decode(ARGV[1]);if a.version>b.version or (a.version==b.version and"
                  + " a.serverTime>b.serverTime) then return 0 end"
                  + " end;redis.call('SET',KEYS[1],ARGV[1],'EX',28800);return 1",
              Long.class);
      redis.execute(script, List.of("vybe:state:" + room), text);
    } catch (Exception e) {
      throw new ResponseStatusException(
          HttpStatus.SERVICE_UNAVAILABLE, "Room state could not be shared.", e);
    }
  }
}
