package com.vybe;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest(
    properties = {
      "GOOGLE_CLIENT_ID=test-client",
      "GOOGLE_CLIENT_SECRET=test-secret",
      "vybe.mail-enabled=false",
      "vybe.ai-url=http://127.0.0.1:1",
      "vybe.index-delay-ms=3600000"
    })
@AutoConfigureMockMvc
class GoogleOAuthConfigurationTest {
  @DynamicPropertySource
  static void database(DynamicPropertyRegistry r) {
    PhaseOneIntegrationTest.database(r);
  }

  @Autowired MockMvc mvc;

  @Test
  void googleUsesPkceStateNonceAndConfiguredCallback() throws Exception {
    mvc.perform(get("/api/auth/providers"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.google").value(true));
    String location =
        mvc.perform(get("/api/oauth2/authorization/google"))
            .andExpect(status().is3xxRedirection())
            .andReturn()
            .getResponse()
            .getHeader("Location");
    assertNotNull(location);
    assertTrue(location.startsWith("https://accounts.google.com/"));
    assertTrue(location.contains("code_challenge="));
    assertTrue(location.contains("code_challenge_method=S256"));
    assertTrue(location.contains("state="));
    assertTrue(location.contains("nonce="));
    assertTrue(
        java.net.URLDecoder.decode(location, java.nio.charset.StandardCharsets.UTF_8)
            .contains("/api/login/oauth2/code/google"));
  }

  @Test
  void callbackWithoutMatchingStateNeverAuthenticates() throws Exception {
    mvc.perform(get("/api/login/oauth2/code/google?code=forged&state=forged"))
        .andExpect(status().is3xxRedirection())
        .andExpect(
            header().string("Location", org.hamcrest.Matchers.endsWith("/login?oauth=failed")));
    mvc.perform(get("/api/auth/me")).andExpect(status().isUnauthorized());
  }
}
