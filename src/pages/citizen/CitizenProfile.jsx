import { useMemo } from 'react'
import { useAuth } from '../../context/useAuth'

export default function CitizenProfile() {
  const { profile } = useAuth()

  const age = useMemo(() => {
    if (!profile?.dob) return null
    const date = new Date(profile.dob)
    if (Number.isNaN(date.getTime())) return null
    const now = new Date()
    let years = now.getFullYear() - date.getFullYear()
    const m = now.getMonth() - date.getMonth()
    if (m < 0 || (m === 0 && now.getDate() < date.getDate())) years -= 1
    return years
  }, [profile?.dob])

  return (
    <div className="stack gap-lg narrow" style={{ maxWidth: 760 }}>
      <div>
        <h1>Citizen Profile</h1>
        
      </div>

      <div className="card">
        <h2>Personal details</h2>
        <div className="grid-form">
          <div>
            <p className="muted small" style={{ marginBottom: 4 }}>Full name</p>
            <strong>{profile?.full_name || '—'}</strong>
          </div>
          <div>
            <p className="muted small" style={{ marginBottom: 4 }}>Age</p>
            <strong>{age != null ? age : '—'}</strong>
          </div>
        </div>
      </div>

      <div className="card">
        <h2>Identity</h2>
        <div className="grid-form">
          <div>
            <p className="muted small" style={{ marginBottom: 4 }}>CNIC</p>
            <strong>{profile?.cnic || '—'}</strong>
          </div>
          <div>
            <p className="muted small" style={{ marginBottom: 4 }}>Date of birth</p>
            <strong>{profile?.dob || '—'}</strong>
          </div>
        </div>
        
      </div>
    </div>
  )
}
