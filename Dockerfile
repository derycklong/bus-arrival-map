FROM node:22-alpine AS frontend
WORKDIR /web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ .
ENV DOCKER_BUILD=1
RUN npm run build

FROM python:3.11-slim
WORKDIR /app
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY --from=frontend /web/out /app/frontend
COPY backend/ /app/backend
COPY data/ /app/data

ENV PYTHONDONTWRITEBYTECODE=1
ENV JWT_SECRET=change-me-in-production
ENV LTA_DATAMALL_ACCOUNT_KEY=change-me

EXPOSE 8000
CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000"]
