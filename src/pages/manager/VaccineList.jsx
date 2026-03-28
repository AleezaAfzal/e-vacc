import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/useAuth'

export default function VaccineList() {
  const { session } = useAuth()
  const [rows, setRows] = useState([])

  const load = useCallback(async () => {
    const uid = session?.user?.id
    if (!uid) return

    const { data: centers } = await supabase.from('centers').select('id').eq('manager_id', uid).eq('status', 'active')
    const cids = (centers || []).map((c) => c.id)

    const [{ data: vaccines }, { data: stock }] = await Promise.all([
      supabase.from('vaccines').select('id, name, doses_required, interval_days, min_age_years').order('name'),
      cids.length
        ? supabase.from('center_vaccine_stock').select('center_id, vaccine_id, doses_remaining').in('center_id', cids)
        : Promise.resolve({ data: [] }),
    ])

    const stockByVaccine = {}
    ;(stock || []).forEach((s) => {
      stockByVaccine[s.vaccine_id] = (stockByVaccine[s.vaccine_id] || 0) + (Number(s.doses_remaining) || 0)
    })

    const merged = (vaccines || []).map((v) => ({
      ...v,
      center_stock: stockByVaccine[v.id] || 0,
    }))

    setRows(merged)
  }, [session?.user?.id])

  useEffect(() => {
    load()
  }, [load])

  return (
    <div className="stack gap-lg">
      <div>
        <h1>Vaccine List</h1>
        <p className="muted">Review vaccine rules and your centre-level available stock.</p>
      </div>
      <div className="card">
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Doses required</th>
              <th>Interval (days)</th>
              <th>Min age</th>
              <th>Available in your centres</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((v) => (
              <tr key={v.id}>
                <td>{v.name}</td>
                <td>{v.doses_required}</td>
                <td>{v.interval_days}</td>
                <td>{v.min_age_years}</td>
                <td>{v.center_stock}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
