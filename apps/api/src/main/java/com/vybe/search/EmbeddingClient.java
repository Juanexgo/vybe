package com.vybe.search;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.URI;
import java.net.http.*;
import java.time.Duration;
import java.util.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

@Component
public class EmbeddingClient {
  private final HttpClient client =
      HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(1)).build();
  private final ObjectMapper json;
  private final String url, key;
  private volatile long retryAfter = 0;

  public EmbeddingClient(
      ObjectMapper json,
      @Value("${vybe.ai-url:http://127.0.0.1:8001}") String url,
      @Value("${vybe.ai-key:}") String key) {
    this.json = json;
    this.url = url;
    this.key = key;
  }

  public record Embeddings(String model, List<List<Double>> vectors) {}

  public Optional<Embeddings> embed(List<String> texts) {
    if (System.currentTimeMillis() < retryAfter) return Optional.empty();
    try {
      var request =
          HttpRequest.newBuilder(URI.create(url + "/embed"))
              .timeout(Duration.ofSeconds(4))
              .header("Content-Type", "application/json")
              .header("X-Internal-Key", key)
              .POST(
                  HttpRequest.BodyPublishers.ofString(
                      json.writeValueAsString(Map.of("texts", texts))))
              .build();
      var response = client.send(request, HttpResponse.BodyHandlers.ofString());
      if (response.statusCode() != 200)
        throw new IllegalStateException("Embedding service unavailable");
      var result = json.readValue(response.body(), Embeddings.class);
      if (result.vectors().size() != texts.size()
          || result.vectors().stream()
              .anyMatch(
                  v ->
                      v.size() != 384
                          || v.stream().anyMatch(n -> n == null || !Double.isFinite(n))))
        throw new IllegalStateException("Invalid embedding response");
      return Optional.of(result);
    } catch (InterruptedException e) {
      Thread.currentThread().interrupt();
      return Optional.empty();
    } catch (Exception e) {
      retryAfter = System.currentTimeMillis() + 30000;
      org.slf4j.LoggerFactory.getLogger(getClass())
          .warn(
              "Embedding service unavailable; using lexical discovery ({})",
              e.getClass().getSimpleName());
      return Optional.empty();
    }
  }

  public static String vector(List<Double> numbers) {
    return numbers.toString();
  }
}
