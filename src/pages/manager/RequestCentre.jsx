import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/useAuth'

export default function RequestCentre() {
  const { session } = useAuth()
  const [name, setName] = useState('')
  const [address, setAddress] = useState('')
  const [lat, setLat] = useState(33.6844)
  const [lng, setLng] = useState(73.0479)
  const [err, setErr] = useState('')
  const [ok, setOk] = useState('')
  const [managerCentre, setManagerCentre] = useState(null)
  const [loading, setLoading] = useState(true)
  const [formOpen, setFormOpen] = useState(false)

  const draftKey = useMemo(
    () => (session?.user?.id ? `centre-request-draft:${session.user.id}` : null),
    [session?.user?.id],
  )
  const formOpenKey = useMemo(
    () => (session?.user?.id ? `centre-request-open:${session.user.id}` : null),
    [session?.user?.id],
  )

  const loadManagerCentre = useCallback(async () => {
    if (!session?.user?.id) return
    setLoading(true)
    const { data, error } = await supabase
      .from('centers')
      .select('*')
      .eq('manager_id', session.user.id)
      .order('created_at', { ascending: false })
      .limit(1)
    if (!error && data?.length) {
      setManagerCentre(data[0])
    } else {
      setManagerCentre(null)
    }
    setLoading(false)
  }, [session?.user?.id])

  function resetForm() {
    setFormOpen(true)
    setName('')
    setAddress('')
    setLat(33.6844)
    setLng(73.0479)
    setErr('')
    setOk('')
  }

  useEffect(() => {
    loadManagerCentre()
  }, [loadManagerCentre])

  useEffect(() => {
    if (!draftKey || !formOpenKey) return
    const savedDraft = localStorage.getItem(draftKey)
    if (savedDraft) {
      try {
        const parsed = JSON.parse(savedDraft)
        if (typeof parsed.name === 'string') setName(parsed.name)
        if (typeof parsed.address === 'string') setAddress(parsed.address)
        if (typeof parsed.lat === 'number') setLat(parsed.lat)
        if (typeof parsed.lng === 'number') setLng(parsed.lng)
      } catch {
        localStorage.removeItem(draftKey)
      }
    }
    const savedOpen = localStorage.getItem(formOpenKey)
    setFormOpen(savedOpen === '1')
  }, [draftKey, formOpenKey])

  useEffect(() => {
    if (!draftKey) return
    const payload = {
      name,
      address,
      lat: Number(lat),
      lng: Number(lng),
    }
    localStorage.setItem(draftKey, JSON.stringify(payload))
  }, [name, address, lat, lng, draftKey])

  useEffect(() => {
    if (!formOpenKey) return
    localStorage.setItem(formOpenKey, formOpen ? '1' : '0')
  }, [formOpen, formOpenKey])

  async function submit(e) {
    e.preventDefault()
    setErr('')
    setOk('')
    if (!session?.user?.id) {
      setErr('Not signed in.')
      return
    }
    const { error } = await supabase.from('centers').insert({
      manager_id: session.user.id,
      name: name.trim(),
      address: address.trim(),
      lat: Number(lat),
      lng: Number(lng),
      status: 'pending',
    })
    if (error) {
      setErr(error.message)
      return
    }
    setOk('Request submitted. An admin will review coordinates and credentials.')
    setName('')
    setAddress('')
    setLat(33.6844)
    setLng(73.0479)
    setFormOpen(false)
    if (draftKey) localStorage.removeItem(draftKey)
    if (formOpenKey) localStorage.setItem(formOpenKey, '0')
    await loadManagerCentre()
  }

  const showForm = !managerCentre || (managerCentre.status === 'rejected' && formOpen)
  const numericLat = Number(lat)
  const numericLng = Number(lng)
  const hasValidCoords = Number.isFinite(numericLat) && Number.isFinite(numericLng)
  const locationUrl = hasValidCoords ? `https://www.google.com/maps?q=${numericLat},${numericLng}` : ''

  return (
    <div className="narrow wide-map">
      <div className="card">
        <h1>Request a vaccination centre</h1>
        <p className="muted small">Enter address and coordinates. Coordinates are saved as you type.</p>
        
        {loading ? (
          <p className="muted">Loading...</p>
        ) : !showForm ? (
          <div className={`card ${managerCentre.status === 'active' ? 'success' : managerCentre.status === 'rejected' ? 'error' : 'muted'}`}>
            <h2>{managerCentre.name}</h2>
            <p>{managerCentre.address}</p>
            <p className="small">
              Status: <strong>{managerCentre.status}</strong>
            </p>

            {managerCentre.status === 'active' && (
              <>
                <p className="success">✓ Your centre is active and open for bookings.</p>
                <div className="row gap">
                  <a href="mailto:aleezafzal7@gmail.com" className="btn ghost">
                    Contact admin
                  </a>
                </div>
              </>
            )}

            {managerCentre.status === 'pending' && (
              <>
                <p className="muted">⏳ Your centre request is under review. Please wait for admin approval.</p>
                <div className="row gap">
                  <a href="mailto:aleezafzal7@gmail.com" className="btn ghost">
                    Contact admin
                  </a>
                </div>
              </>
            )}

            {managerCentre.status === 'rejected' && (
              <>
                <p className="error">✗ Your centre request was rejected.</p>
                <div className="card warn" style={{ marginTop: '1rem', marginBottom: '1rem' }}>
                  <h3>What to do next:</h3>
                  <ol style={{ paddingLeft: '1.5rem' }}>
                    <li>Contact the admin to understand why your request was rejected</li>
                    <li>Address the issues mentioned by the admin</li>
                    <li>Submit a new centre request with corrected information</li>
                  </ol>
                  <p style={{ marginTop: '0.5rem', fontWeight: 500 }}>
                    Admin email: <a href="mailto:aleezafzal7@gmail.com">aleezafzal7@gmail.com</a>
                  </p>
                </div>
                <div className="row gap">
                  <button type="button" className="btn primary" onClick={resetForm}>
                    Submit new request
                  </button>
                  <a href="mailto:aleezafzal7@gmail.com" className="btn ghost">
                    Contact admin
                  </a>
                </div>
              </>
            )}
          </div>
        ) : (
          <form onSubmit={submit} className="stack">
            <label>
              Centre name
              <input value={name} onChange={(e) => setName(e.target.value)} required />
            </label>
            <label>
              Address
              <textarea value={address} onChange={(e) => setAddress(e.target.value)} rows={2} required />
            </label>
            <div className="grid-form">
              <label>
                Latitude
                <input 
                  type="number" 
                  step="0.000001"
                  value={lat} 
                  onChange={(e) => setLat(Number(e.target.value))}
                  required 
                />
              </label>
              <label>
                Longitude
                <input 
                  type="number" 
                  step="0.000001"
                  value={lng} 
                  onChange={(e) => setLng(Number(e.target.value))}
                  required 
                />
              </label>
            </div>
            <p className="mono small">
              {hasValidCoords ? `${numericLat.toFixed(6)}, ${numericLng.toFixed(6)}` : 'Enter valid coordinates'}
            </p>
            {hasValidCoords && (
              <p className="small">
                <a href={locationUrl} target="_blank" rel="noreferrer">
                  Open this location in Google Maps
                </a>
              </p>
            )}
            {err && <p className="error">{err}</p>}
            {ok && <p className="success">{ok}</p>}
            <button type="submit" className="btn primary">
              Submit request
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
