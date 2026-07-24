# RRP Groups - GeM Tender Scraper & Search

RRP Groups is a full-stack GeM tender scraper and search platform. It scrapes active public tenders from the GeM bid portal, stores them in PostgreSQL, and provides a searchable Next.js UI with live GeM search syncing.

## Features

- Scrapes active GeM tenders from `https://bidplus.gem.gov.in`.
- Stores tenders in PostgreSQL using Prisma.
- Deduplicates existing tenders by GeM bid number.
- Marks stale tenders as `CLOSED` after a successful full scrape.
- Supports full scrape, latest/new tender scrape, and live typed search.
- Searches GeM in real time for typed text like `thermal camera`.
- Supports selecting multiple keyword chips at once.
- Merges multi-keyword live GeM results without duplicate bid numbers.
- Opens original GeM bid/document links from the UI.

## Tech Stack

- Frontend: Next.js 14, React, TypeScript
- Backend: Node.js, Express, TypeScript
- Database: PostgreSQL
- ORM: Prisma
- Scraper transport: GeM public bid data endpoint with CSRF/cookie session handling

## Quick Start With Docker

### Prerequisites

- Docker Desktop
- Git

### Run

```bash
git clone https://github.com/Pawan8010/RRP-tender.git
cd RRP-tender
docker compose up --build
```

Open:

- Frontend: `http://localhost:3000`
- Backend health: `http://localhost:4000/health`

The first Docker start creates PostgreSQL, applies Prisma migrations, starts the backend, and starts the frontend.

## Local Development Setup

### Prerequisites

- Node.js 20+
- PostgreSQL 14+
- Git

### 1. Clone

```bash
git clone https://github.com/Pawan8010/RRP-tender.git
cd RRP-tender
```

### 2. Create PostgreSQL Database

Create a database and user, or use your existing PostgreSQL user.

Example:

```sql
CREATE DATABASE gem_tenders;
CREATE USER gem_user WITH PASSWORD 'gem_password';
GRANT ALL PRIVILEGES ON DATABASE gem_tenders TO gem_user;
```

### 3. Configure Backend

```bash
cd backend
cp .env.example .env
npm install
```

Edit `backend/.env` if your database credentials are different:

```env
DATABASE_URL="postgresql://gem_user:gem_password@localhost:5432/gem_tenders?schema=public"
PORT=4000
CORS_ORIGIN=http://localhost:3000,http://127.0.0.1:3000
GEM_BASE_URL=https://bidplus.gem.gov.in
SCRAPER_MAX_PAGES=0
SCRAPER_START_PAGE=1
SCRAPER_API_CONCURRENCY=24
SCRAPER_REQUEST_DELAY_MS=50
```

Apply migrations and build:

```bash
npx prisma migrate deploy
npx prisma generate
npm run build
```

Start backend:

```bash
npm start
```

For development with auto-reload:

```bash
npm run dev
```

### 4. Configure Frontend

Open a second terminal:

```bash
cd frontend
cp .env.example .env
npm install
npm run build
npm start
```

Open:

```text
http://127.0.0.1:3000
```

For development:

```bash
npm run dev
```

## How To Use

### Full GeM Scrape

Click `Scrape All GeM Tenders` in the UI.

This:

- Scrapes all active GeM pages reported by the portal.
- Upserts records into PostgreSQL.
- Avoids adding duplicate existing tenders.
- Marks old active records as `CLOSED` if they are no longer listed after a successful full scrape.

### New Tender Scrape

Click `Scrape New Tenders`.

This scans the latest GeM pages first and is useful for refreshing newly published bids.

### Live Search

Type in the search box, for example:

```text
thermal camera
```

The backend syncs GeM live search results for that text, stores/upserts them in PostgreSQL, and returns the GeM-style result count.

### Multi-Keyword Search

Click multiple keyword chips, for example:

- `Thermal Camera`
- `Night Vision Camera`
- `PTZ Camera`

The app runs live GeM searches for each selected keyword, merges results, removes duplicate bid numbers, stores them in PostgreSQL, and displays the merged results.

## Useful API Endpoints

Backend base URL:

```text
http://localhost:4000
```

Endpoints:

- `GET /health` - backend health check
- `GET /api/tenders?page=1&pageSize=50` - active stored tenders
- `GET /api/tenders?q=thermal%20camera&page=1&pageSize=50` - live GeM search sync plus paginated results
- `GET /api/tenders?q=Thermal%20Camera%20%7C%7C%20Night%20Vision%20Camera` - multi-keyword union search
- `GET /api/tenders/stats` - dashboard stats
- `POST /api/scrape` - start full background scrape
- `POST /api/scrape/new` - start latest/new tender scrape
- `GET /api/scrape/status` - scrape running status

## Important Environment Variables

Backend:

```env
DATABASE_URL="postgresql://gem_user:gem_password@localhost:5432/gem_tenders?schema=public"
PORT=4000
CORS_ORIGIN=http://localhost:3000,http://127.0.0.1:3000
SCRAPE_CRON="0 */6 * * *"
GEM_BASE_URL=https://bidplus.gem.gov.in
SCRAPER_MAX_PAGES=0
SCRAPER_START_PAGE=1
SCRAPER_API_CONCURRENCY=24
SCRAPER_REQUEST_DELAY_MS=50
SCRAPER_MAX_RETRIES=3
SCRAPER_TIMEOUT_MS=45000
```

Frontend:

```env
NEXT_PUBLIC_API_URL=http://127.0.0.1:4000/api
```

## Notes For Other Developers

- Do not commit `.env` files.
- Use `.env.example` files for setup.
- `SCRAPER_MAX_PAGES=0` means scrape all pages GeM reports.
- Full scrape can take several minutes depending on GeM response speed.
- GeM may rate-limit or temporarily reject requests. Wait and retry if that happens.
- The database stores unique tender bid numbers, so the stored unique count can be lower than GeM's raw listed row count.

## Common Commands

Backend:

```bash
cd backend
npm install
npx prisma migrate deploy
npm run build
npm start
```

Frontend:

```bash
cd frontend
npm install
npm run build
npm start
```

Docker:

```bash
docker compose up --build
```
