FROM python:3.12-slim
WORKDIR /app
RUN pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu
COPY apps/ai-service/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY apps/ai-service/main.py .
RUN useradd --create-home vybe && mkdir -p /home/vybe/.cache/huggingface && chown -R vybe:vybe /home/vybe/.cache
USER vybe
ENV HF_HOME=/home/vybe/.cache/huggingface
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8001"]
