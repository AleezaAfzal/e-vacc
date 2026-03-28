import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '../context/useAuth'

export default function Home() {
  const { session, profile, loading } = useAuth()

  if (loading) {
    return (
      <div className="card muted center">
        <p>Loading…</p>
      </div>
    )
  }

  if (session && profile?.role === 'admin') return <Navigate to="/admin" replace />
  if (session && profile?.role === 'manager') return <Navigate to="/manager" replace />
  if (session && profile?.role === 'citizen') return <Navigate to="/citizen" replace />

  return (
    <div className="hero-card">
      <h1>National vaccination, digitised</h1>
      <p className="lede">
        e-vacc connects citizens, verified centres, and the national stockpile. Register as a citizen
        to book doses, or as a manager to request a centre.
      </p>
      <div className="row gap">
        <Link className="btn primary" to="/register">
          Create account
        </Link>
        <Link className="btn ghost" to="/login">
          Sign in
        </Link>
      </div>
    </div>
  )
}
