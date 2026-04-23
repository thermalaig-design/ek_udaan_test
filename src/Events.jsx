import React, { useEffect, useRef, useState } from 'react';
import { Calendar, CheckCircle2, ChevronRight, Clock3, Home as HomeIcon, MapPin, Menu, Paperclip, RefreshCw, X, Zap } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import { useAppTheme } from './context/ThemeContext';
import {
  CATEGORIES,
  clearEventsCache,
  getEventsCounts,
  getEventsSnapshot,
  loadEventsPage,
} from './services/eventsStore';
import { formatEventDate, formatTimeRange } from './services/eventsService';

const EVENTS_SCROLL_KEY = 'events_scroll_y';

const CATEGORY_META = {
  current: { label: 'Current', icon: Zap, badge: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  upcoming: { label: 'Upcoming', icon: Clock3, badge: 'bg-blue-100 text-blue-700 border-blue-200' },
  past: { label: 'Past', icon: CheckCircle2, badge: 'bg-slate-100 text-slate-500 border-slate-200' },
};

const Events = ({ onNavigate }) => {
  const navigate = useNavigate();
  const theme = useAppTheme();

  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('current');
  const [events, setEvents] = useState([]);
  const [pageByCategory, setPageByCategory] = useState({ current: 1, upcoming: 1, past: 1 });
  const [hasMore, setHasMore] = useState(false);
  const [counts, setCounts] = useState({ current: 0, upcoming: 0, past: 0 });
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [selectedTrustId, setSelectedTrustId] = useState(() => localStorage.getItem('selected_trust_id') || '');

  const activeTabRef = useRef(activeTab);
  activeTabRef.current = activeTab;

  useEffect(() => {
    if (isMenuOpen) {
      const y = window.scrollY;
      document.body.style.overflow = 'hidden';
      document.body.style.position = 'fixed';
      document.body.style.width = '100%';
      document.body.style.top = `-${y}px`;
    } else {
      const y = parseInt(document.body.style.top || '0', 10) * -1;
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.width = '';
      document.body.style.top = '';
      window.scrollTo(0, y);
    }
    return () => {
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.width = '';
      document.body.style.top = '';
    };
  }, [isMenuOpen]);

  const syncFromStore = (trustId, category, pageNo) => {
    const snap = getEventsSnapshot(trustId, category, pageNo);
    setEvents(snap.events);
    setHasMore(snap.hasMore);
    setCounts(getEventsCounts(trustId));
    console.log(`[Events][Debug] tab=${category} page=${pageNo} showing=${snap.events.length} total=${snap.totalCount} hasMore=${snap.hasMore}`);
  };

  const loadCategoryPage = async ({ trustId, category, pageNo, forceRefresh = false, forLoadMore = false }) => {
    const normalizedTrustId = trustId || localStorage.getItem('selected_trust_id') || '';
    const normalizedCategory = CATEGORIES.includes(category) ? category : 'current';
    const safePage = Number(pageNo) > 0 ? Number(pageNo) : 1;

    setSelectedTrustId(normalizedTrustId);
    setError('');

    if (!normalizedTrustId) {
      setEvents([]);
      setHasMore(false);
      setLoading(false);
      return;
    }

    if (forLoadMore) setLoadingMore(true);
    else setLoading(true);

    try {
      const res = await loadEventsPage({
        trustId: normalizedTrustId,
        category: normalizedCategory,
        page: safePage,
        forceRefresh
      });

      const fallbackSnap = getEventsSnapshot(normalizedTrustId, normalizedCategory, safePage);
      let resolvedEvents = Array.isArray(res?.events) && res.events.length > 0
        ? res.events
        : (Array.isArray(fallbackSnap?.events) ? fallbackSnap.events : []);
      let resolvedHasMore = typeof res?.hasMore === 'boolean'
        ? res.hasMore
        : Boolean(fallbackSnap?.hasMore);

      const latestCounts = getEventsCounts(normalizedTrustId);
      const expectedCount = Number(latestCounts?.[normalizedCategory]) || 0;
      if (!forceRefresh && resolvedEvents.length === 0 && expectedCount > 0) {
        console.warn('[Events][Recovery] count>0 but list empty. Retrying forced reload.', {
          trustId: normalizedTrustId,
          category: normalizedCategory,
          page: safePage,
          expectedCount
        });
        const retry = await loadEventsPage({
          trustId: normalizedTrustId,
          category: normalizedCategory,
          page: safePage,
          forceRefresh: true
        });
        const retrySnap = getEventsSnapshot(normalizedTrustId, normalizedCategory, safePage);
        resolvedEvents = Array.isArray(retry?.events) && retry.events.length > 0
          ? retry.events
          : (Array.isArray(retrySnap?.events) ? retrySnap.events : []);
        resolvedHasMore = typeof retry?.hasMore === 'boolean'
          ? retry.hasMore
          : Boolean(retrySnap?.hasMore);
      }

      setPageByCategory((prev) => ({ ...prev, [normalizedCategory]: safePage }));
      if (activeTabRef.current === normalizedCategory) {
        setEvents(resolvedEvents);
        setHasMore(resolvedHasMore);
      }
      setCounts(getEventsCounts(normalizedTrustId));
    } catch (err) {
      setError(err?.message || 'Failed to load events');
    } finally {
      if (forLoadMore) setLoadingMore(false);
      else setLoading(false);
    }
  };

  useEffect(() => {
    const savedY = Number(sessionStorage.getItem(EVENTS_SCROLL_KEY) || 0);
    if (savedY > 0) requestAnimationFrame(() => window.scrollTo(0, savedY));

    const trustId = localStorage.getItem('selected_trust_id') || '';
    loadCategoryPage({ trustId, category: 'current', pageNo: 1, forceRefresh: false });

    const onTrustChanged = () => {
      sessionStorage.removeItem(EVENTS_SCROLL_KEY);
      window.scrollTo(0, 0);
      setPageByCategory({ current: 1, upcoming: 1, past: 1 });
      setActiveTab('current');
      const nextTrustId = localStorage.getItem('selected_trust_id') || '';
      loadCategoryPage({ trustId: nextTrustId, category: 'current', pageNo: 1, forceRefresh: false });
    };

    window.addEventListener('trust-changed', onTrustChanged);
    return () => window.removeEventListener('trust-changed', onTrustChanged);
  }, []);

  const handleTabSwitch = (category) => {
    if (category === activeTab) return;
    setActiveTab(category);
    const pageNo = Number(pageByCategory[category]) > 0 ? Number(pageByCategory[category]) : 1;
    syncFromStore(selectedTrustId, category, pageNo);
    loadCategoryPage({ trustId: selectedTrustId, category, pageNo, forceRefresh: false });
  };

  const handleLoadMore = async () => {
    if (loadingMore || !hasMore || !selectedTrustId) return;
    const currentPage = Number(pageByCategory[activeTab]) > 0 ? Number(pageByCategory[activeTab]) : 1;
    await loadCategoryPage({
      trustId: selectedTrustId,
      category: activeTab,
      pageNo: currentPage + 1,
      forceRefresh: false,
      forLoadMore: true
    });
  };

  const handleRefresh = async () => {
    if (refreshing || !selectedTrustId) return;
    setRefreshing(true);
    clearEventsCache(selectedTrustId);
    setPageByCategory({ current: 1, upcoming: 1, past: 1 });
    await loadCategoryPage({
      trustId: selectedTrustId,
      category: activeTabRef.current,
      pageNo: 1,
      forceRefresh: true
    });
    setRefreshing(false);
  };

  const openEventDetail = (eventId) => {
    sessionStorage.setItem(EVENTS_SCROLL_KEY, String(window.scrollY || 0));
    navigate(`/events/${encodeURIComponent(eventId)}`);
  };

  const meta = CATEGORY_META[activeTab];
  const TabIcon = meta.icon;

  return (
    <div className={`min-h-screen pb-10 relative${isMenuOpen ? ' overflow-hidden max-h-screen' : ''}`} style={{ background: 'var(--page-bg, var(--app-page-bg))' }}>
      <div className="theme-navbar border-b px-6 py-5 flex items-center justify-between sticky top-0 z-50 shadow-sm" style={{ paddingTop: 'max(env(safe-area-inset-top, 0px), 20px)' }}>
        <button onClick={() => setIsMenuOpen(!isMenuOpen)} className="p-2 rounded-xl hover:bg-gray-100 transition-colors">
          {isMenuOpen ? <X className="h-6 w-6" style={{ color: 'var(--navbar-text)' }} /> : <Menu className="h-6 w-6" style={{ color: 'var(--navbar-text)' }} />}
        </button>
        <h1 className="text-lg font-bold" style={{ color: 'var(--navbar-text)' }}>Events</h1>
        <button onClick={() => onNavigate('home')} className="p-2 rounded-xl hover:bg-gray-100 transition-colors" style={{ color: 'var(--navbar-text)' }}>
          <HomeIcon className="h-5 w-5" />
        </button>
      </div>

      {isMenuOpen && <div className="fixed inset-0 bg-black bg-opacity-0 z-25" onClick={() => setIsMenuOpen(false)} />}
      <Sidebar isOpen={isMenuOpen} onClose={() => setIsMenuOpen(false)} onNavigate={onNavigate} currentPage="events" />

      <div className="px-6 pt-7 pb-4">
        <div className="rounded-2xl p-4 shadow-sm" style={{ border: '1px solid color-mix(in srgb, var(--brand-navy) 10%, transparent)', background: 'color-mix(in srgb, var(--app-accent-bg) 32%, #ffffff)' }}>
          <div className="flex items-start gap-3">
            <div className="h-11 w-11 rounded-xl flex items-center justify-center shrink-0" style={{ border: '1px solid color-mix(in srgb, var(--brand-navy) 10%, transparent)', background: 'color-mix(in srgb, #ffffff 95%, var(--app-accent-bg))' }}>
              <Calendar className="h-5 w-5" style={{ color: theme.secondary }} />
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-xl font-bold leading-tight" style={{ color: 'var(--heading-color)' }}>Events</h1>
              <p className="text-xs sm:text-sm mt-1" style={{ color: 'var(--body-text-color)' }}>Trust events - current, upcoming, and past</p>
            </div>
            <button onClick={handleRefresh} disabled={refreshing} className="h-9 w-9 rounded-xl disabled:opacity-60 flex items-center justify-center shrink-0" style={{ border: '1px solid color-mix(in srgb, var(--brand-navy) 10%, transparent)', background: 'color-mix(in srgb, #ffffff 88%, var(--app-accent-bg))' }} title="Refresh events">
              <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} style={{ color: theme.primary }} />
            </button>
          </div>
        </div>
      </div>

      <div className="px-6 pb-3">
        <div className="flex gap-2 p-1 rounded-2xl" style={{ background: 'color-mix(in srgb, var(--app-accent-bg) 20%, #ffffff)', border: '1px solid color-mix(in srgb, var(--brand-navy) 8%, transparent)' }}>
          {CATEGORIES.map((cat) => {
            const m = CATEGORY_META[cat];
            const isActive = activeTab === cat;
            const count = counts[cat];
            return (
              <button
                key={cat}
                onClick={() => handleTabSwitch(cat)}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 px-2 rounded-xl text-xs font-bold transition-all duration-200"
                style={isActive ? {
                  background: `linear-gradient(135deg, ${theme.primary} 0%, ${theme.secondary} 100%)`,
                  color: '#ffffff',
                  boxShadow: `0 4px 12px ${theme.primary}30`,
                } : {
                  color: 'var(--body-text-color)',
                }}
              >
                <m.icon className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{m.label}</span>
                {count > 0 && (
                  <span className={`text-[9px] font-bold px-1 py-0.5 rounded-full min-w-[16px] text-center ${isActive ? 'bg-white/20 text-white' : m.badge}`}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {!loading && !error && events.length > 0 && (
        <div className="px-6 pb-2">
          <p className="text-[11px] font-semibold text-gray-500">
            {events.length} of {counts[activeTab]} {activeTab} event{counts[activeTab] === 1 ? '' : 's'}
          </p>
        </div>
      )}

      {loading && (
        <div className="px-6 py-4 space-y-4 animate-pulse">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
              <div className="h-3 bg-gray-200 rounded w-1/4 mb-3" />
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
              onClick={() => loadCategoryPage({ trustId: selectedTrustId, category: activeTabRef.current, pageNo: 1, forceRefresh: true })}
              className="mt-4 px-4 py-2 rounded-xl text-sm font-semibold"
              style={{ background: 'var(--app-button-bg)', color: 'var(--app-button-text)' }}
            >
              Retry
            </button>
          </div>
        </div>
      )}

      {!loading && !error && (
        <div className="px-6 py-4 space-y-4">
          {events.map((event) => {
            const dateLabel = formatEventDate(event.startEventDate, event.endEventDate);
            const timeLabel = formatTimeRange(event.startTime, event.endTime);
            const isOngoing = activeTab === 'current';
            const isPast = activeTab === 'past';
            const attachCount = Array.isArray(event.attachments) ? event.attachments.length : 0;

            return (
              <button
                key={event.id}
                onClick={() => openEventDetail(event.id)}
                className="w-full text-left bg-white rounded-2xl p-4 sm:p-5 border transition-all hover:shadow-md active:scale-[0.995] border-l-4 shadow-sm"
                style={{
                  borderLeftColor: isPast ? '#94a3b8' : theme.primary,
                  borderColor: 'color-mix(in srgb, var(--brand-navy) 10%, transparent)',
                  opacity: isPast ? 0.88 : 1,
                }}
              >
                <div className="flex items-center justify-between gap-3 mb-3">
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full inline-flex items-center gap-1"
                    style={isPast
                      ? { color: '#64748b', background: '#f1f5f9' }
                      : isOngoing
                        ? { color: '#065f46', background: '#d1fae5' }
                        : { color: theme.primary, background: `color-mix(in srgb, ${theme.primary} 12%, white)` }
                    }
                  >
                    <TabIcon className="h-3 w-3" />
                    {isPast ? 'Completed' : isOngoing ? 'Ongoing' : event.type || 'Upcoming'}
                  </span>
                  {dateLabel && (
                    <div className="flex items-center gap-1.5 text-gray-400 text-[10px] font-bold whitespace-nowrap">
                      <Calendar className="h-3 w-3" />
                      {dateLabel}
                    </div>
                  )}
                </div>

                <h3 className="font-bold text-gray-800 text-lg mb-2 leading-tight">{event.title}</h3>

                {event.description && (
                  <p className="text-gray-600 text-sm leading-relaxed line-clamp-2 mb-3">{event.description}</p>
                )}

                <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-gray-500 font-medium mb-3">
                  {timeLabel && (
                    <div className="flex items-center gap-1"><Clock3 className="h-3 w-3" style={{ color: theme.primary }} />{timeLabel}</div>
                  )}
                  {event.location && (
                    <div className="flex items-center gap-1"><MapPin className="h-3 w-3" style={{ color: theme.primary }} />{event.location}</div>
                  )}
                </div>

                <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
                    {attachCount > 0 && <><Paperclip className="h-3.5 w-3.5" />{attachCount} Attachment{attachCount === 1 ? '' : 's'}</>}
                  </div>
                  <div className="inline-flex items-center gap-1 text-xs font-semibold" style={{ color: theme.primary }}>
                    Tap to view details <ChevronRight className="h-3.5 w-3.5" />
                  </div>
                </div>
              </button>
            );
          })}

          {events.length === 0 && (
            <div className="text-center py-20">
              <div className="bg-white h-20 w-20 rounded-full flex items-center justify-center mx-auto mb-4 border border-slate-200 shadow-sm">
                <Calendar className="h-8 w-8 text-slate-300" />
              </div>
              <h3 className="text-gray-800 font-bold">
                {activeTab === 'current' ? 'No current events right now.' : activeTab === 'upcoming' ? 'No upcoming events.' : 'No past events available.'}
              </h3>
              <p className="text-gray-500 text-sm mt-1">Check back later.</p>
            </div>
          )}

          {events.length > 0 && hasMore && (
            <div className="pt-2">
              <button onClick={handleLoadMore} disabled={loadingMore} className="w-full py-3 rounded-xl border border-gray-200 bg-white text-sm font-semibold disabled:opacity-60" style={{ color: theme.primary }}>
                {loadingMore ? 'Loading more events...' : 'Load more events'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default Events;
