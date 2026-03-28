import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { addDays, format, parseISO } from 'date-fns'
import { useAuth } from '../../context/useAuth'
import { supabase } from '../../lib/supabase'

export default function CitizenDashboard() {
  const { profile, session } = useAuth()
  const [vax, setVax] = useState([])
  const [vaccines, setVaccines] = useState([])
  const [certs, setCerts] = useState([])
  const [appts, setAppts] = useState([])

  const load = useCallback(async () => {
    const uid = session?.user?.id
    if (!uid) return
    const [{ data: vr }, { data: vac }, { data: cr }, { data: ap }] = await Promise.all([
      supabase.from('vax_records').select('*, vaccines(*)').eq('citizen_id', uid).order('administered_at'),
      supabase.from('vaccines').select('*'),
      supabase.from('certificates').select('*, vaccines(name)').eq('citizen_id', uid),
      supabase
        .from('appointments')
        .select('*, slots(*, vaccines(name), centers(name))')
        .eq('citizen_id', uid)
        .eq('status', 'scheduled')
        .order('created_at'),
    ])
    setVax(vr || [])
    setVaccines(vac || [])
    setCerts(cr || [])
    setAppts(ap || [])
  }, [session?.user?.id])

  useEffect(() => {
    load()
    const uid = session?.user?.id
    if (!uid) return
    const ch = supabase
      .channel(`citizen_${uid}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vax_records' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'certificates' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'appointments' }, load)
      .subscribe()
    return () => {
      supabase.removeChannel(ch)
    }
  }, [session?.user?.id, load])

  const age = useMemo(() => {
    if (!profile?.dob) return null
    const d = typeof profile.dob === 'string' ? parseISO(profile.dob) : profile.dob
    const y = new Date().getFullYear() - d.getFullYear()
    const m = new Date().getMonth() - d.getMonth()
    if (m < 0 || (m === 0 && new Date().getDate() < d.getDate())) return y - 1
    return y
  }, [profile?.dob])

  const stateByVaccine = useMemo(() => {
    const map = {}
    vaccines.forEach((v) => {
      const taken = vax.filter((r) => r.vaccine_id === v.id)
      const last = taken.length
        ? taken.reduce((a, b) => (a.administered_at > b.administered_at ? a : b))
        : null
      const lastDate = last ? parseISO(last.administered_at) : null
      const eligibleFrom =
        lastDate && v.interval_days > 0 ? addDays(lastDate, v.interval_days) : null
      map[v.id] = {
        vaccine: v,
        count: taken.length,
        complete: taken.length >= v.doses_required,
        eligibleFrom,
        canBookMore: taken.length < v.doses_required,
      }
    })
    return map
  }, [vaccines, vax])

  return (
    <div className="stack gap-lg">
      <div>
        <h1>Citizen dashboard</h1>
        <p className="muted">
          {profile?.full_name}
          {age != null ? ` · Age ${age}` : ''}
        </p>
      </div>

      <div className="card row spread wrap gap">
        <div>
          <h2 style={{ marginTop: 0 }}>Profile and certificates</h2>
          <p className="muted small">Manage immutable identity details and generate certificates from dedicated pages.</p>
        </div>
        <div className="row gap wrap">
          <Link className="btn ghost" to="/citizen/profile">Open profile</Link>
          <Link className="btn primary" to="/citizen/certificates">Open certificates</Link>
        </div>
      </div>

      <div className="card">
        <h2>Scheduled appointments</h2>
        {!appts.length && <p className="muted">No upcoming bookings.</p>}
        <ul className="list">
          {appts.map((a) => (
            <li key={a.id}>
              <strong>{a.slots?.vaccines?.name}</strong> at {a.slots?.centers?.name} — {a.slots?.slot_date}{' '}
              {a.slots?.slot_time ? String(a.slots.slot_time).slice(0, 5) : ''}
              {a.slots?.slot_end_time ? ` - ${String(a.slots.slot_end_time).slice(0, 5)}` : ''}
            </li>
          ))}
        </ul>
        <Link className="btn primary" to="/citizen/browse">
          Browse slots
        </Link>
      </div>

      <div className="card">
        <h2>Vaccination progress</h2>
        <p className="muted small">
          After dose 1 is verified, the next dose cannot be booked until the interval has passed. Once all required
          doses are verified, you cannot book that vaccine again.
        </p>
        <div className="stack gap">
          {vaccines.map((v) => {
            const s = stateByVaccine[v.id]
            if (!s) return null
            const waiting =
              s.count > 0 &&
              s.count < v.doses_required &&
              s.eligibleFrom &&
              new Date() < s.eligibleFrom
            return (
              <div key={v.id} className="progress-row">
                <div>
                  <strong>{v.name}</strong>
                  <div className="muted small">
                    {s.count} / {v.doses_required} verified doses
                  </div>
                  {waiting && (
                    <div className="warn small">
                      Book dose {s.count + 1} on or after {format(s.eligibleFrom, 'yyyy-MM-dd')}.
                    </div>
                  )}
                  {s.complete && <div className="success small">Course complete for this vaccine.</div>}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div className="card">
        <h2>Certificates status</h2>
        <p className="muted small">{certs.length} certificate record(s) available. Use Certificates page to generate/download.</p>
      </div>
    </div>
  )
}
