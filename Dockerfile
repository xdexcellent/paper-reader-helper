FROM node:20-alpine AS frontend-build
WORKDIR /app
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm install
COPY frontend/ ./
RUN npm run build

FROM python:3.12-slim
WORKDIR /app
COPY backend/pyproject.toml ./
RUN pip install --no-cache-dir -e .
COPY backend/app ./app
COPY --from=frontend-build /app/dist ./static
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
