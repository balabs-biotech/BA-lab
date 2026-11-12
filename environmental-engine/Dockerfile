FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

COPY pyproject.toml README.md ./
COPY src ./src

RUN python -m pip install --upgrade pip \
    && python -m pip install ".[api,satellite]"

EXPOSE 8000

CMD ["sh", "-c", "uvicorn ba_environmental_engine.api.app:app --host 0.0.0.0 --port ${PORT:-8000}"]
