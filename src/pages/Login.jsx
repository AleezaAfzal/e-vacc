import { useState } from 'react'
import { Link, Navigate, useLocation } from 'react-router-dom'
import { isSupabaseConfigured, supabase } from '../lib/supabase'
import { useAuth } from '../context/useAuth'

export default function Login() {
  const { session, loading } = useAuth()
  const loc = useLocation()
  const from = loc.state?.from?.pathname || '/'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState('')

  if (!loading && session) {
    return <Navigate to={from} replace />
  }

  async function onSubmit(e) {
    e.preventDefault()
    setErr('')
    if (!isSupabaseConfigured) {
      setErr('Configure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local, then restart Vite.')
      return
    }
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    if (error) setErr(error.message)
  }

  if (loading) {
    return (
      <div className="narrow">
        <div className="card muted center">
          <p>Loading…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="narrow">
      <div className="card">
        <h1>Sign in</h1>
        {!isSupabaseConfigured && (
          <p className="error small">
            Supabase env vars are missing. Add them to <code>.env.local</code> and restart the dev server.
          </p>
        )}
        <form onSubmit={onSubmit} className="stack">
          <label>
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </label>
          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </label>
          {err && <p className="error">{err}</p>}
          <button type="submit" className="btn primary" disabled={!isSupabaseConfigured}>
            Sign in
          </button>
        </form>
        <p className="muted small">
          No account? <Link to="/register">Register</Link>
        </p>
      </div>
    </div>
  )
}
