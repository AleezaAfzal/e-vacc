import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { bookSlotErrorMessage, parseRpcError, supabase } from '../../lib/supabase'
import { useAuth } from '../../context/useAuth'

export default function CentreSlots() {
  const { id } = useParams()
  const { session, profile } = useAuth()
  const [center, setCenter] = useState(null)
  const [slots, setSlots] = useState([])
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const [booking, setBooking] = useState(null)
  const [showModal, setShowModal] = useState(false)
  const [selectedSlot, setSelectedSlot] = useState(null)

  const load = useCallback(async () => {
    if (!id) {
      setErr('Invalid centre id.')
      setCenter(null)
      setSlots([])
      setLoading(false)
      return
    }

    setLoading(true)
    setErr('')
    try {
      const [{ data: c, error: centerErr }, { data: s, error: slotsErr }] = await Promise.all([
        supabase.from('centers').select('id, name, address, lat, lng').eq('id', id).maybeSingle(),
        supabase
          .from('slots')
          .select('id, center_id, vaccine_id, slot_date, slot_time, slot_end_time, room_label, capacity, vaccines(name)')
          .eq('center_id', id)
          .gte('slot_date', new Date().toISOString().slice(0, 10))
          .order('slot_date')
          .order('slot_time'),
      ])

      if (centerErr) throw centerErr
      if (slotsErr) throw slotsErr

      setCenter(c || null)

      const slotIds = (s || []).map((slot) => slot.id)
      let a = []
      if (slotIds.length) {
        const { data: scopedAppointments, error: apptErr } = await supabase
          .from('appointments')
          .select('slot_id')
          .eq('status', 'scheduled')
          .in('slot_id', slotIds)
        if (apptErr) throw apptErr
        a = scopedAppointments || []
      }

      // Calculate available slots for each slot
      const appointmentCounts = {}
      a.forEach((appt) => {
        appointmentCounts[appt.slot_id] = (appointmentCounts[appt.slot_id] || 0) + 1
      })

      // Add available count to each slot
      const enrichedSlots = (s || []).map((slot) => ({
        ...slot,
        booked: appointmentCounts[slot.id] || 0,
        available: Math.max(0, slot.capacity - (appointmentCounts[slot.id] || 0)),
      }))
      setSlots(enrichedSlots)
    } catch (e) {
      setCenter(null)
      setSlots([])
      setErr(e?.message || 'Failed to load centre slots.')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    load()
    const ch = supabase
      .channel(`centre_slots_${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'slots' }, load)
      .subscribe()
    return () => {
      supabase.removeChannel(ch)
    }
  }, [load, id])

  async function confirmBook() {
    if (!selectedSlot) return
    setErr('')
    setMsg('')
    setBooking(selectedSlot.id)
    const { data, error } = await supabase.rpc('book_slot', { p_slot_id: selectedSlot.id })
    setBooking(null)
    if (error) {
      const code = parseRpcError(error)
      setErr(bookSlotErrorMessage(code))
      setShowModal(false)
      return
    }
    setMsg(`Booked. Appointment id: ${data}`)
    setShowModal(false)
    setSelectedSlot(null)
    load()
  }

  const profileOk =
    profile?.role === 'citizen' &&
    profile?.dob &&
    profile?.cnic &&
    String(profile.cnic).trim().length >= 5

  if (loading) {
    return (
      <div className="stack gap-lg">
        <p className="muted">Loading...</p>
      </div>
    )
  }

  if (!center) {
    return (
      <div className="stack gap-lg">
        <p className="error">Centre not found.</p>
        <Link to="/citizen/browse" className="btn ghost">
          Back to centres
        </Link>
      </div>
    )
  }

  return (
    <div className="stack gap-lg">
      {/* Header */}
      <div className="card">
        <Link to="/citizen/browse" className="btn ghost small back-link" style={{ marginBottom: '1rem' }}>
          ← Back to centres
        </Link>
        <h1>{center.name}</h1>
        <p className="muted">{center.address}</p>
        <a href={`https://www.google.com/maps?q=${center.lat},${center.lng}`} target="_blank" rel="noreferrer" className="link map-link">
          Open location on map
        </a>
      </div>

      {!profileOk && (
        <div className="card warn">
          Complete your CNIC and date of birth on the <Link to="/citizen">dashboard</Link> before booking.
        </div>
      )}

      {err && <p className="error">{err}</p>}
      {msg && <p className="success">{msg}</p>}

      {/* Slots Grid */}
      <div>
        <h2>Available slots</h2>
        {slots.length === 0 ? (
          <div className="card">
            <p className="muted">No upcoming slots published for this centre.</p>
          </div>
        ) : (
          <div className="slots-grid">
            {slots.map((s) => (
              <div key={s.id} className="card slot-card">
                <div className="slot-header">
                  <div>
                    <strong>{s.slot_date}</strong>
                    <p className="muted small" style={{ marginTop: '0.25rem' }}>
                      {String(s.slot_time).slice(0, 5)} - {s.slot_end_time ? String(s.slot_end_time).slice(0, 5) : '—'}
                    </p>
                  </div>
                  <div className="vaccine-badge">{s.vaccines?.name}</div>
                </div>
                <p className="room-line" style={{ marginTop: '0.75rem', marginBottom: '0.75rem' }}>
                  Room: <strong>{s.room_label}</strong>
                </p>
                <p className="muted small" style={{ marginBottom: '1rem' }}>
                  {s.available > 0 ? `${s.available} slot${s.available === 1 ? '' : 's'} remaining` : 'No slots available'}
                </p>
                <button
                  type="button"
                  className="btn primary slot-book-btn"
                  disabled={!session || !profileOk || s.available === 0}
                  onClick={() => {
                    setSelectedSlot(s)
                    setShowModal(true)
                  }}
                >
                  {s.available === 0 ? 'Slot full' : 'Book slot'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Booking Modal */}
      {showModal && selectedSlot && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2>Confirm booking</h2>
            <div className="modal-body">
              <p>
                <strong>{center.name}</strong>
              </p>
              <p className="muted small">{center.address}</p>
              <hr style={{ margin: '1rem 0', opacity: 0.2 }} />
              <p>
                <strong>Date:</strong> {selectedSlot.slot_date}
              </p>
              <p>
                <strong>Time:</strong> {String(selectedSlot.slot_time).slice(0, 5)} -{' '}
                {selectedSlot.slot_end_time ? String(selectedSlot.slot_end_time).slice(0, 5) : '—'}
              </p>
              <p>
                <strong>Vaccine:</strong> {selectedSlot.vaccines?.name}
              </p>
              <p>
                <strong>Room:</strong> {selectedSlot.room_label}
              </p>
            </div>
            <div className="modal-actions">
              <button type="button" className="btn ghost" onClick={() => setShowModal(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn primary"
                disabled={booking === selectedSlot.id}
                onClick={confirmBook}
              >
                {booking === selectedSlot.id ? 'Booking...' : 'Confirm booking'}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .slots-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
          gap: 1rem;
        }

        .slot-card {
          display: flex;
          flex-direction: column;
          height: 100%;
        }

        .slot-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 0.5rem;
        }

        .vaccine-badge {
          background: #dbeafe;
          color: #1e40af;
          padding: 0.25rem 0.75rem;
          border-radius: 0.375rem;
          font-size: 0.875rem;
          font-weight: 600;
        }

        .modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
        }

        .modal-content {
          background: white;
          border-radius: 0.5rem;
          padding: 2rem;
          max-width: 400px;
          width: 90%;
          box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1);
        }

        .modal-body {
          margin: 1.5rem 0;
        }

        .modal-body p {
          margin: 0.5rem 0;
        }

        .modal-actions {
          display: flex;
          gap: 0.75rem;
          justify-content: flex-end;
          margin-top: 1.5rem;
        }

        .link {
          color: #0066cc;
          text-decoration: none;
        }

        .link:hover {
          text-decoration: underline;
        }

        .room-line {
          overflow-wrap: anywhere;
        }

        .slot-book-btn {
          width: 100%;
        }

        @media (max-width: 768px) {
          .slots-grid {
            grid-template-columns: 1fr;
          }

          .slot-card {
            padding: 0.9rem;
          }

          .slot-header {
            gap: 0.6rem;
          }

          .vaccine-badge {
            font-size: 0.8rem;
            padding: 0.2rem 0.55rem;
          }

          .back-link {
            width: 100%;
            text-align: center;
          }

          .map-link {
            display: inline-block;
            margin-top: 0.35rem;
          }

          .modal-content {
            width: calc(100% - 1.2rem);
            padding: 1rem;
            max-height: calc(100vh - 2rem);
            overflow: auto;
          }

          .modal-actions {
            flex-direction: column-reverse;
          }

          .modal-actions .btn {
            width: 100%;
          }
        }
      `}</style>
    </div>
  )
}
