package com.vybe.profiles;

import com.vybe.identity.IdentityService;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

@Service
public class ProfileAccess {
  private final JdbcTemplate db;
  private final IdentityService identity;

  public ProfileAccess(JdbcTemplate db, IdentityService identity) {
    this.db = db;
    this.identity = identity;
  }

  public void requireOwner(UUID profile, String email) {
    if (!Boolean.TRUE.equals(
        db.queryForObject(
            "SELECT EXISTS(SELECT 1 FROM profiles WHERE id=? AND user_id=?)",
            Boolean.class,
            profile,
            identity.id(email))))
      throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Profile not found.");
  }
}
