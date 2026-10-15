package com.vybe.search;

import com.vybe.catalog.CatalogService;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.*;
import java.util.regex.Pattern;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

@Service
public class DiscoveryService {
  private final NamedParameterJdbcTemplate db;
  private final EmbeddingClient ai;

  public DiscoveryService(NamedParameterJdbcTemplate db, EmbeddingClient ai) {
    this.db = db;
    this.ai = ai;
  }

  private static final String GENRES =
      ",COALESCE((SELECT string_agg(g.name, ', ' ORDER BY g.name) FROM genres g JOIN content_genres"
          + " cg ON cg.genre_id=g.id WHERE cg.content_id=c.id),'') AS genres";

  @Scheduled(fixedDelayString = "${vybe.index-delay-ms:60000}", initialDelay = 10000)
  public synchronized void index() {
    var rows =
        db.queryForList(
            "SELECT c.id,c.title || '. ' || c.synopsis || '. ' || c.language || '. ' ||"
                + " COALESCE((SELECT string_agg(g.name,', ') FROM genres g JOIN content_genres cg"
                + " ON cg.genre_id=g.id WHERE cg.content_id=c.id),'') AS text,e.source_hash FROM"
                + " content c LEFT JOIN content_embeddings e ON e.content_id=c.id WHERE c.published"
                + " ORDER BY c.updated_at DESC",
            Map.of());
    int indexed = 0;
    for (var row : rows) {
      String text = (String) row.get("text"), hash = hash(text);
      if (hash.equals(row.get("source_hash"))) continue;
      var result = ai.embed(List.of(text));
      if (result.isEmpty()) return;
      db.update(
          "INSERT INTO content_embeddings(content_id,embedding,model,source_hash) VALUES"
              + " (:id,CAST(:vector AS vector),:model,:hash) ON CONFLICT(content_id) DO UPDATE SET"
              + " embedding=EXCLUDED.embedding,model=EXCLUDED.model,source_hash=EXCLUDED.source_hash,updated_at=now()",
          Map.of(
              "id",
              row.get("id"),
              "vector",
              EmbeddingClient.vector(result.get().vectors().getFirst()),
              "model",
              result.get().model(),
              "hash",
              hash));
      if (++indexed >= 32) break;
    }
  }

  private String hash(String value) {
    try {
      return HexFormat.of()
          .formatHex(
              MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8)));
    } catch (Exception e) {
      throw new IllegalStateException(e);
    }
  }

  public Map<String, Object> search(
      String query,
      String genre,
      String language,
      int maxMinutes,
      int fromYear,
      int toYear,
      int page) {
    String q = query.strip();
    Map<String, Object> filters = new LinkedHashMap<>();
    String lower = q.toLowerCase(Locale.ROOT);
    if (genre.isBlank()) {
      var names =
          db.queryForList(
              "SELECT name FROM genres ORDER BY length(name) DESC", Map.of(), String.class);
      for (String name : names)
        if (lower.contains(name.toLowerCase(Locale.ROOT))) {
          genre = name;
          break;
        }
      if (genre.isBlank() && (lower.contains("sci-fi") || lower.contains("ciencia ficción")))
        genre = "Science fiction";
    }
    if (maxMinutes == 0) {
      var m =
          Pattern.compile(
                  "(?:under|less than|menos"
                      + " de|hasta)\\s+(\\d+)\\s*(hours?|horas?|minutes?|minutos?)")
              .matcher(lower);
      if (m.find())
        maxMinutes =
            Math.min(
                2000,
                new java.math.BigInteger(m.group(1))
                        .min(java.math.BigInteger.valueOf(2000))
                        .intValue()
                    * (m.group(2).startsWith("h") ? 60 : 1));
      else if (lower.contains("two hours") || lower.contains("dos horas")) maxMinutes = 120;
    }
    if (language.isBlank())
      for (String l : List.of("English", "Spanish", "French", "German", "Japanese"))
        if (lower.contains(l.toLowerCase(Locale.ROOT))) language = l;
    var years =
        Pattern.compile(
                "(?:from|between|entre)\\s+(19[0-9]{2}|20[0-9]{2})\\s+(?:to|and|y|a)\\s+(19[0-9]{2}|20[0-9]{2})")
            .matcher(lower);
    if (years.find()) {
      fromYear = Math.max(fromYear, Integer.parseInt(years.group(1)));
      toYear = Math.min(toYear, Integer.parseInt(years.group(2)));
    }
    filters.put("genre", genre);
    filters.put("language", language);
    filters.put("maxMinutes", maxMinutes);
    filters.put("fromYear", fromYear);
    filters.put("toYear", toYear);
    var embedded =
        q.isBlank() ? Optional.<EmbeddingClient.Embeddings>empty() : ai.embed(List.of(q));
    boolean semantic = embedded.isPresent();
    Map<String, Object> p = new HashMap<>(filters);
    p.put("q", q);
    p.put("offset", page * 12);
    String lexical = "ts_rank_cd(c.search_document,websearch_to_tsquery('english',:q))";
    String score = q.isBlank() ? "CASE WHEN c.featured THEN 1 ELSE 0 END" : lexical;
    String join = "";
    if (semantic) {
      p.put("vector", EmbeddingClient.vector(embedded.get().vectors().getFirst()));
      p.put("model", embedded.get().model());
      join = " LEFT JOIN content_embeddings e ON e.content_id=c.id AND e.model=:model ";
      score =
          "(0.45*LEAST("
              + lexical
              + "*5,1)+0.55*COALESCE(1-(e.embedding <=> CAST(:vector AS vector)),0))";
    }
    String where =
        " FROM content c"
            + join
            + " WHERE c.published AND (:genre='' OR EXISTS(SELECT 1 FROM content_genres cg JOIN"
            + " genres g ON g.id=cg.genre_id WHERE cg.content_id=c.id AND g.name=:genre)) AND"
            + " (:language='' OR lower(c.language)=lower(:language)) AND (:maxMinutes=0 OR"
            + " c.duration_minutes<=:maxMinutes) AND c.release_year BETWEEN :fromYear AND :toYear";
    if (!q.isBlank())
      where +=
          " AND (c.search_document @@ websearch_to_tsquery('english',:q)"
              + (semantic ? " OR (e.embedding <=> CAST(:vector AS vector))<0.8" : "")
              + ")";
    var items =
        db.queryForList(
            "SELECT "
                + CatalogService.COLUMNS
                + GENRES
                + ","
                + score
                + " AS score,"
                + lexical
                + " AS lexical"
                + where
                + " ORDER BY score DESC,c.id LIMIT 12 OFFSET :offset",
            p);
    for (var item : items) {
      List<String> reasons = new ArrayList<>();
      if (((Number) item.get("lexical")).doubleValue() > 0)
        reasons.add("Matches words in the title or synopsis");
      if (semantic) reasons.add("Ranked by semantic similarity to your description");
      if (!genre.isBlank()) reasons.add("Genre: " + genre);
      if (maxMinutes > 0) reasons.add("Within " + maxMinutes + " minutes");
      item.put("reasons", reasons);
      item.remove("lexical");
    }
    return Map.of(
        "items",
        items,
        "total",
        Objects.requireNonNull(db.queryForObject("SELECT count(*)" + where, p, Long.class)),
        "page",
        page,
        "filters",
        filters,
        "semanticAvailable",
        semantic,
        "mode",
        q.isBlank()
            ? "Catalog filters"
            : semantic ? "Hybrid semantic + text" : "Text search — semantic service unavailable");
  }
}
