import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/useAuth'

export default function CreateSlot() {
  const { session } = useAuth()
  const [centers, setCenters] = useState([])
  const [vaccines, setVaccines] = useState([])
  const [centerId, setCenterId] = useState('')
  const [vaccineId, setVaccineId] = useState('')
  const [slotDate, setSlotDate] = useState('')
  const [slotStartTime, setSlotStartTime] = useState('10:00')
  const [slotEndTime, setSlotEndTime] = useState('12:00')
  const [room, setRoom] = useState('Main')
  const [capacity, setCapacity] = useState(10)
  const [err, setErr] = useState('')
  const [ok, setOk] = useState('')
  const [slots, setSlots] = useState([])

  const loadCenters = useCallback(async () => {
    const uid = session?.user?.id
    if (!uid) return
    const { data } = await supabase
      .from('centers')
      .select('*')
      .eq('manager_id', uid)
      .eq('status', 'active')
      .order('name')
    setCenters(data || [])
    setCenterId((prev) => prev || data?.[0]?.id || '')
  }, [session?.user?.id])

  const loadVaccines = useCallback(async () => {
    const { data } = await supabase.from('vaccines').select('id, name').order('name')
    setVaccines(data || [])
    setVaccineId((prev) => prev || data?.[0]?.id || '')
  }, [])

  const loadSlots = useCallback(async () => {
    if (!centerId) {
      setSlots([])
      return
    }
    const { data } = await supabase
      .from('slots')
      .select('*, vaccines(name)')
      .eq('center_id', centerId)
      .gte('slot_date', new Date().toISOString().slice(0, 10))
      .order('slot_date')
      .order('slot_time')
    setSlots(data || [])
  }, [centerId])

  useEffect(() => {
    if (!session?.user?.id) return
    loadCenters()
    loadVaccines()
  }, [session?.user?.id, loadCenters, loadVaccines])

  useEffect(() => {
    loadSlots()
    if (!centerId) return
    const ch = supabase
      .channel(`slots_${centerId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'slots', filter: `center_id=eq.${centerId}` },
        loadSlots,
      )
      .subscribe()
    return () => {
      supabase.removeChannel(ch)
    }
  }, [centerId, loadSlots])

  async function create(e) {
    e.preventDefault()
    setErr('')
    setOk('')

    if (!centerId || !vaccineId) {
      setErr('Select a center and vaccine first.')
      return
    }

    const requestedCapacity = Number(capacity) || 10

    if (!slotStartTime || !slotEndTime || slotEndTime <= slotStartTime) {
      setErr('End time must be after start time.')
      return
    }

    const { error } = await supabase.from('slots').insert({
      center_id: centerId,
      vaccine_id: vaccineId,
      slot_date: slotDate,
      slot_time: `${slotStartTime}:00`.replace(/:00:00$/, ':00'),
      slot_end_time: `${slotEndTime}:00`.replace(/:00:00$/, ':00'),
      room_label: room.trim() || 'Main',
      capacity: requestedCapacity,
    })
    if (error) {
      if (error.code === '23505') {
        setErr('A slot already exists for this centre, date, time, and room.')
      } else {
        setErr(error.message)
      }
      return
    }
    setOk('Slot created.')
    loadSlots()
  }

  async function deleteSlot(slotId) {
    if (!confirm('Delete this slot?')) return
    setErr('')
    setOk('')
    const { error } = await supabase.from('slots').delete().eq('id', slotId)
    if (error) {
      setErr(error.message)
      return
    }
    setOk('Slot deleted.')
    loadSlots()
  }

  if (!centers.length) {
    return (
      <div className="card">
        <h1>Create slots</h1>
        <p className="muted">You need an approved active centre before creating slots.</p>
      </div>
    )
  }

  return (
    <div className="stack gap-lg">
      <div className="card">
        <h1>Slot scheduling</h1>
        <p className="muted small">
          Create and manage your centre slots.
        </p>

        <form onSubmit={create} className="grid-form">
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
            <select value={vaccineId} onChange={(e) => setVaccineId(e.target.value)}>
              <option value="">Select vaccine</option>
              {vaccines.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Date
            <input type="date" value={slotDate} onChange={(e) => setSlotDate(e.target.value)} required />
          </label>
          <label>
            Start time
            <input
              type="time"
              value={slotStartTime}
              onChange={(e) => setSlotStartTime(e.target.value)}
              required
            />
          </label>
          <label>
            End time
            <input
              type="time"
              value={slotEndTime}
              onChange={(e) => setSlotEndTime(e.target.value)}
              required
            />
          </label>
          <label>
            Room
            <input value={room} onChange={(e) => setRoom(e.target.value)} required />
          </label>
          <label>
            Capacity
            <input type="number" min={1} value={capacity} onChange={(e) => setCapacity(e.target.value)} required />
          </label>
          <div className="align-end">
            <button type="submit" className="btn primary">
              Create slot
            </button>
          </div>
        </form>
        {err && <p className="error">{err}</p>}
        {ok && <p className="success">{ok}</p>}
      </div>

      <div className="card">
        <h2>Upcoming slots</h2>
        <table className="table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Time window</th>
              <th>Room</th>
              <th>Vaccine</th>
              <th>Cap</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {slots.map((s) => (
              <tr key={s.id}>
                <td>{s.slot_date}</td>
                <td>
                  {String(s.slot_time).slice(0, 5)} - {s.slot_end_time ? String(s.slot_end_time).slice(0, 5) : '—'}
                </td>
                <td>{s.room_label}</td>
                <td>{s.vaccines?.name}</td>
                <td>{s.capacity}</td>
                <td className="end">
                  <button type="button" className="btn danger small" onClick={() => deleteSlot(s.id)}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
