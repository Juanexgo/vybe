"""Durable PostgreSQL leased jobs; private S3 inputs and FFmpeg VOD output."""
import json
import logging
import math
import os
import re
from pathlib import Path
import subprocess
import tempfile
import time
import uuid

import boto3
from botocore.config import Config
import psycopg
from psycopg.rows import dict_row

log = logging.getLogger("vybe.media")
logging.basicConfig(level=logging.INFO, format="%(message)s")
DB = os.environ.get("WORKER_DATABASE_URL", "postgresql://vybe:vybe_local@localhost:5432/vybe")
BUCKET = os.environ.get("S3_BUCKET", "vybe-media")
FFMPEG = os.environ.get("FFMPEG_PATH", "ffmpeg")
FFPROBE = os.environ.get("FFPROBE_PATH", "ffprobe")


def storage():
    return boto3.client("s3", endpoint_url=os.environ.get("S3_ENDPOINT", "http://127.0.0.1:9000"),
        aws_access_key_id=os.environ.get("S3_ACCESS_KEY", "S3RVER"),
        aws_secret_access_key=os.environ.get("S3_SECRET_KEY", "S3RVER"),
        region_name=os.environ.get("S3_REGION", "us-east-1"),
        config=Config(signature_version="s3v4", s3={"addressing_style": "path"},
                      connect_timeout=10, read_timeout=60, retries={"max_attempts": 3}))


def claim(conn):
    with conn.transaction():
        job = conn.execute("""SELECT j.*,m.original_key FROM processing_jobs j JOIN media_assets m ON m.id=j.asset_id
          WHERE j.status='QUEUED' OR (j.status='PROCESSING' AND j.lease_until<now())
          ORDER BY j.created_at FOR UPDATE OF j SKIP LOCKED LIMIT 1""").fetchone()
        if not job:
            return None
        if job["attempts"] >= 3:
            conn.execute("UPDATE processing_jobs SET status='FAILED',error='Worker lease expired after three attempts.',finished_at=now() WHERE id=%s", (job["id"],))
            conn.execute("UPDATE media_assets SET status='FAILED',updated_at=now() WHERE id=%s", (job["asset_id"],))
            return None
        owner = uuid.uuid4()
        conn.execute("""UPDATE processing_jobs SET status='PROCESSING', attempts=attempts+1,
          lease_owner=%s,lease_until=now()+interval '35 minutes',started_at=now(),finished_at=NULL,error=NULL WHERE id=%s""", (owner, job["id"]))
        conn.execute("UPDATE media_assets SET status='PROCESSING',updated_at=now() WHERE id=%s", (job["asset_id"],))
        job["lease_owner"] = owner
        job["attempts"] += 1
        return job


def probe(source):
    result = subprocess.run([FFPROBE, "-v", "error", "-protocol_whitelist", "file,pipe", "-show_streams", "-show_format", "-of", "json", str(source)], capture_output=True, timeout=30, check=True)
    data = json.loads(result.stdout)
    streams = [s for s in data.get("streams", []) if s.get("codec_type") == "video" and not s.get("disposition", {}).get("attached_pic")]
    if not streams:
        raise ValueError("The file does not contain a video stream.")
    video = streams[0]
    w, h = int(video.get("width", 0)), int(video.get("height", 0))
    duration = float(data.get("format", {}).get("duration", 0))
    formats = set(data.get("format", {}).get("format_name", "").split(","))
    if not formats.intersection({"mov", "mp4", "matroska", "webm"}) or not 2 <= w <= 7680 or not 2 <= h <= 4320 or w*h > 33177600 or not math.isfinite(duration) or not 0 < duration <= 14400:
        raise ValueError("Use a supported video up to 8K and four hours long.")
    rotation = float(next((d.get("rotation", 0) for d in video.get("side_data_list", []) if "rotation" in d), video.get("tags", {}).get("rotate", 0)))
    if abs(rotation) % 180 == 90:
        w, h = h, w
    audios = [s for s in data.get("streams", []) if s.get("codec_type") == "audio"][:8]
    return w, h, duration, audios


