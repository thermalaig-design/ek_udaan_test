import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Calendar, ExternalLink, FileText, Home as HomeIcon, Paperclip, Star } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAppTheme } from './context/ThemeContext';
import { getNoticeboardSnapshot, loadNoticeDetail } from './services/noticeboardStore';

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

const isLikelyUrl = (value) => /^https?:\/\//i.test(String(value || '').trim());
const isDataUrl = (value) => /^data:/i.test(String(value || '').trim());
const LEGACY_ATTACHMENT_SEPARATOR = '||::||';

const getAttachmentUrl = (attachment) => {
  if (typeof attachment === 'string') {
    const value = attachment.trim();
    if (!value) return '';
    if (value.includes(LEGACY_ATTACHMENT_SEPARATOR)) {
      const [, payload = ''] = value.split(LEGACY_ATTACHMENT_SEPARATOR);
      return String(payload || '').trim();
    }
    return value;
  }
  if (!attachment || typeof attachment !== 'object') return '';
  const value = String(attachment.url || attachment.path || attachment.href || '').trim();
  if (!value) return '';
  if (value.includes(LEGACY_ATTACHMENT_SEPARATOR)) {
    const [, payload = ''] = value.split(LEGACY_ATTACHMENT_SEPARATOR);
    return String(payload || '').trim();
  }
  return value;
};

const getAttachmentLabel = (attachment, idx) => {
  if (typeof attachment === 'object' && attachment) {
    const label = String(attachment.name || attachment.title || '').trim();
    if (label) return label;
  }

  if (typeof attachment === 'string' && attachment.includes(LEGACY_ATTACHMENT_SEPARATOR)) {
    const [name = ''] = attachment.split(LEGACY_ATTACHMENT_SEPARATOR);
    const cleanName = String(name || '').trim();
    if (cleanName) return cleanName;
  }

  const value = getAttachmentUrl(attachment);
  if (!value) return `Attachment ${idx + 1}`;
  if (isDataUrl(value)) return `Attachment ${idx + 1}`;
  if (!isLikelyUrl(value)) return value;
  try {
    const url = new URL(value);
    const last = (url.pathname || '').split('/').filter(Boolean).pop();
    return decodeURIComponent(last || `Attachment ${idx + 1}`);
  } catch {
    return `Attachment ${idx + 1}`;
  }
};

const getAttachmentType = (url) => {
  const value = String(url || '').trim().toLowerCase();
  if (!value) return 'other';
  if (value.startsWith('data:image/')) return 'image';
  if (value.startsWith('data:application/pdf')) return 'pdf';

  const clean = value.split('?')[0].split('#')[0];
  if (/\.(png|jpe?g|jfif|gif|webp|bmp|svg)$/.test(clean)) return 'image';
  if (/\.pdf$/.test(clean)) return 'pdf';
  return 'other';
};

