import multiprocessing

bind = "0.0.0.0:8000"
workers = multiprocessing.cpu_count() * 2 + 1
worker_class = "uvicorn.workers.UvicornWorker"
keepalive = 5
# Streaming LLM calls (especially the first chunk) can take longer than 30s.
timeout = 500
graceful_timeout = 500
accesslog = "-"
errorlog = "-"
