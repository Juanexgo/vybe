package com.vybe.parties;

import java.util.List;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.*;
import org.springframework.data.redis.connection.RedisConnectionFactory;
import org.springframework.data.redis.listener.*;
import org.springframework.web.socket.config.annotation.*;
import org.springframework.web.socket.server.support.HttpSessionHandshakeInterceptor;

@Configuration
@EnableWebSocket
public class PartySocketConfig implements WebSocketConfigurer {
  private final PartySocket socket;
  private final String[] origins;

  public PartySocketConfig(PartySocket socket, @Value("${vybe.public-url}") String origin,
      @Value("${PARTY_PROXY_ORIGIN:}") String proxyOrigin) {
    this.socket = socket;
    this.origins = proxyOrigin.isBlank() ? new String[] {origin} : new String[] {origin, proxyOrigin};
  }

  @Override
  public void registerWebSocketHandlers(WebSocketHandlerRegistry registry) {
    var sessions = new HttpSessionHandshakeInterceptor(List.of());
    sessions.setCopyHttpSessionId(true);
    sessions.setCreateSession(false);
    registry
        .addHandler(socket, "/api/party-socket")
        .addInterceptors(sessions)
        .setAllowedOrigins(origins);
  }

  @Bean
  RedisMessageListenerContainer partyListener(RedisConnectionFactory connection, PartyBus bus) {
    var container = new RedisMessageListenerContainer();
    container.setConnectionFactory(connection);
    container.addMessageListener(
        (message, pattern) -> bus.receive(message.toString()), new ChannelTopic(PartyBus.CHANNEL));
    return container;
  }
}
