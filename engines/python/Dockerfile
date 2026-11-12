FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    BA_ENGINE_HTTP_HOST=0.0.0.0 \
    BA_ENGINE_HTTP_PORT=8080

WORKDIR /app

COPY engines/python/ /app/engines/python/
RUN python -m pip install --no-cache-dir --no-compile /app/engines/python

COPY schemas/engine/ /app/schemas/engine/

RUN groupadd --system --gid 10001 baengine \
    && useradd --system --uid 10001 --gid baengine --home-dir /nonexistent \
       --shell /usr/sbin/nologin baengine

USER 10001:10001

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD ["python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8080/healthz', timeout=2).read()"]

ENTRYPOINT ["ba-engine-http-worker"]
