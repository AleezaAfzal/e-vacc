import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'

export default function AllocateDoses() {
  const [centers, setCenters] = useState([])
  const [vaccines, setVaccines] = useState([])
  const [allocCenterId, setAllocCenterId] = useState('')
  const [allocVaccineId, setAllocVaccineId] = useState('')
  const [allocDoses, setAllocDoses] = useState('')
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')

  const load = useCallback(async () => {
    const [{ data: centerRows }, { data: vaccineRows }] = await Promise.all([
      supabase.from('centers').select('id, name, status').eq('status', 'active').order('name'),
      supabase.from('vaccines').select('id, name, doses_remaining').order('name'),
    ])
    setCenters(centerRows || [])
    setVaccines(vaccineRows || [])
    setAllocCenterId((prev) => prev || centerRows?.[0]?.id || '')
    setAllocVaccineId((prev) => prev || vaccineRows?.[0]?.id || '')
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function allocate(e) {
    e.preventDefault()
    setErr('')
    setMsg('')
    const doses = Number(allocDoses)
    if (!allocCenterId || !allocVaccineId || !Number.isFinite(doses) || doses <= 0) {
      setErr('Select centre, vaccine, and positive dose quantity.')
      return
    }

    const { error } = await supabase.rpc('allocate_center_stock', {
      p_center_id: allocCenterId,
      p_vaccine_id: allocVaccineId,
      p_doses: doses,
      p_note: null,
    })
    if (error) {
      setErr(error.message)
      return
    }

    setAllocDoses('')
    setMsg('Doses allocated successfully.')
    load()
  }

  const selectedVaccine = useMemo(
    () => vaccines.find((v) => v.id === allocVaccineId),
    [vaccines, allocVaccineId],
  )

  return (
    <div className="stack gap-lg">
      <div>
        <h1>Allocate Doses</h1>
        <p className="muted">Move doses from national stockpile to active centres.</p>
      </div>
      <div className="card">
        <form onSubmit={allocate} className="grid-form">
          <label>
            Centre
            <select value={allocCenterId} onChange={(e) => setAllocCenterId(e.target.value)} required>
              <option value="">Select centre</option>
              {centers.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </label>
          <label>
            Vaccine
            <select value={allocVaccineId} onChange={(e) => setAllocVaccineId(e.target.value)} required>
              <option value="">Select vaccine</option>
              {vaccines.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name} (national: {v.doses_remaining})
                </option>
              ))}
            </select>
          </label>
          <label>
            Doses
            <input type="number" min={1} value={allocDoses} onChange={(e) => setAllocDoses(e.target.value)} required />
          </label>
          <div className="align-end">
            <button type="submit" className="btn primary">Allocate doses</button>
          </div>
        </form>
        {selectedVaccine && (
          <p className="muted small">Current national stock for {selectedVaccine.name}: {selectedVaccine.doses_remaining}</p>
        )}
        {err && <p className="error">{err}</p>}
        {msg && <p className="success">{msg}</p>}
      </div>
    </div>
  )
}
