# Bus Arrival Map

A web app to find nearby bus stops and view real-time bus arrival times in Singapore, powered by [LTA DataMall](https://datamall.lta.gov.sg/).

## Features

- **Map view** — see nearby bus stops on an interactive map
- **Real-time arrivals** — tap a stop to see live bus arrival timings
- **Favorites** — save stops to your account for quick access
- **User accounts** — register/login to sync favorites across devices

## Tech stack

| Layer | Stack |
|---|---|
| **Frontend** | Next.js, TypeScript, Tailwind CSS, Leaflet |
| **Backend** | FastAPI (Python), SQLite |
| **Auth** | JWT (bcrypt + PyJWT) |
| **Data source** | LTA DataMall API |

## Setup

### Prerequisites

- Python 3.10+
- Node.js 18+

### 1. Environment variables

```bash
# data/.env
JWT_SECRET=your-secret-key
LTA_DATAMALL_ACCOUNT_KEY=your-lta-account-key
```

### 2. Install dependencies

```bash
pip install -r backend/requirements.txt
cd web && npm install
```

### 3. Download bus stop data

```bash
python backend/setup_db.py
```

### 4. Start servers

```bash
start-servers.bat
```

Or manually:

```bash
# Terminal 1 — Backend (port 8000)
python -m uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000

# Terminal 2 — Frontend (port 3000)
cd web && npx next dev --hostname 0.0.0.0
```

Open [http://localhost:3000](http://localhost:3000).

## Project structure

```
bus-arrival-map/
├── backend/
│   ├── main.py           # FastAPI app
│   ├── auth.py           # JWT / password helpers
│   ├── database.py       # SQLite connection
│   ├── routers/
│   │   ├── auth.py       # /api/register, /api/login, /api/me
│   │   ├── stops.py      # /api/stops, /api/stops/:code/arrivals
│   │   └── favourites.py # /api/favourites CRUD
│   ├── setup_db.py       # Download LTA bus stop data
│   └── requirements.txt
├── web/
│   ├── app/              # Next.js pages
│   ├── components/       # React components
│   └── lib/              # API client, hooks
├── data/                 # SQLite DB, .env
└── start-servers.bat
```
