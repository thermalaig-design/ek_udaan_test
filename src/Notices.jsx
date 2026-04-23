import React, { useEffect, useState } from 'react';
import { Calendar, Home as HomeIcon, Menu, X, Paperclip, Star, ChevronRight, FileText } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import { useAppTheme } from './context/ThemeContext';
import {
  getNoticeboardSnapshot,
  loadNoticeboardPage,
  noticeboardConfig,
  readNoticeboardProgress
} from './services/noticeboardStore';

const formatDateRange = (startDate, endDate) => {
  const toLabel = (value) => {
    if (!value) return '';
    try {
      return new Date(value).toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });
    } catch {
      return String(value);
    }
  };

  const start = toLabel(startDate);
  const end = toLabel(endDate);

  if (start && end) return `${start} - ${end}`;
  if (start) return `From ${start}`;
  if (end) return `Till ${end}`;
  return '';
};

const Notices = ({ onNavigate }) => {
  const navigate = useNavigate();
  const theme = useAppTheme();
  const NOTICE_SCROLL_KEY = 'noticeboard_scroll_y';
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [notices, setNotices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedTrustId, setSelectedTrustId] = useState(() => localStorage.getItem('selected_trust_id') || '');
  const [hasMoreNotices, setHasMoreNotices] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const syncFromStore = (trustId) => {
    const snapshot = getNoticeboardSnapshot(trustId);
    setNotices(Array.isArray(snapshot.notices) ? snapshot.notices : []);
    setHasMoreNotices(Boolean(snapshot.hasMoreNotices));
  };

  const loadPage = async ({ trustId, page, forceRefresh = false, trustName = null }) => {
    if (!trustId) {
      setNotices([]);
      setHasMoreNotices(false);
      return;
    }
    const res = await loadNoticeboardPage({
      trustId,
      trustName,
      page,
      pageSize: noticeboardConfig.PAGE_SIZE,
      forceRefresh
    });
    syncFromStore(trustId);
    const progress = readNoticeboardProgress(trustId);
    console.log(
      '[Noticeboard][Debug] page=',
      page,
      'hasMoreNotices=',
      Boolean(progress.hasMoreNotices),
      'returned_ids=',
      Array.isArray(res?.notices) ? res.notices.map((n) => n?.id).filter(Boolean) : [],
      'returned_types=',
      Array.isArray(res?.notices) ? res.notices.map((n) => n?.type).filter(Boolean) : []
    );
    if (res?.debug) {
      console.log(
        '[Noticeboard][Debug] trust=',
        res.debug.trustId,
        'member=',
        res.debug.memberId,
        'vipEligible=',
        res.debug.vipEligible,
        'regMemberMatch=',
        res.debug.regMemberMatch?.id || null
      );
    }
    if (res?.error) setError(res.error);
  };

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

  const loadNotices = async ({ forceRefresh = false } = {}) => {
    try {
      setError('');
      const trustId = localStorage.getItem('selected_trust_id') || null;
      const trustName = localStorage.getItem('selected_trust_name') || null;
      setSelectedTrustId(trustId || '');
      if (!trustId) {
        setNotices([]);
        setHasMoreNotices(false);
        setLoading(false);
        return;
      }

      const snapshot = getNoticeboardSnapshot(trustId);
      if (!forceRefresh && Array.isArray(snapshot.notices) && snapshot.notices.length > 0) {
        setNotices(snapshot.notices);
        setHasMoreNotices(Boolean(snapshot.hasMoreNotices));
        setLoading(false);
      } else {
        setLoading(true);
      }

      await loadPage({ trustId, trustName, page: 1, forceRefresh });
    } catch (err) {
      setError(err?.message || 'Failed to fetch notices');
      setNotices([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const savedScrollY = Number(sessionStorage.getItem(NOTICE_SCROLL_KEY) || 0);
    if (savedScrollY > 0) {
      window.requestAnimationFrame(() => {
        window.scrollTo(0, savedScrollY);
      });
    }
    loadNotices({ forceRefresh: false });
    const handleTrustChanged = () => {
      sessionStorage.removeItem(NOTICE_SCROLL_KEY);
      loadNotices({ forceRefresh: false });
    };
    window.addEventListener('trust-changed', handleTrustChanged);
    return () => {
      window.removeEventListener('trust-changed', handleTrustChanged);
    };
  }, []);

  const handleLoadMore = async () => {
    if (loadingMore || loading || !hasMoreNotices || !selectedTrustId) return;
    try {
      setLoadingMore(true);
      const progress = readNoticeboardProgress(selectedTrustId);
      const nextPage = Number(progress?.nextPage) > 0 ? Number(progress.nextPage) : 2;
      await loadPage({ trustId: selectedTrustId, page: nextPage, forceRefresh: false, trustName: localStorage.getItem('selected_trust_name') || null });
    } finally {
      setLoadingMore(false);
    }
  };

  const openNoticeDetail = (noticeId) => {
    const id = String(noticeId || '').trim();
    if (!id) return;
    sessionStorage.setItem(NOTICE_SCROLL_KEY, String(window.scrollY || 0));
    navigate(`/notices/${encodeURIComponent(id)}`);
  };

  return (
    <div className={`min-h-screen pb-10 relative${isMenuOpen ? ' overflow-hidden max-h-screen' : ''}`} style={{ background: 'var(--page-bg, var(--app-page-bg))' }}>
      <div className="theme-navbar border-b px-6 py-5 flex items-center justify-between sticky top-0 z-50 shadow-sm pointer-events-auto" style={{ paddingTop: 'max(env(safe-area-inset-top, 0px), 20px)' }}>
        <button
          onClick={() => setIsMenuOpen(!isMenuOpen)}
          className="p-2 rounded-xl hover:bg-gray-100 transition-colors pointer-events-auto"
        >
          {isMenuOpen ? <X className="h-6 w-6" style={{ color: 'var(--navbar-text)' }} /> : <Menu className="h-6 w-6" style={{ color: 'var(--navbar-text)' }} />}
        </button>
        <h1 className="text-lg font-bold" style={{ color: 'var(--navbar-text)' }}>Notice Board</h1>
        <button
          onClick={() => onNavigate('home')}
          className="p-2 rounded-xl hover:bg-gray-100 transition-colors flex items-center justify-center"
          style={{ color: 'var(--navbar-text)' }}
        >
          <HomeIcon className="h-5 w-5" />
        </button>
      </div>

      {isMenuOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-0 z-25 lg:hidden"
          onClick={() => setIsMenuOpen(false)}
          style={{ pointerEvents: 'auto' }}
        />
      )}

      <Sidebar
        isOpen={isMenuOpen}
        onClose={() => setIsMenuOpen(false)}
        onNavigate={onNavigate}
        currentPage="notices"
      />

      {!loading && !error && notices.length > 0 && (
        <div className="px-6 pb-2">
          <p className="text-[11px] font-semibold text-gray-500">
            {notices.length} active notice{notices.length === 1 ? '' : 's'}
          </p>
        </div>
      )}

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
            <h3 className="font-bold text-red-800">Unable to load notices</h3>
            <p className="text-sm text-red-600 mt-1">{error}</p>
            <button
              onClick={() => loadNotices({ forceRefresh: true })}
              className="mt-4 px-4 py-2 rounded-xl text-white text-sm font-semibold"
              style={{ background: 'var(--app-button-bg)', color: 'var(--app-button-text)' }}
            >
              Retry
            </button>
          </div>
        </div>
      )}

      {!loading && !error && (
        <div className="px-6 py-4 space-y-4">
          {notices.map((notice) => {
            const dateLabel = formatDateRange(notice.start_date, notice.end_date);
            const isVip = String(notice?.type || '').toLowerCase() === 'vip';
            return (
            <button
              key={notice.id}
              onClick={() => openNoticeDetail(notice.id)}
              className="w-full text-left bg-white rounded-2xl p-4 sm:p-5 border transition-all hover:shadow-md active:scale-[0.995] border-l-4 shadow-sm"
              style={{
                borderLeftColor: isVip ? 'color-mix(in srgb, var(--brand-red) 45%, #d4af37)' : theme.primary,
                borderColor: isVip ? 'color-mix(in srgb, var(--brand-red) 20%, #f1e2a4)' : 'color-mix(in srgb, var(--brand-navy) 10%, transparent)',
                background: isVip ? 'linear-gradient(180deg, color-mix(in srgb, var(--brand-red-light) 48%, #fffdf6) 0%, #ffffff 45%)' : '#ffffff'
              }}
            >
              <div className="flex items-center justify-between gap-3 mb-3">
                <span
                  className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full inline-flex items-center gap-1"
                style={
                  isVip
                    ? { color: 'color-mix(in srgb, var(--brand-red-dark) 50%, #8A6A00)', background: 'color-mix(in srgb, var(--brand-red-light) 48%, #FDF3C7)' }
                    : { color: theme.primary, background: `color-mix(in srgb, ${theme.primary} 12%, white)` }
                }
              >
                  {isVip ? <Star className="h-3 w-3" fill="color-mix(in srgb, var(--brand-red) 45%, #d4af37)" color="color-mix(in srgb, var(--brand-red) 45%, #d4af37)" /> : null}
                  {isVip ? 'VIP Notice' : 'GEN'}
                </span>
                {dateLabel && (
                  <div className="flex items-center gap-1.5 text-gray-400 text-[10px] font-bold whitespace-nowrap">
                    <Calendar className="h-3 w-3" />
                    {dateLabel}
                  </div>
                )}
              </div>

              <h3 className="font-bold text-gray-800 text-lg mb-2 leading-tight">
                {notice.name}
              </h3>

              {notice.description && (
                <div className="mb-4">
                  <p className="text-gray-600 text-sm leading-relaxed line-clamp-3">
                    {notice.description}
                  </p>
                </div>
              )}

              <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-3">
                <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
                  {Array.isArray(notice.attachments) && notice.attachments.length > 0 && (
                    <>
                      <Paperclip className="h-3.5 w-3.5" />
                      {notice.attachments.length} Attachment{notice.attachments.length === 1 ? '' : 's'}
                    </>
                  )}
                </div>
                <div className="inline-flex items-center gap-1 text-xs font-semibold" style={{ color: theme.primary }}>
                  Tap to view details
                  <ChevronRight className="h-3.5 w-3.5" />
                </div>
              </div>
            </button>
            );
          })}

          {notices.length === 0 && (
            <div className="text-center py-20">
              <div className="bg-white h-20 w-20 rounded-full flex items-center justify-center mx-auto mb-4 border border-slate-200 shadow-sm">
                <FileText className="h-8 w-8 text-slate-300" />
              </div>
              <h3 className="text-gray-800 font-bold">No active notices right now</h3>
              <p className="text-gray-500 text-sm mt-1">You're all caught up.</p>
            </div>
          )}

          {notices.length > 0 && hasMoreNotices && (
            <div className="pt-2">
              <button
                onClick={handleLoadMore}
                disabled={loadingMore}
                className="w-full py-3 rounded-xl border border-gray-200 bg-white text-sm font-semibold disabled:opacity-60"
                style={{ color: theme.primary }}
              >
                {loadingMore ? 'Loading more notices...' : 'Load more notices'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default Notices;
