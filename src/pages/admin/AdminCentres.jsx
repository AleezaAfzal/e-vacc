import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'

export default function AdminCentres() {
  const [centres, setCentres] = useState([])
  const [profiles, setProfiles] = useState({})
  const [statusFilter, setStatusFilter] = useState('all')
  const [selectedCenterId, setSelectedCenterId] = useState('')
  const [centerStock, setCenterStock] = useState([])
  const [vaccinatedRows, setVaccinatedRows] = useState([])
  const [centerStats, setCenterStats] = useState({})
  const [err, setErr] = useState('')

  const load = useCallback(async () => {
    const [{ data: centers, error }, { data: stockRows }, { data: vaxRows }] = await Promise.all([
      supabase.from('centers').select('*').order('created_at', { ascending: false }),
      supabase.from('center_vaccine_stock').select('center_id, doses_remaining'),
      supabase.from('vax_records').select('center_id, citizen_id'),
    ])

    if (error) {
      setErr(error.message)
      return
    }

    setCentres(centers || [])
    setErr('')

    const managerIds = [...new Set((centers || []).map((c) => c.manager_id))]
    if (managerIds.length) {
      const { data: profs } = await supabase
        .from('profiles')
        .select('id, full_name, cnic')
        .in('id', managerIds)
      const map = {}
      ;(profs || []).forEach((p) => {
        map[p.id] = p
      })
      setProfiles(map)
    } else {
      setProfiles({})
    }

    const stats = {}
    ;(centers || []).forEach((c) => {
      stats[c.id] = { stockLeft: 0, vaccinatedPeople: 0 }
    })

    ;(stockRows || []).forEach((r) => {
      if (!stats[r.center_id]) return
      stats[r.center_id].stockLeft += Number(r.doses_remaining) || 0
    })

    const seen = {}
    ;(vaxRows || []).forEach((r) => {
      if (!stats[r.center_id] || !r.citizen_id) return
      const key = `${r.center_id}:${r.citizen_id}`
      if (seen[key]) return
      seen[key] = true
      stats[r.center_id].vaccinatedPeople += 1
    })

    setCenterStats(stats)

    setSelectedCenterId((prev) => {
      if (prev && (centers || []).some((c) => c.id === prev)) return prev
      return centers?.[0]?.id || ''
    })
  }, [])

  const loadCenterDetail = useCallback(async (centerId) => {
    if (!centerId) {
      setCenterStock([])
      setVaccinatedRows([])
      return
    }

    const [{ data: stock }, { data: records }] = await Promise.all([
      supabase
        .from('center_vaccine_stock')
        .select('vaccine_id, doses_remaining, vaccines(name)')
        .eq('center_id', centerId)
        .order('doses_remaining', { ascending: false }),
      supabase
        .from('vax_records')
        .select('citizen_id, vaccine_id, dose_number, batch_number, administered_at')
        .eq('center_id', centerId)
        .order('administered_at', { ascending: false }),
    ])

    setCenterStock(stock || [])

    const citizenIds = [...new Set((records || []).map((r) => r.citizen_id).filter(Boolean))]
    const vaccineIds = [...new Set((records || []).map((r) => r.vaccine_id).filter(Boolean))]

    const [{ data: citizens }, { data: vaccines }] = await Promise.all([
      citizenIds.length
        ? supabase.from('profiles').select('id, full_name, cnic').in('id', citizenIds)
        : Promise.resolve({ data: [] }),
      vaccineIds.length
        ? supabase.from('vaccines').select('id, name').in('id', vaccineIds)
        : Promise.resolve({ data: [] }),
    ])

    const citizenMap = {}
    ;(citizens || []).forEach((p) => {
      citizenMap[p.id] = p
    })

    const vaccineMap = {}
    ;(vaccines || []).forEach((v) => {
      vaccineMap[v.id] = v
    })

    const merged = (records || []).map((r) => ({
      ...r,
      citizen: citizenMap[r.citizen_id],
      vaccine: vaccineMap[r.vaccine_id],
    }))

    setVaccinatedRows(merged)
  }, [])

  useEffect(() => {
    load()
    const ch = supabase
      .channel('admin_centres_ops_rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'centers' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'center_vaccine_stock' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vax_records' }, load)
      .subscribe()
    return () => {
      supabase.removeChannel(ch)
    }
  }, [load])

  useEffect(() => {
    loadCenterDetail(selectedCenterId)
  }, [selectedCenterId, loadCenterDetail])

  const filteredCentres = useMemo(() => {
    const nonRejected = centres.filter((c) => c.status !== 'rejected')
    if (statusFilter === 'all') return nonRejected
    return nonRejected.filter((c) => c.status === statusFilter)
  }, [centres, statusFilter])

  const selectedCenter = useMemo(
    () => centres.find((c) => c.id === selectedCenterId) || null,
    [centres, selectedCenterId],
  )

  async function deleteCenter(centerId) {
    if (!confirm('Delete this centre? This also removes its slots and related center stock records.')) return
    setErr('')
    const { error } = await supabase.from('centers').delete().eq('id', centerId)
    if (error) {
      setErr(error.message)
      return
    }
    if (selectedCenterId === centerId) {
      setSelectedCenterId('')
    }
    load()
  }

  return (
    <div className="stack gap-lg">
      <div>
        <h1>Centres Operations Dashboard</h1>
        <p className="muted">
          Track each centre's remaining stock and vaccinated citizens with CNIC and vaccine batch details.
        </p>
      </div>

      {err && <p className="error">{err}</p>}

      <div className="card">
        <div className="row gap wrap" style={{ justifyContent: 'space-between' }}>
          <label style={{ minWidth: 220 }}>
            Filter by status
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="all">All centres</option>
              <option value="active">Active</option>
              <option value="pending">Pending</option>
            </select>
          </label>
          <p className="muted small" style={{ margin: 0 }}>
            {filteredCentres.length} centre{filteredCentres.length !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      <div className="card">
        <h2>Centres List</h2>
        <table className="table">
          <thead>
            <tr>
              <th>Centre</th>
              <th>Manager</th>
              <th>Status</th>
              <th>Stock left</th>
              <th>Vaccinated users</th>
              <th>Location</th>
              <th />
              <th />
            </tr>
          </thead>
          <tbody>
            {filteredCentres.map((c) => {
              const m = profiles[c.manager_id]
              const s = centerStats[c.id] || { stockLeft: 0, vaccinatedPeople: 0 }
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
                  <td style={{ textTransform: 'capitalize' }}>{c.status}</td>
                  <td>{s.stockLeft}</td>
                  <td>{s.vaccinatedPeople}</td>
                  <td>
                    <a href={`https://www.google.com/maps?q=${c.lat},${c.lng}`} target="_blank" rel="noreferrer">
                      Open map
                    </a>
                  </td>
                  <td className="end">
                    <button
                      type="button"
                      className="btn ghost small"
                      onClick={() => setSelectedCenterId(c.id)}
                      disabled={selectedCenterId === c.id}
                    >
                      {selectedCenterId === c.id ? 'Selected' : 'View details'}
                    </button>
                  </td>
                  <td className="end">
                    <button type="button" className="btn danger small" onClick={() => deleteCenter(c.id)}>
                      Delete centre
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {!filteredCentres.length && <p className="muted">No centres found.</p>}
      </div>

      {selectedCenter && (
        <div className="stack gap-lg">
          <div className="card">
            <h2>{selectedCenter.name} Details</h2>
            <p className="muted small" style={{ marginTop: 0 }}>
              {selectedCenter.address}
            </p>

            <div className="stock-grid" style={{ marginTop: 0 }}>
              <div className="stock-card">
                <h3>Total stock left</h3>
                <p className="stock-number">{centerStats[selectedCenter.id]?.stockLeft || 0}</p>
              </div>
              <div className="stock-card">
                <h3>Vaccinated users</h3>
                <p className="stock-number">{centerStats[selectedCenter.id]?.vaccinatedPeople || 0}</p>
              </div>
            </div>
          </div>

          <div className="card">
            <h2>Stock by Vaccine</h2>
            <table className="table">
              <thead>
                <tr>
                  <th>Vaccine</th>
                  <th>Doses left</th>
                </tr>
              </thead>
              <tbody>
                {centerStock.map((r) => (
                  <tr key={r.vaccine_id}>
                    <td>{r.vaccines?.name || r.vaccine_id}</td>
                    <td>{r.doses_remaining}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!centerStock.length && <p className="muted">No stock allocated yet for this centre.</p>}
          </div>

          <div className="card">
            <h2>Vaccinated Citizens from this Centre</h2>
            <table className="table">
              <thead>
                <tr>
                  <th>Citizen</th>
                  <th>CNIC</th>
                  <th>Vaccine</th>
                  <th>Dose no</th>
                  <th>Batch no</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {vaccinatedRows.map((r, idx) => (
                  <tr key={`${r.citizen_id}-${r.vaccine_id}-${r.dose_number}-${idx}`}>
                    <td>{r.citizen?.full_name || '—'}</td>
                    <td className="mono">{r.citizen?.cnic || '—'}</td>
                    <td>{r.vaccine?.name || '—'}</td>
                    <td>{r.dose_number}</td>
                    <td className="mono">{r.batch_number}</td>
                    <td>{new Date(r.administered_at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!vaccinatedRows.length && <p className="muted">No verified vaccinations recorded for this centre yet.</p>}
          </div>
        </div>
      )}
    </div>
  )
}
