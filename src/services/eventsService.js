import { supabase } from './supabaseClient';

const TABLE = 'events';

// ── Date/time helpers ───────────────────────────────────────────────────────

export function getTodayYmd() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function getNowHhmm() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

const toYmd = (value) => {
  if (!value) return null;
  try {
    const s = String(value).trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    const d = new Date(s);
    if (isNaN(d.getTime())) return null;
    return d.toISOString().slice(0, 10);
  } catch { return null; }
};

const toHhmm = (value) => {
  if (!value) return null;
  try {
    const s = String(value).trim();
    if (/^\d{2}:\d{2}/.test(s)) return s.slice(0, 5);
    return null;
  } catch { return null; }
};

/**
 * Classify an event into 'current' | 'upcoming' | 'past'
 */
export function classifyEvent(event) {
  const today = getTodayYmd();
  const nowTime = getNowHhmm();

  const start = toYmd(event?.startEventDate);
  const end = toYmd(event?.endEventDate) || start; // null endDate = single day
  const startTime = toHhmm(event?.startTime);
  const endTime = toHhmm(event?.endTime);

  if (!start) return 'past'; // no date = treat as past

  // PAST: end date already passed
  if (end < today) return 'past';

  // UPCOMING: starts in the future
  if (start > today) return 'upcoming';
  if (start === today && startTime && startTime > nowTime) return 'upcoming';

  // CURRENT: start <= today <= end
  if (start <= today && end >= today) {
    // If today is end-day and endTime passed, event becomes past.
    // Applies to both single-day and multi-day events.
    if (today === end && endTime && endTime < nowTime) return 'past';

    // If single-day event starts later today, it's upcoming (already handled above).
    // If times are missing, date-window match is current.
    return 'current';
  }

  return 'past';
}

const compareAscByDateTime = (a, b) => {
  const sa = String(a?.startEventDate || '');
  const sb = String(b?.startEventDate || '');
  if (sa !== sb) return sa.localeCompare(sb);

  const ta = String(a?.startTime || '');
  const tb = String(b?.startTime || '');
  if (ta !== tb) return ta.localeCompare(tb);

  const ca = String(a?.created_at || '');
  const cb = String(b?.created_at || '');
  if (ca !== cb) return cb.localeCompare(ca);

  return String(a?.id || '').localeCompare(String(b?.id || ''));
};

const comparePastDesc = (a, b) => {
  const sa = String(a?.startEventDate || '');
  const sb = String(b?.startEventDate || '');
  if (sa !== sb) return sb.localeCompare(sa);

  const ea = String(a?.endEventDate || a?.startEventDate || '');
  const eb = String(b?.endEventDate || b?.startEventDate || '');
  if (ea !== eb) return eb.localeCompare(ea);

  const ta = String(a?.endTime || '');
  const tb = String(b?.endTime || '');
  if (ta !== tb) return tb.localeCompare(ta);

  return String(a?.id || '').localeCompare(String(b?.id || ''));
};

export function sortEventsByCategory(category, events) {
  const list = Array.isArray(events) ? [...events] : [];
  if (category === 'past') return list.sort(comparePastDesc);
  return list.sort(compareAscByDateTime);
}

/**
 * Format event date range for display
 */
export function formatEventDate(startDate, endDate) {
  const toLabel = (v) => {
    if (!v) return null;
    try {
      return new Date(v).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    } catch { return String(v); }
  };
  const s = toLabel(startDate);
  const e = toLabel(endDate);
  if (s && e && s !== e) return `${s} – ${e}`;
  return s || e || 'Date TBD';
}

/**
 * Format time range for display
 */
export function formatTimeRange(startTime, endTime) {
  const fmt = (t) => {
    if (!t) return null;
    try {
      const [h, m] = t.slice(0, 5).split(':').map(Number);
      const period = h >= 12 ? 'PM' : 'AM';
      const hour = h % 12 || 12;
      return `${hour}:${String(m).padStart(2, '0')} ${period}`;
    } catch { return t; }
  };
  const s = fmt(startTime);
  const e = fmt(endTime);
  if (s && e) return `${s} – ${e}`;
  if (s) return `From ${s}`;
  if (e) return `Until ${e}`;
  return null;
}

// ── API fetch ───────────────────────────────────────────────────────────────

/**
 * Fetch all active events for a trust from DB (2 columns only for list).
 * Classification (current/upcoming/past) happens client-side.
 */
export async function fetchAllEventsForTrust({ trustId }) {
  if (!trustId) return { success: true, data: [] };

  const { data, error } = await supabase
    .from(TABLE)
    .select('id, trust_id, type, title, description, location, startEventDate, endEventDate, startTime, endTime, status, attachments, created_at, updated_at')
    .eq('trust_id', trustId)
    .eq('status', 'active')
    .order('startEventDate', { ascending: true })
    .order('startTime', { ascending: true })
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[EventsService] fetchAllEventsForTrust error:', error);
    return { success: false, data: [], error: error.message };
  }

  const events = Array.isArray(data) ? data : [];
  console.log(`[EventsService][Debug] trust=${trustId} fetched=${events.length} active_events`);
  return { success: true, data: events };
}

/**
 * Fetch full event detail by ID (for detail page).
 */
export async function fetchEventById({ eventId, trustId }) {
  if (!eventId) return { success: false, data: null };

  let query = supabase
    .from(TABLE)
    .select('*')
    .eq('id', eventId)
    .eq('status', 'active');

  if (trustId) query = query.eq('trust_id', trustId);

  const { data, error } = await query.maybeSingle();

  if (error) {
    console.error('[EventsService] fetchEventById error:', error);
    return { success: false, data: null, error: error.message };
  }

  return { success: true, data: data || null };
}
