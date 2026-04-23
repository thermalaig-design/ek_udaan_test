import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Calendar, ExternalLink, FileText, Home as HomeIcon, Paperclip, Star } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAppTheme } from './context/ThemeContext';
import { getFacilitiesSnapshot, loadFacilityDetail } from './services/facilitiesStore';

const formatTimestamp = (createdAt, updatedAt) => {
  const value = updatedAt || createdAt;
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

const FacilityDetail = ({ onNavigate }) => {
  const theme = useAppTheme();
  const navigate = useNavigate();
  const { facilityId } = useParams();
  const [facility, setFacility] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const selectedTrustId = useMemo(() => localStorage.getItem('selected_trust_id') || '', []);

  useEffect(() => {
    const loadDetail = async () => {
      setError('');
      setLoading(true);
      const trustId = localStorage.getItem('selected_trust_id') || selectedTrustId || '';
      const trustName = localStorage.getItem('selected_trust_name') || null;
      if (!trustId || !facilityId) {
        setFacility(null);
        setLoading(false);
        setError('Facility not found');
        return;
      }

      const snapshot = getFacilitiesSnapshot(trustId);
      const fromList = snapshot?.facilitiesById?.[String(facilityId)] || null;
      if (fromList) setFacility(fromList);

      const detailRes = await loadFacilityDetail({
        trustId,
        trustName,
        facilityId: String(facilityId),
        forceRefresh: false
      });

      if (detailRes?.error) {
        setError(detailRes.error);
      } else if (detailRes?.facility) {
        setFacility(detailRes.facility);
      } else {
        setFacility(null);
        setError('Facility not found');
      }
      setLoading(false);
    };

    loadDetail();
  }, [facilityId, selectedTrustId]);

  const handleBack = () => {
    if (window.history.length > 1) navigate(-1);
    else navigate('/facilities', { replace: true });
  };

  const isVip = String(facility?.type || '').toLowerCase() === 'vip';
  const dateLabel = formatTimestamp(facility?.created_at, facility?.updated_at);
  const attachments = Array.isArray(facility?.attachments) ? facility.attachments : [];
  const normalizedAttachments = attachments
    .map((attachment, idx) => {
      const url = getAttachmentUrl(attachment);
      if (!url || (!isLikelyUrl(url) && !isDataUrl(url))) return null;
      return {
        id: `${facility?.id || 'facility'}_att_${idx}`,
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
          aria-label="Back to facilities"
        >
          <ArrowLeft className="h-5 w-5" style={{ color: 'var(--navbar-text)' }} />
        </button>
        <h1 className="text-lg font-bold" style={{ color: 'var(--navbar-text)' }}>Facility Details</h1>
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
            <h3 className="font-bold" style={{ color: 'var(--brand-red-dark)' }}>Unable to load facility</h3>
            <p className="text-sm mt-1" style={{ color: 'var(--brand-red-dark)' }}>{error}</p>
            <button
              onClick={handleBack}
              className="mt-4 px-4 py-2 rounded-xl text-white text-sm font-semibold"
              style={{ background: 'var(--app-button-bg)', color: 'var(--app-button-text)' }}
            >
              Back to Facilities
            </button>
          </div>
        )}

        {!loading && !error && facility && (
          <div
            className="rounded-2xl border bg-white p-5 shadow-sm border-l-4"
            style={{
              borderLeftColor: isVip ? 'color-mix(in srgb, var(--brand-red) 45%, #d4af37)' : theme.primary,
              borderColor: isVip ? 'color-mix(in srgb, var(--brand-red) 22%, #f1e2a4)' : 'color-mix(in srgb, var(--brand-navy) 10%, transparent)',
              background: isVip ? 'linear-gradient(180deg, color-mix(in srgb, var(--brand-red-light) 50%, #fffdf6) 0%, #ffffff 48%)' : '#ffffff'
            }}
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
                {isVip ? 'VIP Facility' : 'GEN'}
              </span>
              {dateLabel && (
                <div className="flex items-center gap-1.5 text-slate-500 text-xs font-semibold whitespace-nowrap">
                  <Calendar className="h-3.5 w-3.5" />
                  {dateLabel}
                </div>
              )}
            </div>

            <h2 className="text-xl font-bold leading-tight" style={{ color: 'var(--heading-color)' }}>
              {facility.name}
            </h2>

            <p className="mt-4 text-sm leading-relaxed whitespace-pre-line" style={{ color: 'var(--body-text-color)' }}>
              {facility.description || 'No description provided.'}
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
                        <img
                          src={attachment.url}
                          alt={attachment.label}
                          loading="lazy"
                          className="w-full h-44 object-cover bg-slate-100"
                        />
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
                          <span className="truncate flex-1">{attachment.label}</span>
                        </div>
                      )}

                      <div className="px-3 py-2 text-xs font-medium flex items-center justify-between gap-2" style={{ color: 'var(--body-text-color)' }}>
                        <span className="truncate">{attachment.label}</span>
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
          </div>
        )}

        {!loading && !error && !facility && (
          <div className="text-center py-20">
            <div className="bg-white h-20 w-20 rounded-full flex items-center justify-center mx-auto mb-4 border border-slate-200 shadow-sm">
              <FileText className="h-8 w-8 text-slate-300" />
            </div>
            <h3 className="text-gray-800 font-bold">Facility not found</h3>
            <p className="text-gray-500 text-sm mt-1">This facility may no longer be available for your access.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default FacilityDetail;
