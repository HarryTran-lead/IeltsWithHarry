FROM python:3.11-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 KOKORO_MODEL_ID=hexgrad/Kokoro-82M HF_HOME=/worker/cache/huggingface
RUN apt-get update && apt-get install -y --no-install-recommends espeak-ng libsndfile1 && rm -rf /var/lib/apt/lists/*
WORKDIR /worker
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
RUN python -m spacy download en_core_web_sm
COPY worker.py .
RUN useradd -r -u 10001 worker && mkdir -p /worker/cache/huggingface && chown -R worker:worker /worker
USER worker
CMD ["python", "worker.py"]
