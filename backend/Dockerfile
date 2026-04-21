FROM python:3.12-slim

WORKDIR /app

COPY pyproject.toml ./
RUN python - <<'PY'
import subprocess
import tomllib

with open('pyproject.toml', 'rb') as file:
    dependencies = tomllib.load(file)['project']['dependencies']

subprocess.check_call(['pip', 'install', '--no-cache-dir', *dependencies])
PY

COPY app ./app

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
