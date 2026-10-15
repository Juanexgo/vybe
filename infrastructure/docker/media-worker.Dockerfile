FROM python:3.12-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY apps/media-worker/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY apps/media-worker/worker.py apps/media-worker/init_bucket.py ./
RUN useradd --create-home worker
USER worker
CMD ["python", "worker.py"]
