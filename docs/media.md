# Media pipeline

Admin upload → private S3 original → leased PostgreSQL job → FFmpeg → HLS → authenticated playback → per-profile, per-asset progress.

Sources: MP4/MOV/WebM, up to 250 MB and four hours, validated with ffprobe. Renditions follow source quality without upscaling. Rotation, up to eight language-labelled audio tracks and separately uploaded WebVTT captions are supported. A series upload must select an episode belonging to that series. Studio exposes failures and explicit retry; workers have deadlines and recovery leases.

Media remains private. The proxy validates generated manifest/segment paths and requires authentication, a published title and ready asset. Playback/progress validate profile ownership. Commercial DRM is not simulated.

The local check-media.py harness generates original movie/episode test patterns with two audio tracks and captions. Browser tests decode video and exercise selections/progress. No third-party film bytes are copied.

For public deployment, validate media bandwidth, ingress body limits, session longevity and authorized CDN delivery. The local Next.js proxy does not constitute a commercial-scale CDN or an exemption from hosting upload limits.
