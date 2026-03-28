import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../context/useAuth'
import { isSupabaseConfigured } from '../lib/supabase'

const linkStyle = ({ isActive }) => ({
  fontWeight: isActive ? 600 : 500,
  opacity: isActive ? 1 : 0.85,
})

export default function Layout() {
  const { session, profile, signOut } = useAuth()
  const role = profile?.role
  const [menuOpen, setMenuOpen] = useState(false)
  const location = useLocation()

  useEffect(() => {
    setMenuOpen(false)
  }, [location.pathname])

  return (
    <div className="app-shell">
      {!isSupabaseConfigured && (
        <div className="env-banner" role="status">
          Set <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> in{' '}
          <code>.env.local</code>, then restart <code>npm run dev</code>.
        </div>
      )}
      <header className="top-nav">
        <Link to="/" className="brand">
          e-vacc
        </Link>
        <button
          type="button"
          className="nav-toggle"
          aria-label="Toggle navigation"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((prev) => !prev)}
        >
          {menuOpen ? 'Close' : 'Menu'}
        </button>
        <nav className={`nav-links ${menuOpen ? 'open' : ''}`}>
          {!session && (
            <>
              <NavLink to="/login" style={linkStyle}>
                Sign in
              </NavLink>
              <NavLink to="/register" style={linkStyle}>
                Register
              </NavLink>
            </>
          )}
          {session && role === 'admin' && (
            <>
              <NavLink to="/admin" style={linkStyle}>
                Admin
              </NavLink>
              <NavLink to="/admin/requests" style={linkStyle}>
                Centre approvals
              </NavLink>
              <NavLink to="/admin/centres" style={linkStyle}>
                Centres
              </NavLink>
              <NavLink to="/admin/allocate-doses" style={linkStyle}>
                Allocate doses
              </NavLink>
              <NavLink to="/admin/dose-requests" style={linkStyle}>
                Dose requests
              </NavLink>
            </>
          )}
          {session && role === 'manager' && (
            <>
              <NavLink to="/manager" style={linkStyle}>
                Manager
              </NavLink>
              <NavLink to="/manager/request-centre" style={linkStyle}>
                Request centre
              </NavLink>
              <NavLink to="/manager/slots" style={linkStyle}>
                Slots
              </NavLink>
              <NavLink to="/manager/stock-requests" style={linkStyle}>
                Stock requests
              </NavLink>
              <NavLink to="/manager/appointments" style={linkStyle}>
                Today&apos;s queue
              </NavLink>
              <NavLink to="/manager/all-appointments" style={linkStyle}>
                All appointments
              </NavLink>
              <NavLink to="/manager/vaccines" style={linkStyle}>
                Vaccines
              </NavLink>
              <NavLink to="/manager/vaccinated-users" style={linkStyle}>
                Vaccinated users
              </NavLink>
            </>
          )}
          {session && role === 'citizen' && (
            <>
              <NavLink to="/citizen" style={linkStyle}>
                Dashboard
              </NavLink>
              <NavLink to="/citizen/browse" style={linkStyle}>
                Browse slots
              </NavLink>
              <NavLink to="/citizen/profile" style={linkStyle}>
                Profile
              </NavLink>
              <NavLink to="/citizen/certificates" style={linkStyle}>
                Certificates
              </NavLink>
            </>
          )}
          {session && (
            <button
              type="button"
              className="btn ghost"
              onClick={() => {
                setMenuOpen(false)
                signOut()
              }}
            >
              Sign out
            </button>
          )}
        </nav>
      </header>
      <main className="main-content">
        <Outlet />
      </main>
    </div>
  )
}
