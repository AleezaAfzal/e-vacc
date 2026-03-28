import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/useAuth'

export default function RequestStock() {
  const { session } = useAuth()
  const [centers, setCenters] = useState([])
  const [vaccines, setVaccines] = useState([])
  const [requests, setRequests] = useState([])
  const [centerId, setCenterId] = useState('')
  const [vaccineId, setVaccineId] = useState('')
  const [reqDoses, setReqDoses] = useState('')
  const [reqNote, setReqNote] = useState('')
  const [err, setErr] = useState('')
  const [ok, setOk] = useState('')

  const loadCenters = useCallback(async () => {
    const uid = session?.user?.id
    if (!uid) return
    const { data } = await supabase
      .from('centers')
      .select('id, name')
      .eq('manager_id', uid)
      .eq('status', 'active')
      .order('name')

    setCenters(data || [])
    setCenterId((prev) => prev || data?.[0]?.id || '')
  }, [session?.user?.id])

  const loadVaccines = useCallback(async () => {
    const { data } = await supabase.from('vaccines').select('id, name').order('name')
    setVaccines(data || [])
  }, [])

  const loadRequests = useCallback(async () => {
    if (!centerId) {
      setRequests([])
      return
    }

    const { data, error } = await supabase
      .from('center_dose_requests')
      .select('id, requested_doses, note, status, created_at, vaccines(name)')
      .eq('center_id', centerId)
      .order('created_at', { ascending: false })

    if (error) {
      setErr(error.message)
      return
    }

    setRequests(data || [])
  }, [centerId])

  useEffect(() => {
    if (!session?.user?.id) return
    loadCenters()
    loadVaccines()
  }, [session?.user?.id, loadCenters, loadVaccines])

  useEffect(() => {
    loadRequests()
    if (!centerId) return

    const ch = supabase
      .channel(`manager_stock_${centerId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'center_dose_requests', filter: `center_id=eq.${centerId}` },
        loadRequests,
      )
      .subscribe()

    return () => {
      supabase.removeChannel(ch)
    }
  }, [centerId, loadRequests])

  useEffect(() => {
    if (!vaccineId && vaccines.length) {
      setVaccineId(vaccines[0].id)
    }
  }, [vaccines, vaccineId])

  async function requestDoses(e) {
    e.preventDefault()
    setErr('')
    setOk('')

    const doses = Number(reqDoses)
    if (!centerId || !vaccineId || !Number.isFinite(doses) || doses <= 0) {
      setErr('Select vaccine and enter a positive dose quantity.')
      return
    }

    const { data, error } = await supabase.rpc('request_center_stock', {
      p_center_id: centerId,
      p_vaccine_id: vaccineId,
      p_doses: doses,
      p_note: reqNote || null,
    })

    if (error) {
      setErr(error.message)
      return
    }

    setReqDoses('')
    setReqNote('')
    setOk(`Dose request sent. Request id: ${data}`)
    loadRequests()
  }

  if (!centers.length) {
    return (
      <div className="card">
        <h1>Request stock</h1>
        <p className="muted">You need an approved active centre before requesting doses.</p>
      </div>
    )
  }

  return (
    <div className="stack gap-lg">
      <div className="card">
        <h1>Centre stock requests</h1>
        <p className="muted small">Request vaccine doses from admin in a separate workflow from slot scheduling.</p>

        <form onSubmit={requestDoses} className="grid-form" style={{ marginTop: '1rem' }}>
          <label>
            Centre
            <select value={centerId} onChange={(e) => setCenterId(e.target.value)}>
              {centers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Vaccine
            <select value={vaccineId} onChange={(e) => setVaccineId(e.target.value)} required>
              <option value="">Select vaccine</option>
              {vaccines.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Requested doses
            <input
              type="number"
              min={1}
              value={reqDoses}
              onChange={(e) => setReqDoses(e.target.value)}
              placeholder="e.g. 150"
              required
            />
          </label>
          <label>
            Note (optional)
            <input value={reqNote} onChange={(e) => setReqNote(e.target.value)} placeholder="Expected demand this week" />
          </label>
          <div className="align-end">
            <button type="submit" className="btn primary">
              Send request
            </button>
          </div>
        </form>

        {err && <p className="error">{err}</p>}
        {ok && <p className="success">{ok}</p>}
      </div>

      <div className="card">
        <h2>Request history</h2>
        <table className="table">
          <thead>
            <tr>
              <th>Vaccine</th>
              <th>Doses</th>
              <th>Status</th>
              <th>Note</th>
              <th>Created</th>
            </tr>
          </thead>
          <tbody>
            {requests.map((r) => (
              <tr key={r.id}>
                <td>{r.vaccines?.name || '—'}</td>
                <td>{r.requested_doses}</td>
                <td>
                  <span className={`pill ${r.status}`}>{r.status}</span>
                </td>
                <td>{r.note || '—'}</td>
                <td>{new Date(r.created_at).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!requests.length && <p className="muted">No requests yet for this centre.</p>}
      </div>
    </div>
  )
}
