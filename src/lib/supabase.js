import { createClient } from '@supabase/supabase-js'

export const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
export const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
export const isSupabaseConfigured = Boolean(
  supabaseUrl && supabaseAnonKey && String(supabaseUrl).startsWith('http'),
)

const url = supabaseUrl
const key = supabaseAnonKey

if (!isSupabaseConfigured) {
  console.warn(
    'Missing or invalid VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. Add them to .env.local and restart Vite.',
  )
}

export const supabase = createClient(url || '', key || '', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
  realtime: {
    params: { eventsPerSecond: 12 },
  },
})

export function bookSlotErrorMessage(code) {
  const map = {
    NOT_AUTHENTICATED: 'Please sign in.',
    PROFILE_NOT_FOUND: 'Profile not found.',
    CITIZENS_ONLY: 'Only citizens can book slots.',
    PROFILE_INCOMPLETE: 'Add your CNIC and date of birth in your profile first.',
    SLOT_NOT_FOUND: 'This slot is no longer available.',
    CENTER_NOT_ACTIVE: 'This center is not active yet.',
    TOO_YOUNG: 'You are below the minimum age for this vaccine.',
    DOSE_1_ALREADY_TAKEN: "You can't book a slot for this vaccine.",
    COOLDOWN_ACTIVE: 'You must wait until the required interval after your last dose.',
    SLOT_FULL: 'This slot is full.',
    SLOT_EXPIRED: 'This slot has already expired.',
    BOOKING_WINDOW_CLOSED: "You can't book after the slot start time.",
    ALREADY_BOOKED_THIS_VACCINE: 'You already have a scheduled appointment for this vaccine.',
    OUT_OF_CENTER_STOCK: 'This centre is out of stock for the selected vaccine.',
  }
  return map[code] || code || 'Could not complete booking.'
}

export function parseRpcError(err) {
  const msg = err?.message || ''
  const match = msg.match(/^[A-Z0-9_]+/)
  return match ? match[0] : msg
}
