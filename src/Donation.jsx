import React, { useEffect, useMemo, useState } from 'react';
import { Home as HomeIcon, IndianRupee, Menu, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAppTheme } from './context/ThemeContext';
import { applyOpacity } from './utils/colorUtils';
import { fetchDonationsByTrust, getDonationFormPrefill } from './services/donationService';
import { TRUST_VERSION_UPDATED_EVENT } from './services/trustVersionService';
import Sidebar from './components/Sidebar';

const DONATION_CACHE_KEY_PREFIX = 'donation_cache_v1';

const getDonationCacheKey = (trustId) => `${DONATION_CACHE_KEY_PREFIX}:${String(trustId || '').trim()}`;

const sortDonationsNewestFirst = (rows = []) => (
  [...rows].sort((a, b) => {
    const aTs = new Date(a?.updated_at || a?.created_at || 0).getTime();
    const bTs = new Date(b?.updated_at || b?.created_at || 0).getTime();
    return bTs - aTs;
  })
);

const readDonationCache = (trustId) => {
  try {
    const key = getDonationCacheKey(trustId);
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed?.rows)) return [];
    return sortDonationsNewestFirst(parsed.rows);
  } catch {
    return [];
  }
};

const writeDonationCache = (trustId, rows) => {
  try {
    const key = getDonationCacheKey(trustId);
    localStorage.setItem(key, JSON.stringify({
      updatedAt: new Date().toISOString(),
      rows: Array.isArray(rows) ? rows : [],
    }));
  } catch {
    // ignore cache write failures
  }
};

const formatCurrency = (amount) => {
  const numeric = Number(amount);
  if (!Number.isFinite(numeric)) return null;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(numeric);
};

const formatDate = (value) => {
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

const normalizeAttachment = (value) => {
  const url = String(value || '').trim();
  return /^https?:\/\//i.test(url) ? url : '';
};

const normalizeAttachments = (attachments) => {
  if (Array.isArray(attachments)) {
    return attachments.map(normalizeAttachment).filter(Boolean);
  }
  if (typeof attachments === 'string') {
    const value = attachments.trim();
    if (!value) return [];
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return parsed.map(normalizeAttachment).filter(Boolean);
      }
      if (parsed && typeof parsed === 'object') {
        const candidate = normalizeAttachment(parsed.url || parsed.public_url || parsed.path);
        return candidate ? [candidate] : [];
      }
    } catch {
      // not JSON, continue fallback
    }
    return value
      .split(',')
      .map((item) => normalizeAttachment(item))
      .filter(Boolean);
  }
  if (attachments && typeof attachments === 'object') {
    const candidate = normalizeAttachment(attachments.url || attachments.public_url || attachments.path);
    return candidate ? [candidate] : [];
  }
  return [];
};

const getOptimizedImageUrl = (url, width = 900) => {
  const source = String(url || '').trim();
  if (!source) return '';
  try {
    const parsed = new URL(source);
    const host = parsed.hostname.toLowerCase();

    // Supabase storage transform endpoint support
    if (host.includes('supabase')) {
      const marker = '/storage/v1/object/public/';
      if (parsed.pathname.includes(marker)) {
        parsed.pathname = parsed.pathname.replace(marker, '/storage/v1/render/image/public/');
      }
      if (!parsed.searchParams.has('width')) parsed.searchParams.set('width', String(width));
      if (!parsed.searchParams.has('quality')) parsed.searchParams.set('quality', '72');
      if (!parsed.searchParams.has('resize')) parsed.searchParams.set('resize', 'cover');
      return parsed.toString();
    }

    // Common CDN params for better mobile payloads
    if (host.includes('cloudinary.com') || host.includes('res.cloudinary.com')) {
      parsed.searchParams.set('w', String(width));
      parsed.searchParams.set('q', 'auto');
      parsed.searchParams.set('f', 'auto');
      return parsed.toString();
    }
  } catch {
    return source;
  }
  return source;
};

