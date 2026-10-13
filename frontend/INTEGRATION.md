# Frontend ↔ Backend integration

The React client is built directly against the Person B backend. The source of
truth for the HTTP surface is **`docs/API.md`** and `backend/src/routes/index.ts`
on the `person-b-backend-matching` branch — this file records only how the
frontend consumes it, and what is still open.

An earlier `API_CONTRACT.md` in this folder described a contract the frontend
proposed before the backend existed. The backend went a different way, so that
document has been removed rather than left to rot; the backend's own docs win.

## Running the two together

```bash
# terminal 1 — the backend (needs PostgreSQL + PostGIS)
npm --prefix backend run migrate && npm --prefix backend run seed
npm --prefix backend start                      # :3000

# terminal 2 — the frontend
npm --prefix code/frontend run dev              # :5173, proxies /api to :3000
```

Without PostgreSQL there is a stand-in: `npm run stub` serves a fake of the same
API on :3000 so the UI can be exercised. It is a **test double**, not the
backend — never develop against it alone.

Point the client at a different origin with `VITE_API_BASE` in `.env`; leave it
blank to use the dev proxy.

## Checking a server before trusting it

```bash
npm run check:contract                    # http://localhost:3000
npm run check:contract -- http://host:3000
```

Walks a full lifecycle — register, post, review, match, accept, collect,
complete — and checks the shapes the client actually reads. Exits non-zero on
failure, so CI can gate on it. It creates three throwaway accounts, so run it
against a development database.

## How the frontend maps onto the API

| Screen | Endpoints |
|---|---|
| Sign in / register | `POST /auth/login`, `POST /auth/register`, `GET /auth/me` |
| Post surplus food | `POST /donations` |
| My donations | `GET /donations/mine` |
| Donation detail + timeline | `GET /donations/:id` (donation + reviews + matches + pickups) |
| Offers (recipient) | `GET /matches/inbox`, `POST /matches/:id/accept`, `/reject` |
| Collections (recipient) | `GET /pickups/mine`, `POST /pickups/:id/picked-up`, `/complete` |
| Review queue (admin) | `GET /admin/donations/pending`, `PATCH /admin/donations/:id/review` |
| Matching (admin) | `POST /admin/matching/run`, `GET /admin/waitlist` |
| Impact (admin) | `GET /impact/summary` |
| Notification bell | `GET /notifications`, `PATCH /notifications/:id/read`, `POST /notifications/read-all` |

Responses are database rows in snake_case and the client reads them as-is. There
is no renaming layer on purpose: a silent rename is where drift hides.

The user object is the same on every auth call: register, login and
`GET /auth/me` all return the `users` row in snake_case (`user_id`).
`normalizeUser` in `src/context/Session.jsx` still accepts `userId`, so it
also works against an older backend.

## Resolved by Person B

- **Inbox donation detail.** `GET /matches/inbox` now embeds each offer's
  donation under `match.donation`. `MatchInbox.jsx` uses it and only falls back
  to per-donation fetches when it is missing.
- **User shape.** Login, register and `/auth/me` return the same user object.
- **Time-to-match trend.** `GET /impact/ttm?bucket=day&days=30` returns
  `{bucket, days, targetSeconds, points[{bucket, medianSeconds, avgSeconds, n}]}`.
- **Status-clarity rating.** `PUT /donations/:id/rating` with
  `{rating: 1-5, comment?}`, sent by the donor or by the recipient that
  accepted, once the donation is completed. Averages appear in `/impact/summary` as `statusClarity`.
- **Access control.** A recipient only sees donations offered to it, and only
  its own offer. Matches and pickups are visible to their two parties and to
  admins only.

Frontend UI still to build: the TTM trend chart on the impact dashboard, and a
1–5 rating control on the donation detail page.

## Open items for Person B

1. **No handover verification.** `POST /pickups/:id/picked-up` is called by the
   recipient, and so is `/complete`, so one party drives both ends and the two
   timestamps are not independent evidence that food changed hands. A pickup
   code issued to the collector and verified by the donor would fix it. That
   needs a matching frontend change, so it is planned for the next iteration.
   Until then the pickup timestamps should be described as self-reported in
   the report.
