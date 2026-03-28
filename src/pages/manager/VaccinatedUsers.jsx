import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/useAuth'

export default function VaccinatedUsers() {
  const { session } = useAuth()
  const [users, setUsers] = useState([])
  const [profilesById, setProfilesById] = useState({})
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const uid = session?.user?.id
    if (!uid) return

    // Get all centers managed by this manager
    const { data: centers } = await supabase.from('centers').select('id').eq('manager_id', uid)
    const cids = (centers || []).map((c) => c.id)
    if (!cids.length) {
      setUsers([])
      setLoading(false)
      return
    }

    // Get all vax records for those centers
    const { data, error } = await supabase
      .from('vax_records')
      .select(
        `
        id,
        citizen_id,
        dose_number,
        batch_number,
        administered_at,
        vaccines ( name )
      `,
      )
      .in('center_id', cids)
      .order('administered_at', { ascending: false })

    if (error) {
      console.error(error)
      setUsers([])
      setProfilesById({})
      setLoading(false)
      return
    }

    const rows = data || []
    setUsers(rows)

    const citizenIds = [...new Set(rows.map((r) => r.citizen_id).filter(Boolean))]
    if (!citizenIds.length) {
      setProfilesById({})
      setLoading(false)
      return
    }

    const { data: profilesData, error: profilesErr } = await supabase
      .from('profiles')
      .select('id, full_name, cnic')
      .in('id', citizenIds)

    if (profilesErr) {
      console.error(profilesErr)
      setProfilesById({})
      setLoading(false)
      return
    }

    const map = {}
    ;(profilesData || []).forEach((p) => {
      map[p.id] = p
    })
    setProfilesById(map)
    setLoading(false)
  }, [session?.user?.id])

  useEffect(() => {
    load()
    const ch = supabase
      .channel('mgr_vacc_users')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vax_records' }, load)
      .subscribe()
    return () => {
      supabase.removeChannel(ch)
    }
  }, [load])

  const unique = {}
  const uniqueUsers = []
  users.forEach((u) => {
    const profile = profilesById[u.citizen_id] || {}
    const key = profile.cnic || u.citizen_id
    if (!unique[key]) {
      unique[key] = true
      uniqueUsers.push({
        cnic: profile.cnic,
        full_name: profile.full_name,
        citizen_id: u.citizen_id,
        doses: users.filter((v) => v.citizen_id === u.citizen_id).length,
      })
    }
  })

  if (loading) {
    return (
      <div className="stack gap-lg">
        <p className="muted">Loading...</p>
      </div>
    )
  }

  return (
    <div className="stack gap-lg">
      <div>
        <h1>Vaccinated users</h1>
        <p className="muted">All users who received vaccines at your centre(s).</p>
      </div>

      <div className="card">
        <table className="table">
          <thead>
            <tr>
              <th>CNIC</th>
              <th>Full name</th>
              <th>Doses administered</th>
            </tr>
          </thead>
          <tbody>
            {uniqueUsers.map((u) => (
              <tr key={u.citizen_id}>
                <td className="mono">{u.cnic || '—'}</td>
                <td>{u.full_name || '—'}</td>
                <td>{u.doses}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!uniqueUsers.length && <p className="muted">No users have been vaccinated at your centre(s) yet.</p>}
      </div>
    </div>
  )
}
