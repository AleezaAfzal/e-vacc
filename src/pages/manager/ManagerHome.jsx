import { Link } from 'react-router-dom'
import { useAuth } from '../../context/useAuth'

export default function ManagerHome() {
  const { profile } = useAuth()
  return (
    <div className="stack gap-lg">
      <h1>Manager</h1>
      <p className="muted">
        Welcome{profile?.full_name ? `, ${profile.full_name}` : ''}. Request a centre, then create slots once
        approved. Stock requests and slot scheduling are now on separate pages.
      </p>
      <div className="card row gap wrap">
        <Link className="btn primary" to="/manager/request-centre">
          Request centre
        </Link>
        <Link className="btn ghost" to="/manager/slots">
          Slot scheduling
        </Link>
        <Link className="btn ghost" to="/manager/stock-requests">
          Centre stock requests
        </Link>
        <Link className="btn ghost" to="/manager/appointments">
          Today&apos;s appointments
        </Link>
        <Link className="btn ghost" to="/manager/all-appointments">
          All appointments
        </Link>
        <Link className="btn ghost" to="/manager/vaccines">
          Vaccine list
        </Link>
      </div>
    </div>
  )
}
