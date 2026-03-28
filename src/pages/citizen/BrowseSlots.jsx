import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/useAuth'

export default function BrowseSlots() {
  const { profile } = useAuth()
  const [centers, setCenters] = useState([])
  const [cityQuery, setCityQuery] = useState('')

  const load = useCallback(async () => {
    const { data: c } = await supabase.from('centers').select('*').eq('status', 'active').order('name')
    setCenters(c || [])
  }, [])

  useEffect(() => {
    load()
    const ch = supabase
      .channel('browse_centers')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'centers' }, load)
      .subscribe()
    return () => {
      supabase.removeChannel(ch)
    }
  }, [load])

  const filteredCenters = useMemo(() => {
    const q = cityQuery.trim().toLowerCase()
    if (!q) return centers
    return centers.filter((c) => {
      const hay = `${c.name || ''} ${c.address || ''}`.toLowerCase()
      return hay.includes(q)
    })
  }, [centers, cityQuery])

  const profileOk =
    profile?.role === 'citizen' &&
    profile?.dob &&
    profile?.cnic &&
    String(profile.cnic).trim().length >= 5

  return (
    <div className="stack gap-lg">
      <div>
        <h1>Browse slots</h1>
        <p className="muted">Search centres by city/address to view available vaccination slots.</p>
      </div>

      {!profileOk && (
        <div className="card warn">
          Complete your CNIC and date of birth on the <Link to="/citizen">dashboard</Link> before booking.
        </div>
      )}

      <div className="card">
        <label>
          Search by city or address
          <input
            value={cityQuery}
            onChange={(e) => setCityQuery(e.target.value)}
            placeholder="e.g. Lahore, Karachi, Islamabad"
          />
        </label>
      </div>

      <div className="card">
        <h2>Centres</h2>
        <table className="table">
          <thead>
            <tr>
              <th>Centre</th>
              <th>Address</th>
              <th>Location</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {filteredCenters.map((c) => (
              <tr key={c.id}>
                <td>{c.name}</td>
                <td>{c.address}</td>
                <td>
                  <a href={`https://www.google.com/maps?q=${c.lat},${c.lng}`} target="_blank" rel="noreferrer">
                    Open location
                  </a>
                </td>
                <td className="end">
                  <Link to={`/centre/${c.id}`} className="btn ghost small">
                    View slots
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!filteredCenters.length && <p className="muted">No centres found for your search.</p>}
      </div>
    </div>
  )
}
