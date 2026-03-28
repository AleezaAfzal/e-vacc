import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/useAuth'

export default function ProtectedRoute({ children, roles }) {
  const { session, profile, loading } = useAuth()
  const loc = useLocation()

  if (loading) {
    return (
      <div className="card muted center">
        <p>Loading session…</p>
      </div>
    )
  }

  if (!session) {
    return <Navigate to="/login" state={{ from: loc }} replace />
  }

  if (roles?.length && !roles.includes(profile?.role)) {
    return <Navigate to="/" replace />
  }

  return children
}