def transcode(source, output):
    width, height, duration, audios = probe(source)
    heights = [h for h in (360, 720, 1080) if h <= height] or [height // 2 * 2]
    variants = []
    deadline = time.monotonic() + 1800
    for h in heights:
        folder = output / f"{h}p"
        folder.mkdir(parents=True)
        bitrate = 800000 if h <= 360 else 2800000 if h <= 720 else 5000000
        out_width = max(2, round(width * h / height / 2) * 2)
        args = [FFMPEG, "-nostdin", "-hide_banner", "-loglevel", "error", "-y", "-protocol_whitelist", "file,pipe", "-i", str(source),
            "-map", "0:v:0", "-an", "-sn", "-dn", "-vf", f"scale={out_width}:{h},setsar=1", "-c:v", "libx264", "-preset", "veryfast", "-threads", "2",
            "-pix_fmt", "yuv420p", "-b:v", str(bitrate), "-maxrate", str(bitrate), "-bufsize", str(bitrate*2),
            "-force_key_frames", "expr:gte(t,n_forced*4)", "-sc_threshold", "0", "-c:a", "aac", "-b:a", "128k", "-ac", "2",
            "-f", "hls", "-hls_time", "4", "-hls_playlist_type", "vod", "-hls_flags", "independent_segments",
            "-hls_segment_filename", str(folder / "seg_%05d.ts"), str(folder / "index.m3u8")]
        subprocess.run(args, capture_output=True, check=True, timeout=max(1, deadline-time.monotonic()))
        variants.append({"height": h, "width": out_width, "bitrate": bitrate + 128000})
    lines = ["#EXTM3U", "#EXT-X-VERSION:3", "#EXT-X-INDEPENDENT-SEGMENTS"]
    for index, audio in enumerate(audios):
        folder = output / f"audio{index}"
        folder.mkdir(parents=True)
        args = [FFMPEG, "-nostdin", "-hide_banner", "-loglevel", "error", "-y", "-protocol_whitelist", "file,pipe", "-i", str(source), "-map", f"0:{audio['index']}", "-vn", "-sn", "-dn", "-c:a", "aac", "-b:a", "128k", "-ac", "2", "-f", "hls", "-hls_time", "4", "-hls_playlist_type", "vod", "-hls_segment_filename", str(folder/"seg_%05d.ts"), str(folder/"index.m3u8")]
        subprocess.run(args, capture_output=True, check=True, timeout=max(1, deadline-time.monotonic()))
        language = re.sub(r"[^A-Za-z0-9-]", "", str(audio.get("tags", {}).get("language", "und")))[:20] or "und"
        label = f"{language.upper()} · Track {index+1}"
        lines.append(f'#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="{label}",LANGUAGE="{language}",DEFAULT={"YES" if index==0 else "NO"},AUTOSELECT=YES,URI="audio{index}/index.m3u8"')
    audio_group = ',AUDIO="audio"' if audios else ''
    for v in variants:
        lines.extend([f'#EXT-X-STREAM-INF:BANDWIDTH={v["bitrate"]},RESOLUTION={v["width"]}x{v["height"]}{audio_group}', f'{v["height"]}p/index.m3u8'])
    (output / "master.m3u8").write_text("\n".join(lines) + "\n")
    return width, height, duration, variants


def process(conn, s3, job):
    uploaded = []
    prefix = f'hls/{job["asset_id"]}/{job["lease_owner"]}/'
    try:
        with tempfile.TemporaryDirectory(prefix="vybe-media-") as tmp:
            root = Path(tmp)
            source, output = root / "source", root / "hls"
            s3.download_file(BUCKET, job["original_key"], str(source))
            width, height, duration, variants = transcode(source, output)
            for path in sorted(output.rglob("*")):
                if path.is_file():
                    key = prefix + path.relative_to(output).as_posix()
                    s3.upload_file(str(path), BUCKET, key, ExtraArgs={"ContentType": "application/vnd.apple.mpegurl" if path.suffix == ".m3u8" else "video/mp2t"})
                    uploaded.append(key)
            with conn.transaction():
                done = conn.execute("""UPDATE processing_jobs SET status='READY',finished_at=now(),lease_until=NULL
                  WHERE id=%s AND lease_owner=%s AND status='PROCESSING' RETURNING id""", (job["id"], job["lease_owner"])).fetchone()
                if not done:
                    raise RuntimeError("Lease lost; ignoring stale output.")
                conn.execute("DELETE FROM media_renditions WHERE asset_id=%s", (job["asset_id"],))
                for v in variants:
                    conn.execute("INSERT INTO media_renditions(id,asset_id,height,width,bitrate,manifest_key) VALUES (%s,%s,%s,%s,%s,%s)", (uuid.uuid4(), job["asset_id"], v["height"], v["width"], v["bitrate"], prefix+f'{v["height"]}p/index.m3u8'))
                conn.execute("""UPDATE media_assets SET status='READY',manifest_key=%s,source_width=%s,source_height=%s,duration_seconds=%s,updated_at=now() WHERE id=%s""", (prefix+"master.m3u8", width, height, duration, job["asset_id"]))
        log.info(json.dumps({"event": "media.ready", "assetId": str(job["asset_id"]), "renditions": len(variants)}))
    except Exception as error:
        # Do not log signed URLs, source bytes, credentials or FFmpeg's untrusted stderr.
        reason = str(error)[:900] if isinstance(error, ValueError) else f"Processing failed ({type(error).__name__}). Review worker configuration or replace the source."
        for key in uploaded:
            try:
                s3.delete_object(Bucket=BUCKET, Key=key)
            except Exception:
                log.error(json.dumps({"event": "media.cleanup-failed", "assetId": str(job["asset_id"])}))
        with conn.transaction():
            done = conn.execute("""UPDATE processing_jobs SET status='FAILED',error=%s,finished_at=now(),lease_until=NULL
              WHERE id=%s AND lease_owner=%s AND status='PROCESSING' RETURNING asset_id""", (reason, job["id"], job["lease_owner"])).fetchone()
            if done:
                conn.execute("UPDATE media_assets SET status='FAILED',updated_at=now() WHERE id=%s", (job["asset_id"],))
        log.error(json.dumps({"event": "media.failed", "assetId": str(job["asset_id"]), "error": reason}))


def main():
    s3 = storage()
    while True:
        try:
            with psycopg.connect(DB, autocommit=True, row_factory=dict_row) as conn:
                job = claim(conn)
                if job:
                    process(conn, s3, job)
                elif os.environ.get("WORKER_ONCE") == "true":
                    return
            if os.environ.get("WORKER_ONCE") == "true":
                return
        except Exception as error:
            log.error(json.dumps({"event": "worker.connection-failed", "type": type(error).__name__}))
            if os.environ.get("WORKER_ONCE") == "true":
                raise
        time.sleep(3)

if __name__ == "__main__":
    main()
