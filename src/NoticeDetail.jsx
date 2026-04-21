import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Calendar, FileText, Home as HomeIcon, Paperclip, Star } from 'lucide-react';
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

const getAttachmentLabel = (attachment, idx) => {
  const value = String(attachment || '').trim();
  if (!value) return `Attachment ${idx + 1}`;
  if (!isLikelyUrl(value)) return value;
  try {
    const url = new URL(value);
    const last = (url.pathname || '').split('/').filter(Boolean).pop();
    return decodeURIComponent(last || `Attachment ${idx + 1}`);
  } catch {
    return `Attachment ${idx + 1}`;
  }
};

const NoticeDetail = ({ onNavigate }) => {
  const theme = useAppTheme();
  const navigate = useNavigate();
  const { noticeId } = useParams();
  const [notice, setNotice] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
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
      } else if (!fromList) {
        setError('Notice not found');
      }
      setLoading(false);
    };

    loadDetail();
  }, [noticeId, selectedTrustId]);

  const handleBack = () => {
    if (window.history.length > 1) navigate(-1);
    else navigate('/notices', { replace: true });
  };

  const isVip = String(notice?.type || '').toLowerCase() === 'vip';
  const dateLabel = formatDateRange(notice?.start_date, notice?.end_date);

  return (
    <div className="bg-slate-50 min-h-screen pb-8">
      <div className="theme-navbar border-b px-6 py-5 flex items-center justify-between sticky top-0 z-40 shadow-sm" style={{ paddingTop: 'max(env(safe-area-inset-top, 0px), 20px)' }}>
        <button
          onClick={handleBack}
          className="p-2 rounded-xl hover:bg-gray-100 transition-colors"
          aria-label="Back to notice board"
        >
          <ArrowLeft className="h-5 w-5 text-gray-700" />
        </button>
        <h1 className="text-lg font-bold text-gray-800">Notice Details</h1>
        <button
          onClick={() => onNavigate('home')}
          className="p-2 rounded-xl hover:bg-gray-100 transition-colors flex items-center justify-center"
          style={{ color: theme.primary }}
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
          <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-center">
            <h3 className="font-bold text-red-800">Unable to load notice</h3>
            <p className="text-sm text-red-600 mt-1">{error}</p>
            <button
              onClick={handleBack}
              className="mt-4 px-4 py-2 rounded-xl text-white text-sm font-semibold"
              style={{ background: theme.primary }}
            >
              Back to Notice Board
            </button>
          </div>
        )}

        {!loading && !error && notice && (
          <div
            className="rounded-2xl border bg-white p-5 shadow-sm border-l-4"
            style={{
              borderLeftColor: isVip ? '#D4AF37' : theme.primary,
              borderColor: isVip ? '#F1E2A4' : '#E2E8F0',
              background: isVip ? 'linear-gradient(180deg, #fffdf6 0%, #ffffff 48%)' : '#ffffff'
            }}
          >
            <div className="flex items-center justify-between gap-3 mb-4">
              <span
                className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full inline-flex items-center gap-1"
                style={
                  isVip
                    ? { color: '#8A6A00', background: '#FDF3C7' }
                    : { color: theme.primary, background: `color-mix(in srgb, ${theme.primary} 12%, white)` }
                }
              >
                {isVip ? <Star className="h-3 w-3" fill="#D4AF37" color="#D4AF37" /> : null}
                {isVip ? 'VIP NOTICE' : 'GEN'}
              </span>
              {dateLabel && (
                <div className="flex items-center gap-1.5 text-slate-500 text-xs font-semibold whitespace-nowrap">
                  <Calendar className="h-3.5 w-3.5" />
                  {dateLabel}
                </div>
              )}
            </div>

            <h2 className="text-xl font-bold text-slate-900 leading-tight">
              {notice.name}
            </h2>

            <p className="mt-4 text-slate-700 text-sm leading-relaxed whitespace-pre-line">
              {notice.description || 'No description provided.'}
            </p>

            {Array.isArray(notice.attachments) && notice.attachments.length > 0 && (
              <div className="mt-6 border-t border-slate-100 pt-5">
                <h3 className="text-sm font-semibold text-slate-800 mb-3">Attachments</h3>
                <div className="space-y-2">
                  {notice.attachments.map((attachment, idx) => (
                    isLikelyUrl(attachment) ? (
                      <a
                        key={`${notice.id}_detail_att_${idx}`}
                        href={attachment}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-full rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 px-3 py-2.5 text-sm font-medium text-slate-700 flex items-center gap-2"
                      >
                        <Paperclip className="h-4 w-4 shrink-0" />
                        <span className="truncate">{getAttachmentLabel(attachment, idx)}</span>
                      </a>
                    ) : (
                      <div key={`${notice.id}_detail_att_${idx}`} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-medium text-slate-700 flex items-center gap-2">
                        <Paperclip className="h-4 w-4 shrink-0" />
                        <span className="truncate">{getAttachmentLabel(attachment, idx)}</span>
                      </div>
                    )
                  ))}
                </div>
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
