import React, { useEffect, useRef, useState } from 'react';
import { Calendar, CheckCircle2, ChevronRight, Clock3, FileText, Home as HomeIcon, MapPin, Menu, Paperclip, X, Zap } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import { useAppTheme } from './context/ThemeContext';
import {
  CATEGORIES,
  clearEventsCache,
  eventsConfig,
  getEventsCounts,
  getEventsSnapshot,
  loadEventsPage,
} from './services/eventsStore';
import { formatEventDate, formatTimeRange } from './services/eventsService';
import { applyOpacity } from './utils/colorUtils';

const EVENTS_SCROLL_KEY = 'events_scroll_y';

const CATEGORY_META = {
  current: { label: 'Current', icon: Zap },
  upcoming: { label: 'Upcoming', icon: Clock3 },
  past: { label: 'Past', icon: CheckCircle2 },
};

const isLikelyUrl = (value) => /^https?:\/\//i.test(String(value || '').trim());

const getAttachmentUrl = (attachment) => {
  if (typeof attachment === 'string') return attachment.trim();
  if (!attachment || typeof attachment !== 'object') return '';
  return String(attachment.url || attachment.path || attachment.href || '').trim();
};

const getAttachmentLabel = (attachment, idx) => {
  if (typeof attachment === 'object' && attachment) {
    const label = String(attachment.name || attachment.title || '').trim();
    if (label) return label;
  }

  const url = getAttachmentUrl(attachment);
  if (!url) return `Attachment ${idx + 1}`;

  try {
    const parsed = new URL(url);
    const last = (parsed.pathname || '').split('/').filter(Boolean).pop();
    return decodeURIComponent(last || `Attachment ${idx + 1}`);
  } catch {
    return `Attachment ${idx + 1}`;
  }
};

