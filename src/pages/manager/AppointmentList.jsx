import { useCallback, useEffect, useState } from 'react'
import { format } from 'date-fns'
import VerifyDose from '../../components/VerifyDose'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/useAuth'

export default function AppointmentList() {
  const { session } = useAuth()
  const [rows, setRows] = useState([])
  const [profilesById, setProfilesById] = useState({})
  const [pick, setPick] = useState(null)
  const today = format(new Date(), 'yyyy-MM-dd')

  const load = useCallback(async () => {
    const uid = session?.user?.id
    if (!uid) return
    const { data: centers } = await supabase.from('centers').select('id').eq('manager_id', uid)
    const cids = (centers || []).map((c) => c.id)
    if (!cids.length) {
      setRows([])
      return
    }
    const { data: slots } = await supabase.from('slots').select('id').in('center_id', cids).eq('slot_date', today)
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
        slots (
          slot_date,
          slot_time,
          slot_end_time,
          vaccines ( name ),
          centers ( name )
        )
      `,
      )
      .in('slot_id', sids)
      .order('created_at')
    if (error) {
      console.error(error)
      setRows([])
      setProfilesById({})
      return
    }

    const appts = data || []
    setRows(appts)

    const citizenIds = [...new Set(appts.map((a) => a.citizen_id).filter(Boolean))]
    if (!citizenIds.length) {
      setProfilesById({})
      return
    }

    const { data: profilesData, error: profilesErr } = await supabase
      .from('profiles')
      .select('id, full_name, cnic')
      .in('id', citizenIds)

    if (profilesErr) {
      console.error(profilesErr)
      setProfilesById({})
      return
    }

    const map = {}
    ;(profilesData || []).forEach((p) => {
      map[p.id] = p
    })
    setProfilesById(map)
  }, [session?.user?.id, today])

  useEffect(() => {
    load()
    const ch = supabase
      .channel('mgr_appt_rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'appointments' }, load)
      .subscribe()
    return () => {
      supabase.removeChannel(ch)
    }
  }, [load])

  return (
    <div className="stack gap-lg">
      <div>
        <h1>Today&apos;s queue</h1>
        <p className="muted">Date: {today}</p>
      </div>
      <div className="card appointments-table-card">
        <table className="table">
          <thead>
            <tr>
              <th>Citizen</th>
              <th>CNIC</th>
              <th>Vaccine</th>
              <th>Time</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => (
              <tr key={a.id}>
                <td>{profilesById[a.citizen_id]?.full_name || '—'}</td>
                <td className="mono">{profilesById[a.citizen_id]?.cnic || '—'}</td>
                <td>{a.slots?.vaccines?.name}</td>
                <td>
                  {a.slots?.slot_time ? String(a.slots.slot_time).slice(0, 5) : '—'}
                  {a.slots?.slot_end_time ? ` - ${String(a.slots.slot_end_time).slice(0, 5)}` : ''}
                </td>
                <td>
                  <span className={`pill ${a.status}`}>{a.status}</span>
                </td>
                <td className="end">
                  {a.status === 'scheduled' && (
                    <button type="button" className="btn primary small" onClick={() => setPick(a)}>
                      Verify dose
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <p className="muted">No appointments for your centres today.</p>}
      </div>
      <VerifyDose
        appointment={pick}
        onClose={() => setPick(null)}
        onVerified={() => {
          setPick(null)
          load()
        }}
      />
    </div>
  )
}
