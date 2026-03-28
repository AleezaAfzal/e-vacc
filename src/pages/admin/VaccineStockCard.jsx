import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

export default function VaccineStockCard() {
  const [rows, setRows] = useState([])
  const [inputs, setInputs] = useState({})
  const [msg, setMsg] = useState('')

  const load = useCallback(async () => {
    const { data } = await supabase.from('vaccines').select('*').order('name')
    setRows(data || [])
    const next = {}
    ;(data || []).forEach((v) => {
      next[v.id] = ''
    })
    setInputs((prev) => ({ ...next, ...prev }))
  }, [])

  useEffect(() => {
    load()
    const ch = supabase
      .channel('vacc_stock_rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vaccines' }, load)
      .subscribe()
    return () => {
      supabase.removeChannel(ch)
    }
  }, [load])

  async function addStock(id, current) {
    setMsg('')
    const add = parseInt(inputs[id] || '0', 10)
    if (!Number.isFinite(add) || add <= 0) {
      setMsg('Enter a positive number of doses to add.')
      return
    }
    const { error } = await supabase
      .from('vaccines')
      .update({ doses_remaining: current + add })
      .eq('id', id)
    if (error) {
      setMsg(error.message)
      return
    }
    setInputs((p) => ({ ...p, [id]: '' }))
    load()
  }

  return (
    <section className="card">
      <h2>National stockpile</h2>
      <p className="muted small">When a vaccine runs low, add doses to the central pool (UPDATE).</p>
      {msg && <p className="error">{msg}</p>}
      <div className="stock-grid">
        {rows.map((v) => (
          <div key={v.id} className="stock-card">
            <h3>{v.name}</h3>
            <p className="stock-number">{v.doses_remaining} doses remaining</p>
            <div className="row gap tight">
              <input
                type="number"
                min={1}
                placeholder="Add doses"
                value={inputs[v.id] ?? ''}
                onChange={(e) => setInputs((p) => ({ ...p, [v.id]: e.target.value }))}
              />
              <button type="button" className="btn primary" onClick={() => addStock(v.id, v.doses_remaining)}>
                Add to pool
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
