import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../../context/useAuth'
import { supabase } from '../../lib/supabase'

function buildCertificateHtml(payload) {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>Vaccination Certificate</title>
<style>
body{font-family:Segoe UI,Arial,sans-serif;background:#f5f7fb;padding:24px;color:#0f172a}
.card{max-width:900px;margin:0 auto;background:#fff;border:2px solid #dbe3f5;border-radius:14px;padding:24px}
h1{margin:0 0 8px;font-size:30px}
.sub{color:#475569;margin:0 0 18px}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}
.box{border:1px solid #e2e8f0;border-radius:10px;padding:12px;background:#f8fafc}
label{display:block;font-size:12px;color:#64748b;margin-bottom:4px}
strong{font-size:16px}
</style>
</head>
<body>
<div class="card">
  <h1>Vaccination Certificate</h1>
  <p class="sub">e-vacc official immunization record</p>
  <div class="grid">
    <div class="box"><label>Name</label><strong>${payload.name || '-'}</strong></div>
    <div class="box"><label>CNIC</label><strong>${payload.cnic || '-'}</strong></div>
    <div class="box"><label>Vaccine</label><strong>${payload.vaccine || '-'}</strong></div>
    <div class="box"><label>Total doses verified</label><strong>${payload.totalDoses || 0}</strong></div>
    <div class="box"><label>Last batch ID</label><strong>${payload.batch || '-'}</strong></div>
    <div class="box"><label>Last dose date</label><strong>${payload.lastDate || '-'}</strong></div>
  </div>
</div>
<script>
window.addEventListener('load', function () {
  setTimeout(function () { window.print(); }, 250);
});
</script>
</body>
</html>`
}

export default function Certificates() {
  const { session, profile } = useAuth()
  const [certs, setCerts] = useState([])
  const [records, setRecords] = useState([])
  const [vaccines, setVaccines] = useState({})
  const [busyKey, setBusyKey] = useState('')
  const [err, setErr] = useState('')

  const load = useCallback(async () => {
    const uid = session?.user?.id
    if (!uid) return

    const [{ data: certRows }, { data: recRows }, { data: vRows }] = await Promise.all([
      supabase.from('certificates').select('*').eq('citizen_id', uid),
      supabase
        .from('vax_records')
        .select('vaccine_id, dose_number, batch_number, administered_at')
        .eq('citizen_id', uid)
        .order('administered_at', { ascending: false }),
      supabase.from('vaccines').select('id, name, doses_required'),
    ])

    setCerts(certRows || [])
    setRecords(recRows || [])
    const vm = {}
    ;(vRows || []).forEach((v) => {
      vm[v.id] = v
    })
    setVaccines(vm)
  }, [session?.user?.id])

  useEffect(() => {
    load()
  }, [load])

  const recordsByVaccine = useMemo(() => {
    const map = {}
    records.forEach((r) => {
      if (!map[r.vaccine_id]) map[r.vaccine_id] = []
      map[r.vaccine_id].push(r)
    })
    return map
  }, [records])

  const certByVaccine = useMemo(() => {
    const map = {}
    certs.forEach((c) => {
      map[c.vaccine_id] = c
    })
    return map
  }, [certs])

  const eligibleRows = useMemo(() => {
    const out = []
    Object.entries(recordsByVaccine).forEach(([vaccineId, rows]) => {
      const vaccine = vaccines[vaccineId]
      const required = Number(vaccine?.doses_required || 0)
      if (!required || rows.length < required) return
      out.push({
        vaccineId,
        vaccineName: vaccine?.name || vaccineId,
        required,
        rows,
        cert: certByVaccine[vaccineId] || null,
      })
    })
    return out.sort((a, b) => a.vaccineName.localeCompare(b.vaccineName))
  }, [recordsByVaccine, vaccines, certByVaccine])

  async function generate(row, mode) {
    const key = `${mode}:${row.vaccineId}`
    setBusyKey(key)
    setErr('')
    try {
      const rows = row.rows || []
      const latest = rows[0]
      const fileId = row.cert?.id || `${session?.user?.id || 'user'}-${row.vaccineId}`
      const payload = {
        citizenId: session?.user?.id,
        vaccineId: row.vaccineId,
        name: profile?.full_name || '',
        cnic: profile?.cnic || '',
        vaccine: row.vaccineName,
        totalDoses: rows.length,
        batch: latest?.batch_number || '',
        lastDate: latest?.administered_at ? new Date(latest.administered_at).toLocaleString() : '',
      }

      const html = buildCertificateHtml(payload)
      const blob = new Blob([html], { type: 'text/html' })
      const url = URL.createObjectURL(blob)

      if (mode === 'download') {
        const a = document.createElement('a')
        a.href = url
        a.download = `certificate-${fileId}.html`
        document.body.appendChild(a)
        a.click()
        a.remove()
      } else {
        const win = window.open(url, '_blank')
        if (!win) {
          const a = document.createElement('a')
          a.href = url
          a.download = `certificate-${fileId}.html`
          document.body.appendChild(a)
          a.click()
          a.remove()
        }
      }

      setTimeout(() => URL.revokeObjectURL(url), 30_000)
    } catch (e) {
      setErr(String(e?.message || e))
    } finally {
      setBusyKey('')
    }
  }

  return (
    <div className="stack gap-lg">
      <div>
        <h1>Certificates</h1>
        <p className="muted">Download certificates with certificate ID and QR code. QR verifies online status.</p>
      </div>

      {err && <p className="error">{err}</p>}

      <div className="card">
        <table className="table">
          <thead>
            <tr>
              <th>Vaccine</th>
              <th>Last batch ID</th>
              <th>Doses verified</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {eligibleRows.map((row) => {
              const rows = row.rows || []
              const latest = rows[0]
              return (
                <tr key={row.vaccineId}>
                  <td>{row.vaccineName}</td>
                  <td className="mono">{latest?.batch_number || '—'}</td>
                  <td>
                    {rows.length} / {row.required}
                  </td>
                  <td className="end">
                    <div className="row gap tight end">
                      <button
                        className="btn primary small"
                        type="button"
                        disabled={busyKey === `open:${row.vaccineId}` || busyKey === `download:${row.vaccineId}`}
                        onClick={() => generate(row, 'open')}
                      >
                        Open
                      </button>
                      <button
                        className="btn ghost small"
                        type="button"
                        disabled={busyKey === `open:${row.vaccineId}` || busyKey === `download:${row.vaccineId}`}
                        onClick={() => generate(row, 'download')}
                      >
                        Download
                      </button>
                      {row.cert?.pdf_url && (
                        <a className="btn ghost small" href={row.cert.pdf_url} target="_blank" rel="noreferrer">
                          Stored PDF
                        </a>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {!eligibleRows.length && (
          <p className="muted">No eligible certificates yet. Complete all required doses for a vaccine first.</p>
        )}
      </div>
    </div>
  )
}
