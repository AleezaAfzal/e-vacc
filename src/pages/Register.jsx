import { useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { isSupabaseConfigured, supabase } from '../lib/supabase'
import { useAuth } from '../context/useAuth'

export default function Register() {
  const { session, loading } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [role, setRole] = useState('citizen')
  const [cnic, setCnic] = useState('')
  const [dob, setDob] = useState('')
  const [err, setErr] = useState('')
  const [msg, setMsg] = useState('')
  const [submitting, setSubmitting] = useState(false)

  if (!loading && session) {
    return <Navigate to="/" replace />
  }

  async function onSubmit(e) {
    e.preventDefault()
    setErr('')
    setMsg('')
    if (submitting) return
    if (!isSupabaseConfigured) {
      setErr('Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local and restart the dev server.')
      return
    }
    if (role === 'citizen' && (!cnic.trim() || !dob)) {
      setErr('Citizens must provide CNIC and date of birth.')
      return
    }

    setSubmitting(true)
    const { error } = await supabase.auth
      .signUp({
        email: email.trim(),
        password,
        options: {
          data: {
            full_name: fullName.trim(),
            role,
            cnic: role === 'citizen' ? cnic.trim() : '',
            dob: role === 'citizen' ? dob : '',
          },
        },
      })
      .finally(() => {
        setSubmitting(false)
      })
    if (error) {
      const text = String(error.message || '').toLowerCase()
      if (text.includes('email rate') || text.includes('over_email_send_rate_limit')) {
        setErr(
          'Registration email rate limit reached on Supabase. Wait a few minutes, then retry. To remove this bottleneck, disable email confirmation for dev or configure custom SMTP and raise Auth email limits in Supabase dashboard.',
        )
        return
      }
      setErr(error.message)
      return
    }
    setMsg('If email confirmation is enabled, check your inbox then sign in. Otherwise you can sign in now.')
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
    <div className="narrow register-page">
      <div className="card">
        <h1>Create account</h1>
        <p className="muted small">
          Sign up with <strong>email</strong> and <strong>password</strong>. Choose whether you are booking
          vaccines as a citizen, or managing a centre as a manager.
        </p>

        {!isSupabaseConfigured && (
          <div className="card warn tight">
            <strong>Configuration needed.</strong> Create <code>.env.local</code> with{' '}
            <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code>, then restart{' '}
            <code>npm run dev</code>.
          </div>
        )}

        <form onSubmit={onSubmit} className="stack gap">
          <fieldset className="fieldset-plain">
            <legend>Account</legend>
            <label>
              Email
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                placeholder="you@example.com"
              />
            </label>
            <label>
              Password
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                autoComplete="new-password"
                placeholder="At least 6 characters"
              />
            </label>
          </fieldset>

          <label>
            Full name
            <input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
              placeholder="Your full name"
            />
          </label>

          <fieldset className="fieldset-plain">
            <legend>Register as</legend>
            <p className="muted small fieldset-hint">
              Managers use the same account to submit a <strong>centre request</strong> (map pin) and later
              create slots after an admin approves the centre.
            </p>
            <div className="role-options">
              <label className={`role-card ${role === 'citizen' ? 'selected' : ''}`}>
                <input
                  type="radio"
                  name="role"
                  value="citizen"
                  checked={role === 'citizen'}
                  onChange={() => setRole('citizen')}
                />
                <span className="role-title">Citizen</span>
                <span className="role-desc">Book vaccination slots and track your doses.</span>
              </label>
              <label className={`role-card ${role === 'manager' ? 'selected' : ''}`}>
                <input
                  type="radio"
                  name="role"
                  value="manager"
                  checked={role === 'manager'}
                  onChange={() => setRole('manager')}
                />
                <span className="role-title">Centre manager</span>
                <span className="role-desc">Request a centre, create slots, verify doses on site.</span>
              </label>
            </div>
          </fieldset>

          {role === 'citizen' && (
            <fieldset className="fieldset-plain">
              <legend>Citizen details</legend>
              <label>
                CNIC
                <input
                  value={cnic}
                  onChange={(e) => setCnic(e.target.value)}
                  placeholder="xxxxx-xxxxxxx-x"
                  required
                />
              </label>
              <label>
                Date of birth
                <input type="date" value={dob} onChange={(e) => setDob(e.target.value)} required />
              </label>
            </fieldset>
          )}

          {err && <p className="error">{err}</p>}
          {msg && <p className="success">{msg}</p>}

          <button type="submit" className="btn primary" disabled={!isSupabaseConfigured || submitting}>
            {submitting ? 'Creating account...' : 'Register'}
          </button>
        </form>

        <p className="muted small">
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </div>
    </div>
  )
}
