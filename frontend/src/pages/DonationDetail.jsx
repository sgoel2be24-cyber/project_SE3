import { useParams, useSearchParams, Link } from 'react-router-dom'
import { api } from '../api/client.js'
import { useApi, useMutation, useTicker } from '../hooks/useApi.js'
import { useSession } from '../context/Session.jsx'
import { StatusTimeline } from '../components/StatusTimeline.jsx'
import { statusLabel, foodLabel, dateTimeOf, relative, isUrgent, MATCH_STATUS_LABEL } from '../lib/format.js'

const CANCELLABLE = ['PENDING_REVIEW', 'POSTED']

export function DonationDetail() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const justCreated = params.get('new') === '1'
  const { user } = useSession()

  const detail = useApi(() => api.donationDetail(id), [id])
  useTicker(30000)
  const cancel = useMutation(() => api.cancelDonation(id))

  if (detail.loading) return <div className="skeleton" style={{ height: 240 }} aria-busy="true" />
  if (detail.error) return <div className="banner" data-kind="error" role="alert">{detail.error.message}</div>

  const { donation: d, reviews = [], matches = [], pickups = [] } = detail.data
  const isDonor = user?.role === 'DONOR'
  const acceptedMatch = matches.find((m) => m.status === 'ACCEPTED')
  const pendingMatch = matches.find((m) => m.status === 'PENDING')

  const doCancel = async () => { const r = await cancel.mutate(); if (r.ok) detail.reload() }

  return (
    <>
      {justCreated && (
        <div className="banner" data-kind="ok" style={{ marginBottom: 16 }}>
          Posted. An administrator reviews it before it is offered to organisations.
        </div>
      )}

      <div className="page-head">
        <div className="spread">
          <h1>{d.quantity_servings} servings</h1>
          <span className="pill" data-status={d.status}>{statusLabel(d.status)}</span>
        </div>
        {d.description && <p className="muted">{d.description}</p>}
      </div>

      <div className="stack-lg">
        <section className="card stack">
          <h2>Details</h2>
          <Row label="Food type" value={foodLabel(d.food_type)} />
          {d.pickup_address && <Row label="Collect from" value={d.pickup_address} />}
          <Row label="Deadline" value={`${dateTimeOf(d.expires_at)} · ${relative(d.expires_at)}`}
            urgent={isUrgent(d.expires_at) && !['COMPLETED', 'EXPIRED', 'CANCELLED', 'REJECTED'].includes(d.status)} />
          <Row label="Submitted" value={dateTimeOf(d.submitted_at ?? d.created_at)} />
          {!isDonor && d.donor_name && <Row label="Donor" value={d.donor_name} />}
        </section>

        {d.status === 'PENDING_REVIEW' && (
          <div className="banner" data-kind="warn">
            Waiting for an administrator to approve this listing. It is not visible to
            organisations yet.
          </div>
        )}

        {pendingMatch && (
          <section className="card stack">
            <h2>Waiting on a reply</h2>
            <p className="muted">
              Offered to <strong>{pendingMatch.recipient_name ?? 'an organisation'}</strong>
              {pendingMatch.expires_at ? <> · they must reply {relative(pendingMatch.expires_at)}</> : null}.
              If they decline it goes to the next best organisation automatically.
            </p>
          </section>
        )}

        {acceptedMatch && (
          <section className="card stack">
            <h2>Collecting organisation</h2>
            <Row label="Organisation" value={acceptedMatch.recipient_name ?? '—'} />
            <Row label="Distance" value={acceptedMatch.distance_km != null ? `${Number(acceptedMatch.distance_km).toFixed(2)} km` : '—'} />
            {pickups[0]?.contact_details && <Row label="Contact" value={pickups[0].contact_details} />}
            {pickups[0]?.scheduled_at && <Row label="Scheduled" value={dateTimeOf(pickups[0].scheduled_at)} />}
          </section>
        )}

        <section className="card stack">
          <h2>Status</h2>
          <StatusTimeline donation={d} reviews={reviews} matches={matches} pickups={pickups} />
        </section>

        {matches.length > 0 && (
          <section className="card stack">
            <h2>Match history</h2>
            <p className="muted">Every organisation this donation was offered to, and what they said.</p>
            {matches.map((m) => (
              <div key={m.match_id} className="spread" style={{ alignItems: 'flex-start' }}>
                <span>{m.recipient_name ?? m.recipient_id}</span>
                <span className="muted" style={{ textAlign: 'right' }}>
                  {MATCH_STATUS_LABEL[m.status] ?? m.status}
                  {m.score != null && <> · fit {Math.round(Number(m.score) * 100)}%</>}
                </span>
              </div>
            ))}
          </section>
        )}

        {cancel.error && <div className="banner" data-kind="error" role="alert">{cancel.error.message}</div>}

        {isDonor && CANCELLABLE.includes(d.status) && (
          <button className="btn-danger btn-block" disabled={cancel.busy} onClick={doCancel}>
            {cancel.busy ? 'Cancelling…' : 'Cancel this donation'}
          </button>
        )}

        <Link to="/donations" className="muted">← All donations</Link>
      </div>
    </>
  )
}

function Row({ label, value, urgent }) {
  return (
    <div className="spread" style={{ alignItems: 'flex-start' }}>
      <span className="muted" style={{ flex: '0 0 40%' }}>{label}</span>
      <span style={{ textAlign: 'right', color: urgent ? 'var(--signal)' : undefined, fontWeight: urgent ? 600 : 400 }}>
        {value}
      </span>
    </div>
  )
}
