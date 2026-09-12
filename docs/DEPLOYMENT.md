# SIH25018 Nabha Telemedicine — Production Deployment Specification

## Multi-Container Docker Stack (`docker-compose.yml`)

```bash
docker compose up --build -d
```

### Stack Components:
- **`postgres`**: PostgreSQL 15 database container on port 5432.
- **`backend`**: Node.js REST API container on port 5000.
- **`ai-service`**: Python FastAPI microservice on port 8001.

## Single Laptop Local Standalone Execution (SIH Demo Mode)
1. Frontend static server: `http://localhost:8000`
2. Node backend REST API: `http://localhost:5000`
3. Python FastAPI AI service: `http://localhost:8001`

## Phase-complete deployment additions

The repository now includes a production static frontend container (`frontend/Dockerfile`) and explicit AI-service CORS configuration. Run `database/migrations` before starting the backend, provide secrets through the deployment environment, and expose services through a TLS reverse proxy/WAF.

## Create the First Production Administrator

Set these variables as deployment secrets on the backend service:

```text
ADMIN_NAME=Platform Administrator
ADMIN_EMAIL=your-admin@example.com
ADMIN_MOBILE=10-digit-mobile-number
ADMIN_PASSWORD=long-random-password-at-least-12-characters
```

After migrations have completed, run this once from a trusted environment that can reach the production database:

```bash
npm run admin:create --prefix backend
```

The command creates an active `ADMIN` user and stores only a bcrypt password hash. It refuses to overwrite an existing account, so it must not be added to the regular deploy command. Log in on the deployed site using the configured email or mobile number and password; the existing JWT session then authorizes the admin dashboard and admin API routes. Never commit these values or reuse the local `SEED_PASSWORD` in production.
