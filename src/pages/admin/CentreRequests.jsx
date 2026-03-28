import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'

export default function CentreRequests() {
  const [pending, setPending] = useState([])
  const [profiles, setProfiles] = useState({})
  const [stats, setStats] = useState({})
  const [err, setErr] = useState('')

  const load = useCallback(async () => {
    const { data: centers, error } = await supabase
      .from('centers')
      .select('*')
      .eq('status', 'pending')
      .order('created_at')

    if (error) {
      setErr(error.message)
      return
    }

    const rows = centers || []
    setPending(rows)
    setErr('')

    const managerIds = [...new Set(rows.map((c) => c.manager_id))]
    if (managerIds.length) {
      const { data: profs } = await supabase.from('profiles').select('id, full_name, cnic').in('id', managerIds)
      const map = {}
      ;(profs || []).forEach((p) => {
        map[p.id] = p
      })
      setProfiles(map)
    } else {
      setProfiles({})
    }

    const centerIds = rows.map((c) => c.id)
    if (!centerIds.length) {
      setStats({})
      return
    }

    const [{ data: slots }, { data: records }, { data: centerStock }] = await Promise.all([
      supabase.from('slots').select('id, center_id'),
      supabase.from('vax_records').select('center_id, citizen_id').in('center_id', centerIds),
      supabase.from('center_vaccine_stock').select('center_id, doses_remaining').in('center_id', centerIds),
    ])

    const slotIds = (slots || []).filter((s) => centerIds.includes(s.center_id)).map((s) => s.id)
    const slotToCenter = {}
    ;(slots || []).forEach((s) => {
      if (centerIds.includes(s.center_id)) slotToCenter[s.id] = s.center_id
    })

    const { data: appts } = slotIds.length
      ? await supabase.from('appointments').select('slot_id, status').in('slot_id', slotIds)
      : { data: [] }

    const st = {}
    rows.forEach((c) => {
      st[c.id] = { stockLeft: 0, vaccinatedPeople: 0, booked: 0 }
    })

    ;(centerStock || []).forEach((r) => {
      if (st[r.center_id]) st[r.center_id].stockLeft += Number(r.doses_remaining) || 0
    })

    ;(appts || []).forEach((a) => {
      const cid = slotToCenter[a.slot_id]
      if (cid && st[cid] && a.status === 'scheduled') st[cid].booked += 1
    })

    const seen = {}
    ;(records || []).forEach((r) => {
      const key = `${r.center_id}:${r.citizen_id}`
      if (!r.center_id || !r.citizen_id || seen[key] || !st[r.center_id]) return
      seen[key] = true
      st[r.center_id].vaccinatedPeople += 1
    })

    setStats(st)
  }, [])

  useEffect(() => {
    load()
    const ch = supabase
      .channel('centers_approval_rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'centers' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'appointments' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'center_vaccine_stock' }, load)
      .subscribe()
    return () => {
      supabase.removeChannel(ch)
    }
  }, [load])

  async function setStatus(id, status) {
    setErr('')
    const { error } = await supabase.from('centers').update({ status }).eq('id', id)
    if (error) {
      setErr(error.message)
      return
    }
    load()
  }

  const totalPending = useMemo(() => pending.length, [pending])

  return (
    <div className="stack gap-lg">
      <div>
        <h1>Centre Approvals</h1>
        <p className="muted">Approve or reject new centre requests with key stock and usage signals.</p>
      </div>

      {err && <p className="error">{err}</p>}

      <div className="card">
        <p className="muted small" style={{ margin: 0 }}>
          Pending requests: {totalPending}
        </p>
      </div>

      <div className="card">
        <table className="table">
          <thead>
            <tr>
              <th>Centre</th>
              <th>Manager</th>
              <th>Open location</th>
              <th>Stock left</th>
              <th>Scheduled</th>
              <th>Vaccinated</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {pending.map((c) => {
              const m = profiles[c.manager_id]
              const s = stats[c.id] || { stockLeft: 0, booked: 0, vaccinatedPeople: 0 }
              return (
                <tr key={c.id}>
                  <td>
                    <div>{c.name}</div>
                    <div className="muted small">{c.address}</div>
                  </td>
                  <td>
                    <div>{m?.full_name || '—'}</div>
                    <div className="muted small">{m?.cnic || 'no CNIC'}</div>
                  </td>
                  <td>
                    <a href={`https://www.google.com/maps?q=${c.lat},${c.lng}`} target="_blank" rel="noreferrer">
                      View location
                    </a>
                  </td>
                  <td>{s.stockLeft}</td>
                  <td>{s.booked}</td>
                  <td>{s.vaccinatedPeople}</td>
                  <td className="row gap tight end">
                    <button type="button" className="btn primary small" onClick={() => setStatus(c.id, 'active')}>
                      Approve
                    </button>
                    <button type="button" className="btn danger small" onClick={() => setStatus(c.id, 'rejected')}>
                      Reject
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {!pending.length && <p className="muted">No pending centre requests.</p>}
      </div>
    </div>
  )
}
