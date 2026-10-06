import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api/client.js'
import { Field, Segmented } from '../components/Field.jsx'
import { FOOD_TYPES } from '../lib/format.js'

const PLACES = [
  ['Thapar Institute, Patiala', 30.3548, 76.3626],
  ['Model Town, Patiala', 30.3398, 76.3869],
  ['Urban Estate, Patiala', 30.3221, 76.4009],
  ['Leela Bhawan, Patiala', 30.3345, 76.3924],
  ['Tripuri, Patiala', 30.3122, 76.4041],
]

/** Tap targets beat a date picker on a phone. */
const WINDOWS = [{ value: '2', label: '2 hours' }, { value: '4', label: '4 hours' }, { value: '6', label: '6 hours' }]

/**
 * Donor submission form.
 *
 * The design constraint from the proposal is that a donor's entire obligation
 * fits in one short form on a phone: five inputs, no wizard, and nothing asked
 * for that the system can derive.
 */
export function DonorNew() {
  const navigate = useNavigate()
  const [foodType, setFoodType] = useState('COOKED_MEALS')
  const [description, setDescription] = useState('')
  const [servings, setServings] = useState('')
  const [place, setPlace] = useState(PLACES[0][0])
  const [hours, setHours] = useState('4')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const onSubmit = async (e) => {
    e.preventDefault()
    setBusy(true); setError(null)
    const [pickupAddress, latitude, longitude] = PLACES.find(([p]) => p === place) ?? PLACES[0]
    try {
      const r = await api.createDonation({
        foodType,
        description: description.trim() || undefined,
        quantityServings: servings === '' ? NaN : Number(servings),
        pickupAddress, latitude, longitude,
        expiresInHours: Number(hours),
      })
      navigate(`/donations/${r.donation.donation_id}?new=1`)
    } catch (err) { setError(err) } finally { setBusy(false) }
  }

  const fieldErr = (k) => error?.fields?.[k]

  return (
    <>
      <div className="page-head">
        <h1>Post surplus food</h1>
        <p className="muted">Takes under a minute. An administrator approves it, then we find a nearby organisation.</p>
      </div>

      {error && !Object.keys(error.fields ?? {}).length && (
        <div className="banner" data-kind="error" role="alert" style={{ marginBottom: 16 }}>{error.message}</div>
      )}

      <form className="stack-lg" onSubmit={onSubmit} noValidate>
        <div className="field">
          <label>What kind of food?</label>
          <Segmented name="Food type" value={foodType} onChange={setFoodType}
            options={FOOD_TYPES.map(([value, label]) => ({ value, label }))} />
        </div>

        <Field label="What is it?" htmlFor="description"
          hint="A short description is enough — e.g. rice, dal and vegetable curry"
          error={fieldErr('description')}>
          {(p) => <input {...p} value={description} onChange={(e) => setDescription(e.target.value)}
            placeholder="Rice, dal, mixed vegetable curry" autoComplete="off" />}
        </Field>

        <Field label="How many servings?" htmlFor="quantityServings" error={fieldErr('quantityServings')}>
          {(p) => <input {...p} type="number" inputMode="numeric" min="1" step="1"
            value={servings} onChange={(e) => setServings(e.target.value)} placeholder="60" />}
        </Field>

        <Field label="Where is it collected from?" htmlFor="pickupAddress" error={fieldErr('pickupAddress')}>
          {(p) => (
            <select {...p} value={place} onChange={(e) => setPlace(e.target.value)}>
              {PLACES.map(([name]) => <option key={name} value={name}>{name}</option>)}
            </select>
          )}
        </Field>

        <div className="field" data-invalid={fieldErr('expiresInHours') ? 'true' : 'false'}>
          <label>Collect within</label>
          <span className="hint">After this deadline the food is counted as wasted.</span>
          <Segmented name="Collection window" options={WINDOWS} value={hours} onChange={setHours} />
          {fieldErr('expiresInHours') && <span className="field-error" role="alert">{fieldErr('expiresInHours')}</span>}
        </div>

        <button type="submit" className="btn-primary btn-block" disabled={busy}>
          {busy ? 'Posting…' : 'Post donation'}
        </button>
        <p className="hint" style={{ textAlign: 'center' }}>
          Your contact details are shared only after an organisation accepts.
        </p>
      </form>
    </>
  )
}