const NoticeDetail = ({ onNavigate }) => {
  const theme = useAppTheme();
  const navigate = useNavigate();
  const { noticeId } = useParams();
  const [notice, setNotice] = useState(null);
  const [noticeList, setNoticeList] = useState([]);
  const [currentNoticeIndex, setCurrentNoticeIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const touchStartXRef = useRef(null);
  const touchEndXRef = useRef(null);
  const selectedTrustId = useMemo(() => localStorage.getItem('selected_trust_id') || '', []);

  useEffect(() => {
    const loadDetail = async () => {
      setError('');
      setLoading(true);
      const trustId = localStorage.getItem('selected_trust_id') || selectedTrustId || '';
      const trustName = localStorage.getItem('selected_trust_name') || null;
      if (!trustId || !noticeId) {
        setNotice(null);
        setLoading(false);
        setError('Notice not found');
        return;
      }

      const snapshot = getNoticeboardSnapshot(trustId);
      const listFromSnapshot = Array.isArray(snapshot?.notices) ? snapshot.notices : [];
      setNoticeList(listFromSnapshot);
      const idxFromSnapshot = listFromSnapshot.findIndex((item) => String(item?.id || '') === String(noticeId));
      if (idxFromSnapshot >= 0) setCurrentNoticeIndex(idxFromSnapshot);
      const fromList = snapshot?.noticesById?.[String(noticeId)] || null;
      if (fromList) setNotice(fromList);

      const detailRes = await loadNoticeDetail({
        trustId,
        trustName,
        noticeId: String(noticeId),
        forceRefresh: false
      });

      if (detailRes?.error) {
        setError(detailRes.error);
      } else if (detailRes?.notice) {
        setNotice(detailRes.notice);
        setNoticeList((prev) => {
          if (!Array.isArray(prev) || prev.length === 0) return prev;
          const targetId = String(detailRes.notice?.id || '');
          const idx = prev.findIndex((item) => String(item?.id || '') === targetId);
          if (idx < 0) return prev;
          const next = prev.slice();
          next[idx] = { ...next[idx], ...detailRes.notice };
          return next;
        });
      } else if (!fromList) {
        setError('Notice not found');
      }
      setLoading(false);
    };

    loadDetail();
  }, [noticeId, selectedTrustId]);

  useEffect(() => {
    if (loading || error || !Array.isArray(noticeList) || noticeList.length <= 1) return undefined;
    const timer = setInterval(() => {
      setCurrentNoticeIndex((prev) => (prev + 1) % noticeList.length);
    }, 5000);
    return () => clearInterval(timer);
  }, [loading, error, noticeList]);

  const handleBack = () => {
    if (window.history.length > 1) navigate(-1);
    else navigate('/notices', { replace: true });
  };

  const onCardTouchStart = (event) => {
    touchStartXRef.current = event.touches?.[0]?.clientX ?? null;
    touchEndXRef.current = null;
  };

  const onCardTouchMove = (event) => {
    touchEndXRef.current = event.touches?.[0]?.clientX ?? null;
  };

  const onCardTouchEnd = () => {
    if (!Array.isArray(noticeList) || noticeList.length <= 1) return;
    const start = touchStartXRef.current;
    const end = touchEndXRef.current;
    if (start == null || end == null) return;
    const delta = start - end;
    if (Math.abs(delta) < 50) return;
    if (delta > 0) setCurrentNoticeIndex((prev) => (prev + 1) % noticeList.length);
    else setCurrentNoticeIndex((prev) => (prev - 1 + noticeList.length) % noticeList.length);
  };

  const hasCarousel = Array.isArray(noticeList) && noticeList.length > 0;
  const boundedNoticeIndex = hasCarousel
    ? ((currentNoticeIndex % noticeList.length) + noticeList.length) % noticeList.length
    : 0;
  const activeNotice = hasCarousel ? (noticeList[boundedNoticeIndex] || notice) : notice;

  const isVip = String(activeNotice?.type || '').toLowerCase() === 'vip';
  const dateLabel = formatDateRange(activeNotice?.start_date, activeNotice?.end_date);
  const attachments = Array.isArray(activeNotice?.attachments) ? activeNotice.attachments : [];
  const normalizedAttachments = attachments
    .map((attachment, idx) => {
      const url = getAttachmentUrl(attachment);
      if (!url || (!isLikelyUrl(url) && !isDataUrl(url))) return null;
      return {
        id: `${activeNotice?.id || 'notice'}_att_${idx}`,
        url,
        label: getAttachmentLabel(attachment, idx),
        type: getAttachmentType(url),
      };
    })
    .filter(Boolean);

  return (
    <div className="min-h-screen pb-8" style={{ background: 'var(--page-bg, var(--app-page-bg))' }}>
      <div className="theme-navbar border-b px-6 py-5 flex items-center justify-between sticky top-0 z-40 shadow-sm" style={{ paddingTop: 'max(env(safe-area-inset-top, 0px), 20px)' }}>
        <button
          onClick={handleBack}
          className="p-2 rounded-xl hover:bg-gray-100 transition-colors"
          aria-label="Back to notice board"
        >
          <ArrowLeft className="h-5 w-5" style={{ color: 'var(--navbar-text)' }} />
        </button>
        <h1 className="text-lg font-bold" style={{ color: 'var(--navbar-text)' }}>Notice Details</h1>
        <button
          onClick={() => onNavigate('home')}
          className="p-2 rounded-xl hover:bg-gray-100 transition-colors flex items-center justify-center"
          style={{ color: 'var(--navbar-text)' }}
          aria-label="Go to home"
        >
          <HomeIcon className="h-5 w-5" />
        </button>
      </div>

      <div className="px-6 pt-6 pb-10">
        {loading && (
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm animate-pulse">
            <div className="h-4 w-24 bg-slate-200 rounded mb-4" />
            <div className="h-6 w-3/4 bg-slate-200 rounded mb-3" />
            <div className="h-4 w-1/2 bg-slate-200 rounded mb-4" />
            <div className="h-4 w-full bg-slate-200 rounded mb-2" />
            <div className="h-4 w-11/12 bg-slate-200 rounded" />
          </div>
        )}

        {!loading && error && (
          <div className="rounded-2xl p-6 text-center" style={{ background: 'var(--brand-red-light)', border: '1px solid color-mix(in srgb, var(--brand-red) 25%, transparent)' }}>
            <h3 className="font-bold" style={{ color: 'var(--brand-red-dark)' }}>Unable to load notice</h3>
            <p className="text-sm mt-1" style={{ color: 'var(--brand-red-dark)' }}>{error}</p>
            <button
              onClick={handleBack}
              className="mt-4 px-4 py-2 rounded-xl text-white text-sm font-semibold"
              style={{ background: 'var(--app-button-bg)', color: 'var(--app-button-text)' }}
            >
              Back to Notice Board
            </button>
          </div>
        )}

        {!loading && !error && activeNotice && (
          <div
            className="rounded-2xl border bg-white p-5 shadow-sm border-l-4"
            style={{
              borderLeftColor: isVip ? 'color-mix(in srgb, var(--brand-red) 45%, #d4af37)' : theme.primary,
              borderColor: isVip ? 'color-mix(in srgb, var(--brand-red) 22%, #f1e2a4)' : 'color-mix(in srgb, var(--brand-navy) 10%, transparent)',
              background: isVip ? 'linear-gradient(180deg, color-mix(in srgb, var(--brand-red-light) 50%, #fffdf6) 0%, #ffffff 48%)' : '#ffffff'
            }}
            onTouchStart={onCardTouchStart}
            onTouchMove={onCardTouchMove}
            onTouchEnd={onCardTouchEnd}
          >
            <div className="flex items-center justify-between gap-3 mb-4">
              <span
                className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full inline-flex items-center gap-1"
                style={
                  isVip
                    ? { color: 'color-mix(in srgb, var(--brand-red-dark) 50%, #8A6A00)', background: 'color-mix(in srgb, var(--brand-red-light) 48%, #FDF3C7)' }
                    : { color: theme.primary, background: `color-mix(in srgb, ${theme.primary} 12%, white)` }
                }
              >
                {isVip ? <Star className="h-3 w-3" fill="color-mix(in srgb, var(--brand-red) 45%, #d4af37)" color="color-mix(in srgb, var(--brand-red) 45%, #d4af37)" /> : null}
                {isVip ? 'VIP NOTICE' : 'GEN'}
              </span>
              {dateLabel && (
                <div className="flex items-center gap-1.5 text-slate-500 text-xs font-semibold whitespace-nowrap">
                  <Calendar className="h-3.5 w-3.5" />
                  {dateLabel}
                </div>
              )}
            </div>

            <h2 className="text-xl font-bold leading-tight" style={{ color: 'var(--heading-color)' }}>
              {activeNotice.name}
            </h2>

            <p className="mt-4 text-sm leading-relaxed whitespace-pre-line" style={{ color: 'var(--body-text-color)' }}>
              {activeNotice.description || 'No description provided.'}
            </p>

            {normalizedAttachments.length > 0 && (
              <div className="mt-6 border-t border-slate-100 pt-5">
                <h3 className="text-sm font-semibold text-slate-800 mb-3">Attachments ({normalizedAttachments.length})</h3>
                <div className="space-y-3">
                  {normalizedAttachments.map((attachment) => (
                    <div
                      key={attachment.id}
                      className="rounded-xl border overflow-hidden"
                      style={{ borderColor: 'color-mix(in srgb, var(--brand-navy) 12%, transparent)' }}
                    >
                      {attachment.type === 'image' && (
                        <div className="relative w-full h-44 bg-slate-100">
                          <img
                            src={attachment.url}
                            alt={attachment.label}
                            loading="lazy"
                            className="w-full h-44 object-cover bg-slate-100"
                            onError={(e) => {
                              e.currentTarget.style.display = 'none';
                              const fallback = e.currentTarget.nextElementSibling;
                              if (fallback) fallback.style.display = 'flex';
                            }}
                          />
                          <div
                            className="hidden absolute inset-0 items-center justify-center px-3 text-xs font-semibold text-slate-600"
                            style={{ background: 'color-mix(in srgb, var(--surface-color) 74%, var(--app-accent-bg))' }}
                          >
                            Image unavailable
                          </div>
                        </div>
                      )}

                      {attachment.type === 'pdf' && (
                        <div className="w-full h-56 bg-slate-50">
                          <iframe
                            title={attachment.label}
                            src={attachment.url}
                            className="w-full h-full border-0"
                          />
                        </div>
                      )}

                      {attachment.type === 'other' && (
                        <div className="flex items-center gap-2 p-3 bg-slate-50 text-slate-700">
                          <FileText className="h-4 w-4 shrink-0" />
                          <span className="truncate flex-1">File attachment</span>
                        </div>
                      )}

                      <div className="px-3 py-2 text-xs font-medium flex items-center justify-end gap-2" style={{ color: 'var(--body-text-color)' }}>
                        <a
                          href={attachment.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 font-semibold"
                          style={{ color: theme.primary }}
                        >
                          Open <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {noticeList.length > 1 && (
              <div className="pt-4 flex items-center justify-center gap-2">
                {noticeList.map((item, idx) => {
                  const active = idx === currentNoticeIndex;
                  return (
                    <button
                      key={item?.id || idx}
                      onClick={() => setCurrentNoticeIndex(idx)}
                      className="rounded-full transition-all"
                      style={{
                        width: active ? 16 : 6,
                        height: 6,
                        background: active ? theme.primary : 'color-mix(in srgb, var(--body-text-color) 25%, transparent)',
                      }}
                      aria-label={`Go to notice ${idx + 1}`}
                    />
                  );
                })}
              </div>
            )}
          </div>
        )}

        {!loading && !error && !notice && (
          <div className="text-center py-20">
            <div className="bg-white h-20 w-20 rounded-full flex items-center justify-center mx-auto mb-4 border border-slate-200 shadow-sm">
              <FileText className="h-8 w-8 text-slate-300" />
            </div>
            <h3 className="text-gray-800 font-bold">Notice not found</h3>
            <p className="text-gray-500 text-sm mt-1">This notice may no longer be available.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default NoticeDetail;
