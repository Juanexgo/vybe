FROM python:3.12-slim
WORKDIR /app
COPY apps/ai-service/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY apps/ai-service/main.py .
RUN useradd --create-home vybe
USER vybe
ENV HF_HOME=/home/vybe/.cache/huggingface
EXPOSE 8001
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8001"]
