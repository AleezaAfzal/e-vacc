import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

export default function DoseRequests() {
  const [rows, setRows] = useState([])
  const [err, setErr] = useState('')
  const [busyId, setBusyId] = useState('')

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('center_dose_requests')
      .select('id, center_id, vaccine_id, requested_doses, note, status, created_at, centers(name), vaccines(name)')
      .eq('status', 'pending')
      .order('created_at')
    if (error) {
      setErr(error.message)
      return
    }
    setRows(data || [])
    setErr('')
  }, [])

  useEffect(() => {
    load()
    const ch = supabase
      .channel('dose_requests_rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'center_dose_requests' }, load)
      .subscribe()
    return () => {
      supabase.removeChannel(ch)
    }
  }, [load])

  async function review(id, approve) {
    setErr('')
    setBusyId(id)
    const { error } = await supabase.rpc('review_center_stock_request', {
      p_request_id: id,
      p_approve: approve,
      p_review_note: null,
    })
    setBusyId('')
    if (error) {
      setErr(error.message)
      return
    }
    load()
  }

  return (
    <div className="stack gap-lg">
      <div>
        <h1>Dose Requests from Centres</h1>
        <p className="muted">Centres request more doses here. Use Add doses to allocate stock to that centre and vaccine.</p>
      </div>
      {err && <p className="error">{err}</p>}
      <div className="card">
        <table className="table">
          <thead>
            <tr>
              <th>Centre</th>
              <th>Vaccine</th>
              <th>Requested doses</th>
              <th>Note</th>
              <th>Requested at</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{r.centers?.name || '—'}</td>
                <td>{r.vaccines?.name || '—'}</td>
                <td>{r.requested_doses}</td>
                <td>{r.note || '—'}</td>
                <td>{new Date(r.created_at).toLocaleString()}</td>
                <td className="row gap tight end">
                  <button
                    className="btn primary small"
                    type="button"
                    disabled={busyId === r.id}
                    onClick={() => review(r.id, true)}
                  >
                    {busyId === r.id ? 'Allocating...' : 'Add doses'}
                  </button>
                  <button
                    className="btn danger small"
                    type="button"
                    disabled={busyId === r.id}
                    onClick={() => review(r.id, false)}
                  >
                    Reject
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <p className="muted">No pending dose requests.</p>}
      </div>
    </div>
  )
}
