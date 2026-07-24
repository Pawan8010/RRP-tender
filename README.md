# RRP Tender — GeM Tender Scraper & Search

Full-stack GeM tender scraper that stores public active tenders in PostgreSQL and exposes a searchable Next.js UI.

## Features

- Scrapes public GeM tender data from `https://bidplus.gem.gov.in`.
- Stores tenders in PostgreSQL with Prisma migrations.
- Supports full scrape and latest/new tender scrape.
- Search by bid number, title, department, organisation, category, description, and keyword tags.
- Opens original GeM bid/document links from each result card.
- Includes Docker Compose for one-command local setup.

## Quick Start With Docker

Prerequisites:

- Docker Desktop

Run:

```bash
docker compose up --build
```

Open:

- Frontend: `http://localhost:3000`
- Backend health: `http://localhost:4000/health`

Click `Scrape All GeM Tenders` in the UI to load all active GeM tenders into PostgreSQL. Click `Scrape New Tenders` later to scan the latest GeM pages for newly published tenders.

## Local Development Setup

Prerequisites:

- Node.js 20+
- PostgreSQL 14+

### 1. Backend

```bash
cd backend
cp .env.example .env
npm install
npx prisma migrate deploy
npm run build
npm start
```

Update `backend/.env` if your local PostgreSQL credentials differ:

```env
DATABASE_URL=postgresql://gem_user:gem_password@localhost:5432/gem_tenders?schema=public
```

### 2. Frontend

Open a second terminal:

```bash
cd frontend
cp .env.example .env
npm install
npm run build
npm start
```

Open `http://127.0.0.1:3000`.

## Useful API Endpoints

- `GET /health` — backend health check.
- `GET /api/tenders?page=1&pageSize=50&q=thermal` — searchable paginated tenders.
- `GET /api/tenders/stats` — dashboard stats.
- `POST /api/scrape` — start full background scrape.
- `POST /api/scrape/new` — start latest/new tender scrape.
- `GET /api/scrape/status` — scrape progress lock status.

## Notes

- GeM can rate-limit or temporarily reject requests. If that happens, wait a few minutes and run the scraper again.
- `SCRAPER_MAX_PAGES=0` means scrape all pages GeM reports.
- `SCRAPER_START_PAGE=1` should stay at `1` for normal full scrapes.
- Do not commit `.env`; use `.env.example` for clone setup.

