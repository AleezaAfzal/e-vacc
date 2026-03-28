import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/useAuth'

export default function AllAppointments() {
  const { session } = useAuth()
  const [rows, setRows] = useState([])
  const [profilesById, setProfilesById] = useState({})
  const [statusFilter, setStatusFilter] = useState('all')
  const [err, setErr] = useState('')

  const load = useCallback(async () => {
    const uid = session?.user?.id
    if (!uid) return
    const { data: centers } = await supabase.from('centers').select('id').eq('manager_id', uid)
    const cids = (centers || []).map((c) => c.id)
    if (!cids.length) {
      setRows([])
      return
    }

    const { data: slots } = await supabase.from('slots').select('id').in('center_id', cids)
    const sids = (slots || []).map((s) => s.id)
    if (!sids.length) {
      setRows([])
      return
    }

    const { data, error } = await supabase
      .from('appointments')
      .select(
        `
        id,
        citizen_id,
        status,
        batch_number,
        created_at,
        slots (
          slot_date,
          slot_time,
          slot_end_time,
          room_label,
          vaccines ( name ),
          centers ( name )
        )
      `,
      )
      .in('slot_id', sids)
      .order('created_at', { ascending: false })

    if (error) {
      setErr(error.message)
      setProfilesById({})
      return
    }

    const appts = data || []
    setRows(appts)

    const citizenIds = [...new Set(appts.map((a) => a.citizen_id).filter(Boolean))]
    if (!citizenIds.length) {
      setProfilesById({})
      setErr('')
      return
    }

    const { data: profilesData, error: profilesErr } = await supabase
      .from('profiles')
      .select('id, full_name, cnic')
      .in('id', citizenIds)

    if (profilesErr) {
      setErr(profilesErr.message)
      setProfilesById({})
      return
    }

    const map = {}
    ;(profilesData || []).forEach((p) => {
      map[p.id] = p
    })
    setProfilesById(map)
    setErr('')
  }, [session?.user?.id])

  useEffect(() => {
    load()
    const ch = supabase
      .channel('manager_all_appts_rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'appointments' }, load)
      .subscribe()
    return () => {
      supabase.removeChannel(ch)
    }
  }, [load])

  const filteredRows = useMemo(() => {
    if (statusFilter === 'all') return rows
    if (statusFilter === 'verified') {
      return rows.filter((r) => r.status === 'completed' && String(r.batch_number || '').trim())
    }
    return rows.filter((r) => r.status === statusFilter)
  }, [rows, statusFilter])

  return (
    <div className="stack gap-lg">
      <div>
        <h1>All Appointments</h1>
        <p className="muted">Filter by booked, completed, cancelled, or verified users.</p>
      </div>
      {err && <p className="error">{err}</p>}

      <div className="card appointments-filter-card">
        <label className="appointments-filter-label" style={{ maxWidth: 260 }}>
          Filter
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="all">All</option>
            <option value="scheduled">Booked</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
            <option value="verified">Verified user</option>
          </select>
        </label>
      </div>

      <div className="card appointments-table-card">
        <table className="table">
          <thead>
            <tr>
              <th>Citizen</th>
              <th>CNIC</th>
              <th>Centre</th>
              <th>Vaccine</th>
              <th>Date/Time</th>
              <th>Status</th>
              <th>Batch</th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.map((a) => (
              <tr key={a.id}>
                <td>{profilesById[a.citizen_id]?.full_name || '—'}</td>
                <td className="mono">{profilesById[a.citizen_id]?.cnic || '—'}</td>
                <td>{a.slots?.centers?.name || '—'}</td>
                <td>{a.slots?.vaccines?.name || '—'}</td>
                <td>
                  {a.slots?.slot_date || '—'} {a.slots?.slot_time ? String(a.slots.slot_time).slice(0, 5) : ''}
                  {a.slots?.slot_end_time ? ` - ${String(a.slots.slot_end_time).slice(0, 5)}` : ''}
                </td>
                <td>
                  <span className={`pill ${a.status}`}>{a.status}</span>
                </td>
                <td className="mono">{a.batch_number || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!filteredRows.length && <p className="muted">No appointments match this filter.</p>}
      </div>
    </div>
  )
}
