import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function VerifyCertificate() {
  const [params] = useSearchParams()
  const certId = params.get('id') || ''
  const [loading, setLoading] = useState(true)
  const [row, setRow] = useState(null)
  const [err, setErr] = useState('')

  useEffect(() => {
    async function run() {
      setLoading(true)
      setErr('')
      if (!certId) {
        setErr('Missing certificate ID in URL.')
        setLoading(false)
        return
      }
      const { data, error } = await supabase.rpc('verify_certificate', {
        p_certificate_id: certId,
      })
      if (error) {
        setErr(error.message)
        setLoading(false)
        return
      }
      const first = Array.isArray(data) ? data[0] : null
      if (!first) {
        setErr('Certificate not found.')
        setLoading(false)
        return
      }
      setRow(first)
      setLoading(false)
    }
    run()
  }, [certId])

  return (
    <div className="narrow" style={{ maxWidth: 860 }}>
      <div className="card">
        <h1>Certificate Verification</h1>
        {loading && <p className="muted">Verifying certificate...</p>}
        {!loading && err && <p className="error">{err}</p>}

        {!loading && row && (
          <div className="stack gap">
            <p
              className={row.valid ? 'success' : 'error'}
              style={{
                fontSize: '1rem',
                fontWeight: 700,
                padding: '0.5rem 0.75rem',
                borderRadius: 8,
                background: row.valid ? '#dcfce7' : '#fee2e2',
              }}
            >
              {row.valid ? 'Certificate is valid' : 'Certificate is not valid'}
            </p>
            <div className="grid-form" style={{ marginTop: 0 }}>
              <div>
                <p className="muted small" style={{ marginBottom: 4 }}>Certificate ID</p>
                <strong className="mono">{row.certificate_id}</strong>
              </div>
              <div>
                <p className="muted small" style={{ marginBottom: 4 }}>Citizen Name</p>
                <strong>{row.citizen_name || '—'}</strong>
              </div>
              <div>
                <p className="muted small" style={{ marginBottom: 4 }}>CNIC</p>
                <strong className="mono">{row.cnic || '—'}</strong>
              </div>
              <div>
                <p className="muted small" style={{ marginBottom: 4 }}>Vaccine</p>
                <strong>{row.vaccine_name || '—'}</strong>
              </div>
              <div>
                <p className="muted small" style={{ marginBottom: 4 }}>Doses verified</p>
                <strong>{row.doses_verified} / {row.doses_required}</strong>
              </div>
              <div>
                <p className="muted small" style={{ marginBottom: 4 }}>Last batch ID</p>
                <strong className="mono">{row.last_batch_number || '—'}</strong>
              </div>
              <div>
                <p className="muted small" style={{ marginBottom: 4 }}>Last verified at</p>
                <strong>{row.last_administered_at ? new Date(row.last_administered_at).toLocaleString() : '—'}</strong>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
