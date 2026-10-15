# Performance evidence

A read-only local warm-catalog smoke benchmark executed 100 requests with five concurrent clients against nine stored titles. This does not measure production capacity or a 10,000-title dataset.

```json
{
  "requests": 100,
  "concurrency": 5,
  "catalogTitles": 9,
  "p50Ms": 4.39,
  "p95Ms": 13.63,
  "maxMs": 54.79,
  "scope": "local warm catalog smoke test; not production capacity"
}

```

Reproduce with BENCHMARK_API_URL=http://127.0.0.1:8181 python infrastructure/scripts/measure-catalog.py. Targets for a separately provisioned production-scale test remain catalog p95 <200 ms, desktop LCP <2.5 s and CLS <0.1. Mobile overflow is covered in browser tests. No claim is made that the production-scale targets have been validated.
