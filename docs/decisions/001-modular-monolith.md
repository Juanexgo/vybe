# ADR 001: Modular monolith

Accepted. Use Spring Boot package boundaries instead of per-module network services. The initial product needs transactional identity/catalog changes more than independent scaling. Extract media processing and AI only when phases 2/3 require isolated resource usage. JPA identity and explicit SQL catalog projections balance entity management with predictable joins.
