package com.vybe.catalog;

import java.util.*;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/catalog")
public class CatalogController {
  private final CatalogService service;

  public CatalogController(CatalogService service) {
    this.service = service;
  }

  @GetMapping
  public Map<String, Object> list(
      @RequestParam(defaultValue = "") String q,
      @RequestParam(defaultValue = "") String genre,
      @RequestParam(defaultValue = "") String kind,
      @RequestParam(defaultValue = "0") int page) {
    return service.browse(q, genre, kind, page);
  }

  @GetMapping("/genres")
  public List<String> genres() {
    return service.genres();
  }

  @GetMapping("/{slug}")
  public Map<String, Object> detail(@PathVariable String slug) {
    return service.detail(slug);
  }
}