const Donation = ({ onNavigate }) => {
  const theme = useAppTheme();
  const navigate = useNavigate();
  const [prefill, setPrefill] = useState(() => getDonationFormPrefill());
  const [donations, setDonations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const loadDonationScreen = async () => {
    const nextPrefill = getDonationFormPrefill();
    setPrefill(nextPrefill);

    if (!nextPrefill.trustId) {
      setDonations([]);
      setError('Selected trust not found.');
      setLoading(false);
      return;
    }

    setError('');
    const cachedRows = readDonationCache(nextPrefill.trustId);
    if (cachedRows.length > 0) {
      setDonations(cachedRows);
      setLoading(false);
    } else {
      setLoading(true);
    }

    try {
      const rows = await fetchDonationsByTrust(nextPrefill.trustId);
      const sortedRows = sortDonationsNewestFirst(rows);
      setDonations(sortedRows);
      writeDonationCache(nextPrefill.trustId, sortedRows);
    } catch (err) {
      if (cachedRows.length === 0) {
        setDonations([]);
      }
      setError(err?.message || 'Unable to load donations.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDonationScreen();

    const handleTrustChange = () => {
      loadDonationScreen();
    };

    const handleTrustVersionUpdated = (event) => {
      const changedTrustId = String(event?.detail?.trustId || '').trim();
      const selectedTrustId = String(localStorage.getItem('selected_trust_id') || '').trim();
      if (!changedTrustId || changedTrustId !== selectedTrustId) return;
      loadDonationScreen();
    };

    window.addEventListener('trust-changed', handleTrustChange);
    window.addEventListener(TRUST_VERSION_UPDATED_EVENT, handleTrustVersionUpdated);
    return () => {
      window.removeEventListener('trust-changed', handleTrustChange);
      window.removeEventListener(TRUST_VERSION_UPDATED_EVENT, handleTrustVersionUpdated);
    };
  }, []);

  const donationSummary = (row) => {
    const amountLabel = formatCurrency(row?.amount);
    const amountType = String(row?.amount_type || '').trim();
    if (amountLabel && amountType) return `${amountLabel} • ${amountType}`;
    if (amountLabel) return amountLabel;
    if (amountType) return amountType;
    return 'Open contribution';
  };

  const selectedDonation = useMemo(() => donations[0] || null, [donations]);

  const openDonationFormPage = (donation = null) => {
    const target = donation || selectedDonation || null;
    navigate('/donation-form', {
      state: {
        selectedDonationId: target?.id || '',
      },
    });
  };

  return (
    <div
      className="min-h-screen pb-8"
      style={{
        background: 'var(--page-bg, var(--app-page-bg))',
        color: 'var(--body-text-color)',
      }}
    >
      {/* ── Navbar ── */}
      <div
        className="theme-navbar border-b px-6 py-5 flex items-center justify-between sticky top-0 z-40 shadow-sm"
        style={{ paddingTop: 'max(env(safe-area-inset-top, 0px), 20px)' }}
      >
        <button
          onClick={() => setIsMenuOpen(!isMenuOpen)}
          className="w-10 h-10 rounded-2xl flex items-center justify-center active:scale-95 transition-all"
          style={{ background: 'color-mix(in srgb, var(--navbar-bg) 72%, var(--surface-color))' }}
        >
          {isMenuOpen
            ? <X className="h-[22px] w-[22px]" style={{ color: 'var(--navbar-text)' }} />
            : <Menu className="h-[22px] w-[22px]" style={{ color: 'var(--navbar-text)' }} />}
        </button>

        <h1 className="text-lg font-extrabold" style={{ color: 'var(--navbar-text)' }}>
          Donation
        </h1>

        <button
          onClick={() => onNavigate?.('home')}
          className="w-10 h-10 rounded-2xl flex items-center justify-center active:scale-95 transition-all"
          style={{ background: 'color-mix(in srgb, var(--navbar-bg) 72%, var(--surface-color))' }}
        >
          <HomeIcon className="h-[22px] w-[22px]" style={{ color: 'var(--navbar-text)' }} />
        </button>
      </div>

      {isMenuOpen && (
        <div
          className="fixed inset-0 z-25"
          style={{ background: applyOpacity('var(--brand-navy-dark)', 0.12) }}
          onClick={() => setIsMenuOpen(false)}
        />
      )}
      <Sidebar isOpen={isMenuOpen} onClose={() => setIsMenuOpen(false)} onNavigate={onNavigate} currentPage="donation" />

      <div className="px-5 pt-5 space-y-5">
        {/* ── Banner ── */}
        <section
          className="rounded-[22px] p-4"
          style={{
            background: `linear-gradient(145deg, ${applyOpacity(theme.secondary, 0.2)} 0%, ${applyOpacity(theme.primary, 0.16)} 100%)`,
            border: `1px solid ${applyOpacity(theme.primary, 0.24)}`,
            boxShadow: `0 14px 28px ${applyOpacity(theme.secondary, 0.14)}`,
          }}
        >
          <p className="text-xs font-semibold mb-2" style={{ color: 'var(--heading-color)' }}>
            Every contribution makes a real difference for our community.
          </p>
          <button
            onClick={() => openDonationFormPage()}
            className="w-full px-4 py-3 rounded-2xl text-sm font-extrabold active:scale-95 transition-all"
            style={{
              background: `linear-gradient(135deg, ${applyOpacity(theme.primary, 0.96)} 0%, ${applyOpacity(theme.secondary, 0.92)} 100%)`,
              color: '#fff',
              boxShadow: `0 12px 24px ${applyOpacity(theme.primary, 0.3)}`,
            }}
          >
            Donate Now, Spread Hope
          </button>
        </section>

        {/* ── Donation List ── */}
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.18em]" style={{ color: theme.primary }}>
                Donation Options
              </p>
              <h2 className="text-lg font-extrabold" style={{ color: 'var(--heading-color)' }}>
                Active Donations
              </h2>
            </div>
            <span
              className="px-3 py-1.5 rounded-full text-xs font-bold"
              style={{ background: applyOpacity(theme.primary, 0.1), color: theme.primary }}
            >
              {donations.length} items
            </span>
          </div>

          {loading ? (
            <div className="rounded-[24px] p-5 text-sm font-semibold" style={{ background: 'color-mix(in srgb, var(--surface-color) 90%, var(--app-page-bg))' }}>
              Loading donations...
            </div>
          ) : error ? (
            <div className="rounded-[24px] p-5 text-sm font-semibold" style={{ background: applyOpacity('#ef4444', 0.08), color: '#b91c1c' }}>
              {error}
            </div>
          ) : donations.length === 0 ? (
            <div className="rounded-[24px] p-5 text-sm font-semibold" style={{ background: 'color-mix(in srgb, var(--surface-color) 90%, var(--app-page-bg))' }}>
              No donations found for this trust.
            </div>
          ) : (
            donations.map((row, index) => {
              const isVip = String(row?.type || '').trim().toLowerCase() === 'vip';
              const attachmentPreview = normalizeAttachments(row?.attachments).slice(0, 1);
              const heroImageUrl = attachmentPreview[0] ? getOptimizedImageUrl(attachmentPreview[0]) : '';
              const shouldPrioritizeImage = index < 2;

              return (
                <div
                  key={row.id}
                  className="rounded-[22px] overflow-hidden transition-all active:scale-[0.985] cursor-pointer"
                  role="button"
                  tabIndex={0}
                  onClick={() => openDonationFormPage(row)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      openDonationFormPage(row);
                    }
                  }}
                  style={{
                    background: 'var(--surface-color)',
                    border: `1.5px solid ${isVip ? '#E0A11B' : applyOpacity(theme.primary, 0.16)}`,
                    boxShadow: `0 8px 24px ${applyOpacity(theme.secondary, 0.10)}`,
                  }}
                >
                  {/* Image Hero — top, full width */}
                  {attachmentPreview.length > 0 && (
                    <div
                      className="relative w-full h-[220px] overflow-hidden"
                      style={{
                        background: isVip
                          ? 'linear-gradient(160deg, #fff8e1 0%, #fff3cd 100%)'
                          : `color-mix(in srgb, ${theme.primary} 5%, var(--surface-color))`,
                        borderBottom: `2px solid ${isVip ? '#F5B700' : theme.primary}`,
                      }}
                    >
                      <img
                        src={heroImageUrl || attachmentPreview[0]}
                        alt={row.name}
                        loading={shouldPrioritizeImage ? 'eager' : 'lazy'}
                        fetchPriority={shouldPrioritizeImage ? 'high' : 'auto'}
                        decoding="async"
                        onError={(e) => { e.currentTarget.parentElement.style.display = 'none'; }}
                        style={{
                          width: '100%',
                          height: '100%',
                          objectFit: 'cover',
                          display: 'block',
                          background: `linear-gradient(120deg, ${applyOpacity(theme.secondary, 0.16)} 0%, ${applyOpacity(theme.primary, 0.12)} 100%)`,
                        }}
                      />
                      {/* Badge overlaid on image */}
                      <span
                        className="absolute top-2.5 right-2.5 px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-[0.1em] backdrop-blur-sm"
                        style={{
                          color: isVip ? '#7A4F00' : '#fff',
                          background: isVip ? 'rgba(255,227,100,0.92)' : `${theme.primary}dd`,
                          border: isVip ? '1px solid #E0A11B' : '1px solid rgba(255,255,255,0.25)',
                          boxShadow: '0 2px 8px rgba(0,0,0,0.18)',
                        }}
                      >
                        {isVip ? '★ VIP' : (row.type || 'General')}
                      </span>
                    </div>
                  )}

                  {/* Card Content */}
                  <div className="p-4">
                    {/* Title + badge (only when no image) */}
                    <div className="flex items-start justify-between gap-3 mb-1">
                      <h3 className="text-[15px] font-extrabold leading-snug flex-1" style={{ color: 'var(--heading-color)' }}>
                        {row.name}
                      </h3>
                      {attachmentPreview.length === 0 && (
                        <span
                          className="px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-[0.1em] shrink-0"
                          style={{
                            color: isVip ? '#8A5A00' : theme.primary,
                            background: isVip ? 'linear-gradient(135deg, #FFE7A3 0%, #FFD36A 100%)' : applyOpacity(theme.primary, 0.1),
                            border: `1px solid ${isVip ? '#E0A11B' : applyOpacity(theme.primary, 0.18)}`,
                          }}
                        >
                          {isVip ? '★ VIP' : (row.type || 'General')}
                        </span>
                      )}
                    </div>

                    <p className="text-xs leading-5 mb-3" style={{ color: 'var(--body-text-color)' }}>
                      {row.description || 'Donation support entry'}
                    </p>

                    <div style={{ height: '1px', background: 'color-mix(in srgb, var(--brand-navy) 8%, transparent)', marginBottom: '12px' }} />

                    {/* Footer */}
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex flex-col gap-0.5">
                        <div className="flex items-center gap-1.5">
                          <IndianRupee style={{ width: 14, height: 14, color: theme.primary, flexShrink: 0 }} />
                          <span className="text-sm font-extrabold" style={{ color: 'var(--heading-color)' }}>
                            {donationSummary(row)}
                          </span>
                        </div>
                        <span className="text-[10px] font-semibold" style={{ color: 'color-mix(in srgb, var(--body-text-color) 65%, var(--surface-color))' }}>
                          {formatDate(row.updated_at || row.created_at)}
                        </span>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          openDonationFormPage(row);
                        }}
                        className="px-5 py-2.5 rounded-2xl text-xs font-extrabold active:scale-95 transition-all"
                        style={{
                          background: isVip
                            ? 'linear-gradient(135deg, #F5B700 0%, #E0A11B 100%)'
                            : `linear-gradient(135deg, ${theme.primary} 0%, ${theme.secondary} 100%)`,
                          color: isVip ? '#5A3A00' : '#fff',
                          boxShadow: `0 6px 16px ${applyOpacity(theme.primary, 0.28)}`,
                        }}
                      >
                        Donate Now
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </section>
      </div>
    </div>
  );
};

export default Donation;