const getAttachmentType = (url) => {
  const clean = String(url || '').toLowerCase().split('?')[0].split('#')[0];
  if (/\.(png|jpe?g|gif|webp|bmp|svg)$/.test(clean)) return 'image';
  if (/\.pdf$/.test(clean)) return 'pdf';
  return 'other';
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
      let resolvedTotalCount = Number(res?.totalCount);

      const latestCounts = getEventsCounts(normalizedTrustId);
      let expectedCount = Number(latestCounts?.[normalizedCategory]) || 0;
      const pageSize = Number(eventsConfig?.PAGE_SIZE) > 0 ? Number(eventsConfig.PAGE_SIZE) : 10;
      const expectedVisible = Math.min(expectedCount, safePage * pageSize);
      const hasListCountMismatch = expectedVisible > 0 && resolvedEvents.length < expectedVisible;

      if (!forceRefresh && hasListCountMismatch) {
        console.warn('[Events][Recovery] count/list mismatch. Clearing cache and retrying forced reload.', {
          trustId: normalizedTrustId,
          category: normalizedCategory,
          page: safePage,
          expectedCount,
          expectedVisible,
          resolvedLength: resolvedEvents.length
        });
        clearEventsCache(normalizedTrustId);
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
        resolvedTotalCount = Number(retry?.totalCount);
        const retryCounts = getEventsCounts(normalizedTrustId);
        expectedCount = Number(retryCounts?.[normalizedCategory]) || 0;
      }

      setPageByCategory((prev) => ({ ...prev, [normalizedCategory]: safePage }));
      if (activeTabRef.current === normalizedCategory) {
        setEvents(resolvedEvents);
        setHasMore(resolvedHasMore);
      }
      setCounts((prev) => {
        const storeCounts = getEventsCounts(normalizedTrustId);
        const resolvedTotal = Number(resolvedTotalCount);
        if (Number.isFinite(resolvedTotal) && resolvedTotal >= 0) {
          return { ...storeCounts, [normalizedCategory]: resolvedTotal };
        }
        return { ...prev, ...storeCounts };
      });
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

  const openEventDetail = (eventId) => {
    sessionStorage.setItem(EVENTS_SCROLL_KEY, String(window.scrollY || 0));
    navigate(`/events/${encodeURIComponent(eventId)}`);
  };

  const meta = CATEGORY_META[activeTab];
  const TabIcon = meta.icon;

  return (
    <div className={`min-h-screen pb-10 relative${isMenuOpen ? ' overflow-hidden max-h-screen' : ''}`} style={{ background: 'var(--page-bg, var(--app-page-bg))' }}>
      <div className="theme-navbar border-b px-6 py-5 flex items-center justify-between sticky top-0 z-50 shadow-sm" style={{ paddingTop: 'max(env(safe-area-inset-top, 0px), 20px)' }}>
        <button onClick={() => setIsMenuOpen(!isMenuOpen)} className="p-2 rounded-xl transition-colors" style={{ background: 'color-mix(in srgb, var(--surface-color) 88%, var(--app-accent-bg))' }}>
          {isMenuOpen ? <X className="h-6 w-6" style={{ color: 'var(--navbar-text)' }} /> : <Menu className="h-6 w-6" style={{ color: 'var(--navbar-text)' }} />}
        </button>
        <h1 className="text-lg font-bold" style={{ color: 'var(--navbar-text)' }}>Events</h1>
        <button onClick={() => onNavigate('home')} className="p-2 rounded-xl transition-colors" style={{ color: 'var(--navbar-text)', background: 'color-mix(in srgb, var(--surface-color) 88%, var(--app-accent-bg))' }}>
          <HomeIcon className="h-5 w-5" />
        </button>
      </div>

      {isMenuOpen && <div className="fixed inset-0 z-25" style={{ background: applyOpacity('var(--brand-navy-dark)', 0.01) }} onClick={() => setIsMenuOpen(false)} />}
      <Sidebar isOpen={isMenuOpen} onClose={() => setIsMenuOpen(false)} onNavigate={onNavigate} currentPage="events" />

      <div className="px-6 pb-3">
        <div className="flex gap-2 p-1 rounded-2xl" style={{ background: 'color-mix(in srgb, var(--app-accent-bg) 20%, var(--surface-color))', border: '1px solid color-mix(in srgb, var(--brand-navy) 8%, transparent)' }}>
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
                  color: 'var(--surface-color)',
                  boxShadow: `0 4px 12px ${applyOpacity(theme.primary, 0.19)}`,
                } : {
                  color: 'var(--body-text-color)',
                }}
              >
                <m.icon className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{m.label}</span>
                {count > 0 && (
                  <span
                    className="text-[9px] font-bold px-1 py-0.5 rounded-full min-w-[16px] text-center"
                    style={isActive
                      ? { background: applyOpacity('var(--surface-color)', 0.22), color: 'var(--surface-color)' }
                      : { background: 'color-mix(in srgb, var(--surface-color) 76%, var(--app-accent-bg))', color: 'var(--body-text-color)', border: '1px solid color-mix(in srgb, var(--brand-navy) 12%, transparent)' }
                    }
                  >
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
          <p className="text-[11px] font-semibold" style={{ color: 'var(--body-text-color)' }}>
            {events.length} of {counts[activeTab]} {activeTab} event{counts[activeTab] === 1 ? '' : 's'}
          </p>
        </div>
      )}

      {loading && (
        <div className="px-6 py-4 space-y-4 animate-pulse">
          {[1, 2, 3].map((i) => (
            <div key={i} className="rounded-2xl p-5 border shadow-sm" style={{ background: 'var(--surface-color)', borderColor: 'color-mix(in srgb, var(--brand-navy) 10%, transparent)' }}>
              <div className="h-3 rounded w-1/4 mb-3" style={{ background: 'color-mix(in srgb, var(--surface-color) 60%, var(--app-accent-bg))' }} />
              <div className="h-4 rounded w-2/3 mb-2" style={{ background: 'color-mix(in srgb, var(--surface-color) 60%, var(--app-accent-bg))' }} />
              <div className="h-3 rounded w-full" style={{ background: 'color-mix(in srgb, var(--surface-color) 60%, var(--app-accent-bg))' }} />
            </div>
          ))}
        </div>
      )}

      {!loading && error && (
        <div className="px-6 py-10">
          <div className="rounded-2xl p-6 text-center" style={{ background: 'color-mix(in srgb, var(--brand-red-light) 72%, var(--surface-color))', border: '1px solid color-mix(in srgb, var(--brand-red) 25%, transparent)' }}>
            <h3 className="font-bold" style={{ color: 'var(--brand-red-dark)' }}>Unable to load events</h3>
            <p className="text-sm mt-1" style={{ color: 'var(--brand-red)' }}>{error}</p>
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
            const rawAttachments = Array.isArray(event.attachments) ? event.attachments : [];
            const normalizedAttachments = rawAttachments
              .map((attachment, idx) => {
                const url = getAttachmentUrl(attachment);
                if (!isLikelyUrl(url)) return null;
                return {
                  id: `${event.id}_att_${idx}`,
                  url,
                  label: getAttachmentLabel(attachment, idx),
                  type: getAttachmentType(url),
                };
              })
              .filter(Boolean);
            const attachCount = normalizedAttachments.length;
            const firstAttachment = attachCount > 0 ? normalizedAttachments[0] : null;
            const extraAttachmentCount = attachCount > 1 ? attachCount - 1 : 0;

            return (
              <button
                key={event.id}
                onClick={() => openEventDetail(event.id)}
                className="w-full text-left rounded-2xl p-4 sm:p-5 border transition-all hover:shadow-md active:scale-[0.995] border-l-4 shadow-sm"
                style={{
                  background: 'var(--surface-color)',
                  borderLeftColor: isPast ? applyOpacity(theme.secondary, 0.55) : theme.primary,
                  borderColor: 'color-mix(in srgb, var(--brand-navy) 10%, transparent)',
                  opacity: isPast ? 0.88 : 1,
                }}
              >
                <div className="flex items-center justify-between gap-3 mb-3">
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full inline-flex items-center gap-1"
                    style={isPast
                      ? { color: 'var(--body-text-color)', background: 'color-mix(in srgb, var(--surface-color) 70%, var(--app-accent-bg))' }
                      : isOngoing
                        ? { color: theme.secondary, background: 'color-mix(in srgb, var(--app-accent) 55%, var(--surface-color))' }
                        : { color: theme.primary, background: `color-mix(in srgb, ${theme.primary} 12%, var(--surface-color))` }
                    }
                  >
                    <TabIcon className="h-3 w-3" />
                    {isPast ? 'Completed' : isOngoing ? 'Ongoing' : event.type || 'Upcoming'}
                  </span>
                  {dateLabel && (
                    <div className="flex items-center gap-1.5 text-[10px] font-bold whitespace-nowrap" style={{ color: 'color-mix(in srgb, var(--body-text-color) 72%, var(--surface-color))' }}>
                      <Calendar className="h-3 w-3" />
                      {dateLabel}
                    </div>
                  )}
                </div>

                <h3 className="font-bold text-lg mb-2 leading-tight" style={{ color: 'var(--heading-color)' }}>{event.title}</h3>

                {event.description && (
                  <p className="text-sm leading-relaxed line-clamp-2 mb-3" style={{ color: 'var(--body-text-color)' }}>{event.description}</p>
                )}

                <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] font-medium mb-3" style={{ color: 'var(--body-text-color)' }}>
                  {timeLabel && (
                    <div className="flex items-center gap-1"><Clock3 className="h-3 w-3" style={{ color: theme.primary }} />{timeLabel}</div>
                  )}
                  {event.location && (
                    <div className="flex items-center gap-1"><MapPin className="h-3 w-3" style={{ color: theme.primary }} />{event.location}</div>
                  )}
                </div>

                {firstAttachment && (
                  <div
                    className="mb-3 rounded-xl overflow-hidden border"
                    style={{ borderColor: 'color-mix(in srgb, var(--brand-navy) 12%, transparent)' }}
                  >
                    {firstAttachment.type === 'image' ? (
                      <img
                        src={firstAttachment.url}
                        alt={firstAttachment.label}
                        loading="lazy"
                        className="w-full h-36 object-cover bg-slate-100"
                      />
                    ) : (
                      <div
                        className="h-16 px-3 flex items-center gap-2 text-xs font-semibold"
                        style={{ background: 'color-mix(in srgb, var(--surface-color) 70%, var(--app-accent-bg))', color: 'var(--body-text-color)' }}
                      >
                        <FileText className="h-4 w-4 shrink-0" />
                        <span>{firstAttachment.type === 'pdf' ? 'PDF Preview Available' : 'File Attachment'}</span>
                      </div>
                    )}
                    <div
                      className="px-3 py-2 text-[11px] font-medium truncate"
                      style={{ color: 'var(--body-text-color)', background: 'var(--surface-color)' }}
                    >
                      {firstAttachment.label}{extraAttachmentCount > 0 ? ` +${extraAttachmentCount} more` : ''}
                    </div>
                  </div>
                )}

                <div className="pt-3 flex items-center justify-between gap-3" style={{ borderTop: '1px solid color-mix(in srgb, var(--brand-navy) 10%, transparent)' }}>
                  <div className="flex items-center gap-1.5 text-xs font-medium" style={{ color: 'var(--body-text-color)' }}>
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
              <div className="h-20 w-20 rounded-full flex items-center justify-center mx-auto mb-4 border shadow-sm" style={{ background: 'var(--surface-color)', borderColor: 'color-mix(in srgb, var(--brand-navy) 12%, transparent)' }}>
                <Calendar className="h-8 w-8" style={{ color: 'color-mix(in srgb, var(--body-text-color) 42%, var(--surface-color))' }} />
              </div>
              <h3 className="font-bold" style={{ color: 'var(--heading-color)' }}>
                {activeTab === 'current' ? 'No current events right now.' : activeTab === 'upcoming' ? 'No upcoming events.' : 'No past events available.'}
              </h3>
              <p className="text-sm mt-1" style={{ color: 'var(--body-text-color)' }}>Check back later.</p>
            </div>
          )}

          {events.length > 0 && hasMore && (
            <div className="pt-2">
              <button onClick={handleLoadMore} disabled={loadingMore} className="w-full py-3 rounded-xl border text-sm font-semibold disabled:opacity-60" style={{ color: theme.primary, background: 'var(--surface-color)', borderColor: 'color-mix(in srgb, var(--brand-navy) 12%, transparent)' }}>
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
