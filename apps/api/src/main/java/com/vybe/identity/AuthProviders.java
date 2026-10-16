package com.vybe.identity;

import java.util.Map;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.web.bind.annotation.*;

@RestController
public class AuthProviders {
  private final ObjectProvider<GoogleOAuth> google;

  public AuthProviders(ObjectProvider<GoogleOAuth> google) {
    this.google = google;
  }

  @GetMapping("/api/auth/providers")
  public Map<String, Boolean> providers() {
    return Map.of("google", google.getIfAvailable() != null);
  }
}
