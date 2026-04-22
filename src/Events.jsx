import React, { useEffect, useState } from 'react';
import { Calendar, Clock3, Home as HomeIcon, MapPin, Menu, Users, X } from 'lucide-react';
import Sidebar from './components/Sidebar';
import { useAppTheme } from './context/ThemeContext';
import { fetchEvents } from './services/communityService';

const formatDate = (value) => {
  if (!value) return 'Date TBD';
  try {
    return new Date(value).toLocaleDateString('en-IN', {
      weekday: 'short',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return String(value);
  }
};

const formatTimeRange = (startTime, endTime) => {
  if (!startTime && !endTime) return 'Time TBD';
  if (startTime && endTime) return `${startTime.slice(0, 5)} - ${endTime.slice(0, 5)}`;
  return startTime ? startTime.slice(0, 5) : endTime.slice(0, 5);
};

const Events = ({ onNavigate }) => {
  const theme = useAppTheme();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isMenuOpen) {
      const scrollY = window.scrollY;
      document.documentElement.style.overflow = 'hidden';
      document.body.style.overflow = 'hidden';
      document.body.style.position = 'fixed';
      document.body.style.width = '100%';
      document.body.style.top = `-${scrollY}px`;
      document.body.style.touchAction = 'none';
    } else {
      const scrollY = parseInt(document.body.style.top || '0', 10) * -1;
      document.documentElement.style.overflow = 'unset';
      document.body.style.overflow = 'unset';
      document.body.style.position = 'unset';
      document.body.style.width = 'unset';
      document.body.style.top = 'unset';
      document.body.style.touchAction = 'auto';
      window.scrollTo(0, scrollY);
    }

    return () => {
      document.documentElement.style.overflow = 'unset';
      document.body.style.overflow = 'unset';
      document.body.style.position = 'unset';
      document.body.style.width = 'unset';
      document.body.style.top = 'unset';
      document.body.style.touchAction = 'auto';
    };
  }, [isMenuOpen]);

  const loadEvents = async () => {
    try {
      setLoading(true);
      setError('');
      const trustId = localStorage.getItem('selected_trust_id') || null;
      const trustName = localStorage.getItem('selected_trust_name') || null;
      const response = await fetchEvents({ trustId, trustName, includePast: false });

      if (!response.success) {
        setError(response.message || 'Failed to fetch events');
        setEvents([]);
        return;
      }

      setEvents(response.data || []);
    } catch (err) {
      setError(err?.message || 'Failed to fetch events');
      setEvents([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadEvents();
  }, []);

  return (
    <div className={`min-h-screen pb-10 relative${isMenuOpen ? ' overflow-hidden max-h-screen' : ''}`} style={{ background: 'var(--page-bg, var(--app-page-bg))' }}>
      <div className="theme-navbar border-b px-6 py-5 flex items-center justify-between sticky top-0 z-50 shadow-sm pointer-events-auto" style={{ paddingTop: 'max(env(safe-area-inset-top, 0px), 20px)' }}>
        <button
          onClick={() => setIsMenuOpen(!isMenuOpen)}
          className="p-2 rounded-xl hover:bg-gray-100 transition-colors pointer-events-auto"
        >
          {isMenuOpen ? <X className="h-6 w-6" style={{ color: 'var(--navbar-text)' }} /> : <Menu className="h-6 w-6" style={{ color: 'var(--navbar-text)' }} />}
        </button>
        <h1 className="text-lg font-bold" style={{ color: 'var(--navbar-text)' }}>Events</h1>
        <button
          onClick={() => onNavigate('home')}
          className="p-2 rounded-xl hover:bg-gray-100 transition-colors flex items-center justify-center"
          style={{ color: theme.primary }}
        >
          <HomeIcon className="h-5 w-5" />
        </button>
      </div>

      <Sidebar
        isOpen={isMenuOpen}
        onClose={() => setIsMenuOpen(false)}
        onNavigate={onNavigate}
        currentPage="events"
      />

      <div className="px-6 pt-8 pb-4" style={{ background: 'transparent' }}>
        <div className="flex items-center gap-4">
          <div className="p-3 rounded-2xl shadow-sm" style={{ background: 'color-mix(in srgb, #ffffff 92%, var(--app-accent-bg))', border: '1px solid color-mix(in srgb, var(--brand-navy) 10%, transparent)' }}>
            <Calendar className="h-12 w-12" style={{ color: theme.secondary }} />
          </div>
          <div>
            <h1 className="text-2xl font-bold" style={{ color: 'var(--heading-color)' }}>Upcoming Events</h1>
            <p className="text-sm font-medium" style={{ color: 'var(--body-text-color)' }}>Live events from trust database</p>
          </div>
        </div>
      </div>

      {loading && (
        <div className="px-6 py-4 space-y-4 animate-pulse">
          {[1, 2, 3].map((item) => (
            <div key={item} className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
              <div className="h-3 bg-gray-200 rounded w-1/3 mb-3" />
              <div className="h-4 bg-gray-200 rounded w-2/3 mb-2" />
              <div className="h-3 bg-gray-200 rounded w-full" />
            </div>
          ))}
        </div>
      )}

      {!loading && error && (
        <div className="px-6 py-10">
          <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-center">
            <h3 className="font-bold text-red-800">Unable to load events</h3>
            <p className="text-sm text-red-600 mt-1">{error}</p>
            <button
              onClick={loadEvents}
              className="mt-4 px-4 py-2 rounded-xl text-white text-sm font-semibold"
              style={{ background: theme.primary }}
            >
              Retry
            </button>
          </div>
        </div>
      )}

      {!loading && !error && (
        <div className="px-6 py-4 space-y-4">
          {events.map((event) => (
            <div
              key={event.id}
              className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 hover:shadow-md transition-all border-l-4"
              style={{ borderLeftColor: theme.primary }}
            >
              <div className="flex items-center justify-between mb-3">
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full" style={{ color: theme.primary, background: `color-mix(in srgb, ${theme.primary} 10%, white)` }}>
                  {event.type || 'general'}
                </span>
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">
                  {event.is_registration_required ? 'Registration Required' : 'Open Event'}
                </span>
              </div>

              <h3 className="font-bold text-gray-800 text-lg mb-2 leading-tight">{event.title}</h3>

              <p className="text-gray-600 text-sm leading-relaxed mb-4">
                {event.description || 'No description available.'}
              </p>

              <div className="grid grid-cols-1 gap-2 text-[12px] text-gray-600 font-medium">
                <div className="flex items-center gap-2">
                  <Calendar className="h-3.5 w-3.5" style={{ color: theme.primary }} />
                  <span>{formatDate(event.event_date)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Clock3 className="h-3.5 w-3.5" style={{ color: theme.primary }} />
                  <span>{formatTimeRange(event.start_time, event.end_time)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <MapPin className="h-3.5 w-3.5" style={{ color: theme.primary }} />
                  <span>{event.location || 'Location TBD'}</span>
                </div>
                {event.max_participants ? (
                  <div className="flex items-center gap-2">
                    <Users className="h-3.5 w-3.5" style={{ color: theme.primary }} />
                    <span>Max participants: {event.max_participants}</span>
                  </div>
                ) : null}
              </div>
            </div>
          ))}

          {events.length === 0 && (
            <div className="text-center py-20">
              <div className="bg-gray-50 h-20 w-20 rounded-full flex items-center justify-center mx-auto mb-4 border border-dashed border-gray-300">
                <Calendar className="h-8 w-8 text-gray-300" />
              </div>
              <h3 className="text-gray-800 font-bold">No upcoming events</h3>
              <p className="text-gray-500 text-sm mt-1">Events table is connected. Add records to show here.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default Events;
