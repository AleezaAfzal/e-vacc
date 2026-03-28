import { useState } from 'react'
import { supabase } from '../lib/supabase'

export default function VerifyDose({ appointment, onClose, onVerified }) {
  const [batch, setBatch] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  if (!appointment) return null

  async function submit(e) {
    e.preventDefault()
    setErr('')
    setBusy(true)
    const { error } = await supabase.rpc('verify_dose', {
      p_appointment_id: appointment.id,
      p_batch_number: batch.trim(),
    })
    setBusy(false)
    if (error) {
      setErr(error.message || 'Verification failed')
      return
    }
    onVerified?.()
    onClose?.()
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-labelledby="verify-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="verify-title">Verify dose</h2>
        <p className="muted">
          Confirm ID matches{' '}
          <strong>{appointment.profiles?.full_name || 'citizen'}</strong>
          {appointment.profiles?.cnic ? ` — CNIC ${appointment.profiles.cnic}` : ''}. Enter the
          physical batch number from the vial.
        </p>
        <form onSubmit={submit} className="stack">
          <label>
            Batch number
            <input
              value={batch}
              onChange={(e) => setBatch(e.target.value)}
              placeholder="e.g. AB12345"
              required
              minLength={3}
              autoFocus
            />
          </label>
          {err && <p className="error">{err}</p>}
          <div className="row gap">
            <button type="button" className="btn ghost" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn primary" disabled={busy}>
              {busy ? 'Recording…' : 'Verify & record'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
