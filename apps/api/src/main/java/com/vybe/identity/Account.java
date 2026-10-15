package com.vybe.identity;

import jakarta.persistence.*;
import java.util.UUID;

@Entity
@Table(name = "users")
public class Account {
  @Id public UUID id;

  @Column(nullable = false, unique = true, length = 254)
  public String email;

  @Column(name = "password_hash", nullable = false, length = 100)
  public String passwordHash;

  @Column(nullable = false)
  public boolean verified;

  protected Account() {}

  public Account(String email, String hash) {
    this.id = UUID.randomUUID();
    this.email = email;
    this.passwordHash = hash;
  }
}
