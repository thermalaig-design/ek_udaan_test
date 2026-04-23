import React, { useEffect, useState } from 'react';
import { ArrowLeft, Calendar, Clock3, ExternalLink, MapPin, Paperclip, Tag } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAppTheme } from './context/ThemeContext';
import { loadEventDetail } from './services/eventsStore';
import { formatEventDate, formatTimeRange } from './services/eventsService';

const Section = ({ icon, label, children, theme }) => {
  const IconComponent = icon;
  return (
    <div className="rounded-2xl p-4 bg-white shadow-sm border" style={{ borderColor: 'color-mix(in srgb, var(--brand-navy) 8%, transparent)' }}>
      <div className="flex items-center gap-2 mb-2">
        <IconComponent className="h-4 w-4 shrink-0" style={{ color: theme.primary }} />
        <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: theme.primary }}>{label}</p>
      </div>
      <div className="text-sm text-gray-700 leading-relaxed">{children}</div>
    </div>
  );
};

const isUrl = (v) => {
  try { new URL(String(v)); return true; } catch { return false; }
};

const EventDetail = () => {
  const { eventId } = useParams();
  const navigate = useNavigate();
  const theme = useAppTheme();

  const trustId = localStorage.getItem('selected_trust_id') || '';

  const hasRouteEventId = Boolean(eventId);
  const [event, setEvent] = useState(null);
  const [loading, setLoading] = useState(() => hasRouteEventId);
  const [error, setError] = useState(() => (hasRouteEventId ? '' : 'Event not found.'));

  useEffect(() => {
    if (!eventId) return;

    let active = true;
    Promise.resolve().then(() => {
      if (active) setLoading(true);
    });

    loadEventDetail({ eventId: decodeURIComponent(eventId), trustId, forceRefresh: false })
      .then((ev) => {
        if (!active) return;
        if (ev) { setEvent(ev); }
        else { setError('Event details not available.'); }
      })
      .catch((err) => { if (active) setError(err?.message || 'Failed to load event.'); })
      .finally(() => { if (active) setLoading(false); });

    return () => { active = false; };
  }, [eventId, trustId]);

  const dateLabel = event ? formatEventDate(event.startEventDate, event.endEventDate) : '';
  const timeLabel = event ? formatTimeRange(event.startTime, event.endTime) : '';
  const attachments = Array.isArray(event?.attachments) ? event.attachments : [];

  return (
    <div className="min-h-screen pb-10" style={{ background: 'var(--page-bg, var(--app-page-bg))' }}>
      {/* Navbar */}
      <div className="theme-navbar border-b px-5 py-4 flex items-center gap-3 sticky top-0 z-50 shadow-sm" style={{ paddingTop: 'max(env(safe-area-inset-top, 0px), 16px)' }}>
        <button onClick={() => navigate(-1)} className="p-2 rounded-xl transition-colors" style={{ background: 'color-mix(in srgb, var(--app-accent-bg) 40%, transparent)' }}>
          <ArrowLeft className="h-5 w-5" style={{ color: 'var(--navbar-text)' }} />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-base font-bold truncate" style={{ color: 'var(--navbar-text)' }}>
            {loading ? 'Event Details' : (event?.title || 'Event Details')}
          </h1>
          {dateLabel && <p className="text-[11px] font-medium truncate" style={{ color: 'var(--body-text-color)' }}>{dateLabel}</p>}
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="px-6 py-4 space-y-4 animate-pulse">
          <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
            <div className="h-3 bg-gray-200 rounded w-1/4 mb-3" />
            <div className="h-5 bg-gray-200 rounded w-3/4 mb-2" />
            <div className="h-3 bg-gray-200 rounded w-full mb-1" />
            <div className="h-3 bg-gray-200 rounded w-5/6" />
          </div>
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
              <div className="h-3 bg-gray-200 rounded w-1/3 mb-2" />
              <div className="h-4 bg-gray-200 rounded w-2/3" />
            </div>
          ))}
        </div>
      )}

      {/* Error */}
      {!loading && error && (
        <div className="px-6 py-10">
          <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-center">
            <h3 className="font-bold text-red-800">Unable to load event</h3>
            <p className="text-sm text-red-600 mt-1">{error}</p>
            <button onClick={() => navigate(-1)} className="mt-4 px-4 py-2 rounded-xl text-sm font-semibold" style={{ background: 'var(--app-button-bg)', color: 'var(--app-button-text)' }}>Go Back</button>
          </div>
        </div>
      )}

      {/* Content */}
      {!loading && !error && event && (
        <div className="px-6 pt-6 space-y-4">
          {/* Hero card */}
          <div className="rounded-2xl p-5 shadow-sm border-l-4" style={{ background: '#ffffff', borderLeftColor: theme.primary, borderColor: 'color-mix(in srgb, var(--brand-navy) 10%, transparent)' }}>
            {event.type && (
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full inline-flex items-center gap-1 mb-3" style={{ color: theme.primary, background: `color-mix(in srgb, ${theme.primary} 12%, white)` }}>
                <Tag className="h-3 w-3" />{event.type}
              </span>
            )}
            <h2 className="text-xl font-extrabold leading-tight mb-2" style={{ color: 'var(--heading-color)' }}>{event.title}</h2>
            {event.description && (
              <p className="text-gray-600 text-sm leading-relaxed">{event.description}</p>
            )}
          </div>

          {/* Date */}
          {dateLabel && (
            <Section icon={Calendar} label="Date" theme={theme}>
              <span className="font-semibold">{dateLabel}</span>
            </Section>
          )}

          {/* Time */}
          {timeLabel && (
            <Section icon={Clock3} label="Time" theme={theme}>
              <span className="font-semibold">{timeLabel}</span>
            </Section>
          )}

          {/* Location */}
          {event.location && (
            <Section icon={MapPin} label="Location" theme={theme}>
              {event.location}
            </Section>
          )}

          {/* Attachments */}
          {attachments.length > 0 && (
            <Section icon={Paperclip} label={`Attachments (${attachments.length})`} theme={theme}>
              <div className="space-y-2">
                {attachments.map((att, i) => {
                  const url = typeof att === 'string' ? att : att?.url || att?.path || null;
                  const label = typeof att === 'string' ? `Attachment ${i + 1}` : (att?.name || att?.title || `Attachment ${i + 1}`);
                  if (url && isUrl(url)) {
                    return (
                      <a key={i} href={url} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-2 text-sm font-medium rounded-xl p-2 transition-colors"
                        style={{ color: theme.primary, background: `color-mix(in srgb, ${theme.primary} 8%, white)` }}
                      >
                        <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                        {label}
                      </a>
                    );
                  }
                  return (
                    <div key={i} className="flex items-center gap-2 text-sm font-medium text-gray-600 rounded-xl p-2 bg-slate-50">
                      <Paperclip className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                      {url || label}
                    </div>
                  );
                })}
              </div>
            </Section>
          )}
        </div>
      )}
    </div>
  );
};

export default EventDetail;
