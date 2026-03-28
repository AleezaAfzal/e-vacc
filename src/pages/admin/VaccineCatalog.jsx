import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

export default function VaccineCatalog() {
  const [rows, setRows] = useState([])
  const [name, setName] = useState('')
  const [dosesRequired, setDosesRequired] = useState(2)
  const [intervalDays, setIntervalDays] = useState(21)
  const [minAge, setMinAge] = useState(12)
  const [stock, setStock] = useState(1000)
  const [err, setErr] = useState('')

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('vaccines').select('*').order('created_at')
    if (error) console.error(error)
    else setRows(data || [])
  }, [])

  useEffect(() => {
    load()
    const ch = supabase
      .channel('vaccines_rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vaccines' }, load)
      .subscribe()
    return () => {
      supabase.removeChannel(ch)
    }
  }, [load])

  async function addVaccine(e) {
    e.preventDefault()
    setErr('')
    const { error } = await supabase.from('vaccines').insert({
      name: name.trim(),
      doses_required: Number(dosesRequired),
      interval_days: Number(intervalDays),
      min_age_years: Number(minAge),
      doses_remaining: Number(stock),
    })
    if (error) {
      setErr(error.message)
      return
    }
    setName('')
    setDosesRequired(2)
    setIntervalDays(21)
    setMinAge(12)
    setStock(1000)
    await load()
  }

  async function deleteVaccine(id) {
    if (!confirm('Delete this vaccine?')) return
    setErr('')
    const { error } = await supabase.from('vaccines').delete().eq('id', id)
    if (error) {
      setErr(error.message)
      return
    }
    await load()
  }

  return (
    <section className="card">
      <h2>Vaccine catalog</h2>
      <p className="muted small">
        Example: Pfizer — 2 doses, 21-day interval. CanSino — 1 dose, 0 interval.
      </p>
      <form onSubmit={addVaccine} className="grid-form">
        <label>
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} required placeholder="Pfizer" />
        </label>
        <label>
          Doses required
          <input
            type="number"
            min={1}
            value={dosesRequired}
            onChange={(e) => setDosesRequired(e.target.value)}
            required
          />
        </label>
        <label>
          Interval (days)
          <input
            type="number"
            min={0}
            value={intervalDays}
            onChange={(e) => setIntervalDays(e.target.value)}
            required
          />
        </label>
        <label>
          Min age (years)
          <input type="number" min={0} value={minAge} onChange={(e) => setMinAge(e.target.value)} required />
        </label>
        <label>
          Initial national stock
          <input type="number" min={0} value={stock} onChange={(e) => setStock(e.target.value)} required />
        </label>
        <div className="align-end">
          <button type="submit" className="btn primary">
            Add vaccine
          </button>
        </div>
      </form>
      {err && <p className="error">{err}</p>}
      <table className="table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Doses</th>
            <th>Interval</th>
            <th>Min age</th>
            <th>Stock</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((v) => (
            <tr key={v.id}>
              <td>{v.name}</td>
              <td>{v.doses_required}</td>
              <td>{v.interval_days}d</td>
              <td>{v.min_age_years}y</td>
              <td>{v.doses_remaining}</td>
              <td>
                <button type="button" className="btn danger small" onClick={() => deleteVaccine(v.id)}>
                  Delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}
