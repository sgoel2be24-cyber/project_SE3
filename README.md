# FoodBridge

A web platform that matches surplus food from donors (canteens, restaurants, events) to nearby recipient organisations (NGOs, shelters) before it expires.

**UCS503P Software Engineering Lab, Team 3, Thapar Institute of Engineering and Technology**
Hardik Pajiala · Shikhar Goel · Ayush Shukla. Instructor: Mrs. Anushka

![CI](https://github.com/pajiala99/project_SE3/actions/workflows/ci.yml/badge.svg)

## What it does

1. A donor posts surplus food: type, quantity, pickup address, expiry time.
2. An admin reviews and approves the donation.
3. The matching engine filters recipients by hard constraints (service radius, food type, dietary restrictions, capacity). It then ranks the remaining recipients by urgency, proximity and capacity fit.
4. The best recipient gets an offer and can accept or decline. A decline or a timeout triggers an automatic re-match. If nobody fits, the search radius widens and then the donation goes on a waitlist. A background sweep expires overdue offers and donations every minute.
5. The pickup is tracked through Scheduled → Picked up → Completed, and every step is timestamped.
6. An impact dashboard reports meals saved, time-to-match, rescue rate, first-offer acceptance, and expired or unmatched donations. Every status change is logged with who made it.

## Architecture

```
React (Vite)  ──►  Express API (TypeScript)  ──►  PostgreSQL + PostGIS
                         │
                         └──►  Matching service (Python, FastAPI)
                               greedy  |  Hungarian (scipy)
```

| Folder | What's inside |
|---|---|
| `frontend/` | React UI: donor form, offer inbox, pickups, admin review, impact dashboard |
| `backend/` | Express API: auth (JWT), donations, review, match lifecycle, pickups, notifications; SQL migrations; tests |
| `matching-service/` | Stateless matcher: eligibility filters, weighted scoring, greedy and Hungarian strategies; tests |
| `docs/` | `API.md`, `MATCHING_ALGORITHM.md`, `OWNERSHIP.md` |
| `scripts/` | Local DB setup, full test run, end-to-end demo |
| `project_proposal/` | Project proposal (LaTeX + PDF) |
| `ReportPrototype/` | Prototype report with UML diagrams |
| `journals/` | Weekly journals per team member |

## Run locally

Prerequisites: Node 20+, Python 3.10+, PostgreSQL with PostGIS.

```bash
# 1. Database (creates foodbridge + foodbridge_test and runs migrations)
bash scripts/db-start.sh

# 2. Matching service on :8000
cd matching-service
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app:app --port 8000

# 3. Backend API
cd backend && npm install && npm run seed && npm run dev

# 4. Frontend on :5173
cd frontend && npm install && npm run dev
```

The frontend can also run without the backend against a stub server. See `frontend/INTEGRATION.md`.

## Tests

```bash
bash scripts/test-all.sh              # matcher + backend (needs PostGIS running)
cd matching-service && pytest -q      # matcher only
cd frontend && npm run lint && npm run build
```

GitHub Actions runs all three suites on every push and pull request (`.github/workflows/ci.yml`).
