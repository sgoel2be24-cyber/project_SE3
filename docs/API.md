# FoodBridge API Reference (Person B — Backend API)

Base URL: `http://localhost:3000/api`
Auth: `Authorization: Bearer <JWT>` from `/auth/login` or `/auth/register`.
Errors: `{ "error": { "code": string, "message": string, "details?": any } }`
with correct HTTP codes (400 validation, 401 auth, 403 role, 404 missing,
409 illegal state/transition, 502 matcher unreachable).

Roles: `DONOR`, `RECIPIENT`, `ADMIN`.

## /api/auth

| Method & path | Role | Body → Response |
|---|---|---|
| `POST /auth/register` | public | `{name,email,password(≥8),role,phone?}` + donor: `{donorType}` or recipient: `{organizationType,servingCapacity,serviceRadiusKm?,foodPreferences?[],dietaryRestrictions?[],latitude,longitude}` → `201 {user,profile,token}` |
| `POST /auth/login` | public | `{email,password}` → `{user,profile,token}` |
| `GET /auth/me` | any | → `{user,profile}` |

Every auth endpoint returns `user` in the same shape: the `users` row in snake_case (`user_id, name, email, phone, role, address, latitude, longitude, created_at`), never the password hash.
| `PATCH /auth/profile` | any | profile fields (recipients: capacity/radius/preferences/active) → `{user,profile}` |

## /api/donations

| Method & path | Role | Notes |
|---|---|---|
| `POST /donations` | DONOR | `{foodType,description?,quantityServings,latitude+longitude \| pickupAddress,expiresAt \| expiresInHours,pickupStart?,pickupEnd?}` → `201 {donation(PENDING_REVIEW), locationSource}` |
| `GET /donations/mine` | DONOR | own donations, newest first |
| `GET /donations/:id` | owner / ADMIN / matched RECIPIENT | `{donation,reviews[],matches[],pickups[]}` — audit trail for the timeline UI. A recipient only gets donations offered to it (else `403`), and `matches`/`pickups` are filtered to its own. |
| `POST /donations/:id/cancel` | DONOR (owner) | only from `PENDING_REVIEW`/`POSTED` |
| `PUT /donations/:id/rating` | DONOR (owner) / RECIPIENT (accepted it) | `{rating: 1-5, comment?}` → `{rating}`. Status-clarity rating; re-submitting replaces the earlier one. |

## /api/admin

| Method & path | Role | Notes |
|---|---|---|
| `GET /admin/donations/pending` | ADMIN | review queue (`PENDING_REVIEW`) |
| `GET /admin/donations/:id` | ADMIN | donation + review history |
| `PATCH /admin/donations/:id/review` | ADMIN | `{decision: APPROVED\|REJECTED, remarks?}` → approve: `PENDING_REVIEW→POSTED`; reject: `→REJECTED`. Row lock + transaction; second review → `409 ALREADY_REVIEWED`. Review persisted in `donation_reviews`. |
| `POST /admin/matching/run` | ADMIN | `{strategy?: "greedy"\|"hungarian"}` → one matching cycle: `{strategy, assignments[], waitlisted[], explanations[], expiredDonations[], expiredMatches[]}` |
| `GET /admin/waitlist` | ADMIN | donations that found no eligible recipient (never dropped) |

## /api/matches

| Method & path | Role | Notes |
|---|---|---|
| `GET /matches/inbox` | RECIPIENT | own match offers, newest first. Each offer embeds `donation: {donation_id, food_type, description, quantity_servings, pickup_address, pickup_start, pickup_end, expires_at, status, donor_name}`. |
| `GET /matches/:id` | the match's recipient / the donation's donor / ADMIN | match detail with score breakdown; anyone else `403` |
| `POST /matches/:id/accept` | RECIPIENT (owner of match) | `PENDING→ACCEPTED`; creates **Pickup (SCHEDULED)** with scheduledAt + contactDetails; donation stays `MATCHED` |
| `POST /matches/:id/reject` | RECIPIENT (owner) | `PENDING→REJECTED`, donation requeued `MATCHED→POSTED`, rejecter excluded from immediate retry, fresh matching cycle runs → `{rematched, newMatch, cycle}` |

## /api/pickups

| Method & path | Role | Notes |
|---|---|---|
| `GET /pickups/mine` | any | recipient/donor-scoped list |
| `GET /pickups/:id` | the pickup's recipient / the donation's donor / ADMIN | detail; anyone else `403` |
| `POST /pickups/:id/picked-up` | the two parties / ADMIN | `SCHEDULED→PICKED_UP` **and** donation `MATCHED→PICKED_UP` (one transaction) |
| `POST /pickups/:id/complete` | the two parties / ADMIN | `PICKED_UP→COMPLETED` **and** donation `→COMPLETED`; donor meal counter + recipient capacity release in the same transaction |

## /api/notifications

| Method & path | Role | Notes |
|---|---|---|
| `GET /notifications` | any | `{notifications[], unread}` |
| `PATCH /notifications/:id/read` | owner | |
| `POST /notifications/read-all` | owner | |

Notification types: `ADMIN_REVIEW_REQUIRED, DONATION_APPROVED,
DONATION_REJECTED, NEW_ELIGIBLE_DONATION, MATCH_CREATED, MATCH_ACCEPTED,
MATCH_REJECTED, DONOR_AWAITING_MATCH, PICKUP_SCHEDULED, PICKUP_PICKED_UP,
REDISTRIBUTION_COMPLETED, MATCH_EXPIRED`. In-app only (no SMS/email).

## /api/impact

| Method & path | Role | Notes |
|---|---|---|
| `GET /impact/summary` | any | `{mealsRedistributed, completedDonations, wasteDivertedKg, wasteAssumptionKgPerServing, timeToMatch{avgSeconds,medianSeconds,samples}, unmatchedCount, unmatchedRate, waitlistedCount, expiredCount, statusClarity{donor{avg,n},recipient{avg,n}}, topDonors[]}` — all computed from persisted rows/timestamps |
| `GET /impact/ttm?bucket=day\|week&days=30` | any | time-to-match trend by the day/week donations were posted: `{bucket, days, targetSeconds: 1200, points[{bucket: 'YYYY-MM-DD', medianSeconds, avgSeconds, n}]}` |

## Matching service (separate process, :8000)

| Method & path | Notes |
|---|---|
| `GET /health` | liveness + strategies |
| `POST /match/run` | JSON contract in `matching-service/models.py`; backend precomputes pair distances with PostGIS `ST_DWithin`/`ST_Distance` and passes them as `pairDistances` |

## Status models enforced centrally

- **Donation**: `PENDING_REVIEW → POSTED → MATCHED → PICKED_UP → COMPLETED`;
  sides: `REJECTED`, `CANCELLED`, `EXPIRED`; rematch requeue `MATCHED→POSTED`.
- **Match**: `PENDING → ACCEPTED | REJECTED | EXPIRED` (terminal).
- **Pickup**: `SCHEDULED → PICKED_UP → COMPLETED`; `SCHEDULED→CANCELLED`.

All in `backend/src/domain/stateMachines.ts`; illegal transitions return
`409 INVALID_TRANSITION` / `409 INVALID_STATE`.
