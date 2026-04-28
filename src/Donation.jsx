import React, { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, Crown, HandHeart, IndianRupee, ShieldCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAppTheme } from './context/ThemeContext';
import { applyOpacity } from './utils/colorUtils';
import { fetchDonationsByTrust, getDonationFormPrefill } from './services/donationService';

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

const Donation = ({ onNavigate }) => {
  const theme = useAppTheme();
  const navigate = useNavigate();
  const [prefill, setPrefill] = useState(() => getDonationFormPrefill());
  const [donations, setDonations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadDonationScreen = async () => {
    const nextPrefill = getDonationFormPrefill();
    setPrefill(nextPrefill);

    if (!nextPrefill.trustId) {
      setDonations([]);
      setError('Selected trust not found.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');
    try {
      const rows = await fetchDonationsByTrust(nextPrefill.trustId);
      setDonations(rows);
    } catch (err) {
      setDonations([]);
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

    window.addEventListener('trust-changed', handleTrustChange);
    return () => window.removeEventListener('trust-changed', handleTrustChange);
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
      <div
        className="theme-navbar border-b px-6 py-5 flex items-center justify-between sticky top-0 z-40 shadow-sm"
        style={{ paddingTop: 'max(env(safe-area-inset-top, 0px), 20px)' }}
      >
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={() => onNavigate?.('home')}
            className="w-10 h-10 rounded-2xl flex items-center justify-center active:scale-95 transition-all"
            style={{ background: `linear-gradient(135deg, ${applyOpacity(theme.accent, 0.65)}, ${theme.accentBg})` }}
          >
            <ChevronLeft className="h-5 w-5" style={{ color: theme.primary }} />
          </button>
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.24em]" style={{ color: theme.primary }}>
              Donation
            </p>
            <h1 className="text-lg font-extrabold truncate" style={{ color: 'var(--navbar-text)' }}>
              {prefill.trustName}
            </h1>
          </div>
        </div>

        <button
          onClick={() => openDonationFormPage()}
          className="px-4 py-2.5 rounded-2xl text-sm font-extrabold active:scale-95 transition-all"
          style={{
            background: `linear-gradient(135deg, ${theme.primary}, ${theme.secondary})`,
            color: '#fff',
            boxShadow: `0 12px 24px ${applyOpacity(theme.primary, 0.22)}`,
          }}
        >
          Donate Now
        </button>
      </div>

      <div className="px-5 pt-5 space-y-5">
        <section
          className="rounded-[28px] p-5"
          style={{
            background: `linear-gradient(135deg, ${applyOpacity(theme.primary, 0.12)}, ${applyOpacity(theme.accentBg, 0.96)})`,
            border: `1px solid ${applyOpacity(theme.primary, 0.12)}`,
            boxShadow: `0 16px 36px ${applyOpacity(theme.secondary, 0.1)}`,
          }}
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-4" style={{ background: applyOpacity(theme.primary, 0.12) }}>
                <HandHeart className="h-6 w-6" style={{ color: theme.primary }} />
              </div>
              <h2 className="text-xl font-extrabold mb-2" style={{ color: 'var(--heading-color)' }}>
                Donate to {prefill.trustName}
              </h2>
           
            </div>
            <div className="rounded-2xl px-3 py-2 text-right" style={{ background: applyOpacity(theme.primary, 0.08) }}>
              <p className="text-[11px] font-bold uppercase tracking-[0.18em]" style={{ color: theme.primary }}>
                Member
              </p>
              <p className="text-sm font-extrabold" style={{ color: 'var(--heading-color)' }}>
                {prefill.donorName || 'Supporter'}
              </p>
            </div>
          </div>
        </section>

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
            donations.map((row) => {
              const isVip = String(row?.type || '').trim().toLowerCase() === 'vip';
              const attachmentPreview = Array.isArray(row?.attachments)
                ? row.attachments.map(normalizeAttachment).filter(Boolean).slice(0, 1)
                : [];

              return (
                <div
                  key={row.id}
                  className="rounded-[26px] overflow-hidden"
                  style={{
                    background: 'color-mix(in srgb, var(--surface-color) 90%, var(--app-page-bg))',
                    border: `1px solid ${isVip ? '#E0A11B' : applyOpacity(theme.primary, 0.08)}`,
                    boxShadow: `0 12px 28px ${applyOpacity(theme.secondary, 0.08)}`,
                  }}
                >
                  <div style={{ height: '4px', background: isVip ? 'linear-gradient(90deg, #FFE7A3 0%, #F5B700 100%)' : `linear-gradient(90deg, ${theme.primary} 0%, ${theme.secondary} 100%)` }} />
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="text-base font-extrabold" style={{ color: 'var(--heading-color)' }}>
                          {row.name}
                        </h3>
                        <p className="text-xs mt-1 leading-5" style={{ color: 'var(--body-text-color)' }}>
                          {row.description || 'Donation support entry'}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <span
                          className="px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-[0.12em]"
                          style={{
                            color: isVip ? '#8A5A00' : theme.primary,
                            background: isVip ? 'linear-gradient(135deg, #FFE7A3 0%, #FFD36A 52%, #F5B700 100%)' : applyOpacity(theme.primary, 0.1),
                            border: `1px solid ${isVip ? '#E0A11B' : applyOpacity(theme.primary, 0.15)}`,
                          }}
                        >
                          {isVip ? 'VIP' : (row.type || 'General')}
                        </span>
                        <span className="text-[11px] font-bold" style={{ color: theme.primary }}>
                          {formatDate(row.updated_at || row.created_at)}
                        </span>
                      </div>
                    </div>

                    {attachmentPreview.length > 0 ? (
                      <img
                        src={attachmentPreview[0]}
                        alt={row.name}
                        className="w-full h-40 object-cover rounded-[20px] mt-3"
                      />
                    ) : null}

                    <div className="flex items-center justify-between gap-3 mt-4">
                      <div className="flex items-center gap-2 min-w-0">
                        <IndianRupee className="h-4 w-4 flex-shrink-0" style={{ color: theme.primary }} />
                        <p className="text-sm font-bold truncate" style={{ color: 'var(--heading-color)' }}>
                          {donationSummary(row)}
                        </p>
                      </div>
                      <button
                        onClick={() => openDonationFormPage(row)}
                        className="px-4 py-2 rounded-2xl text-xs font-extrabold active:scale-95 transition-all"
                        style={{
                          background: applyOpacity(theme.primary, 0.1),
                          color: theme.primary,
                        }}
                      >
                        Select
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </section>

        <section className="space-y-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.18em]" style={{ color: theme.primary }}>
              Our Donators
            </p>
            <h2 className="text-lg font-extrabold" style={{ color: 'var(--heading-color)' }}>
              Supporter List
            </h2>
          </div>

          {donations.length === 0 ? (
            <div className="rounded-[24px] p-5 text-sm font-semibold" style={{ background: 'color-mix(in srgb, var(--surface-color) 90%, var(--app-page-bg))' }}>
              No supporter entries are available yet.
            </div>
          ) : (
            donations.map((row) => {
              const isVip = String(row?.type || '').trim().toLowerCase() === 'vip';
              return (
                <div
                  key={`${row.id}-supporter`}
                  className="rounded-[24px] p-4"
                  style={{
                    background: 'color-mix(in srgb, var(--surface-color) 90%, var(--app-page-bg))',
                    border: `1px solid ${isVip ? '#E0A11B' : applyOpacity(theme.primary, 0.08)}`,
                  }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <div
                        className="w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0"
                        style={{ background: isVip ? 'linear-gradient(135deg, #FFE7A3 0%, #F5B700 100%)' : applyOpacity(theme.primary, 0.1) }}
                      >
                        {isVip ? <Crown className="h-5 w-5" style={{ color: '#8A5A00' }} /> : <ShieldCheck className="h-5 w-5" style={{ color: theme.primary }} />}
                      </div>
                      <div className="min-w-0">
                        <h3 className="text-sm font-extrabold truncate" style={{ color: 'var(--heading-color)' }}>
                          {row.name}
                        </h3>
                        <p className="text-xs mt-1 leading-5" style={{ color: 'var(--body-text-color)' }}>
                          {row.description || 'Donation supporter entry'}
                        </p>
                        <div className="flex flex-wrap gap-2 mt-2">
                          <span className="px-2.5 py-1 rounded-full text-[10px] font-bold" style={{ background: applyOpacity(theme.primary, 0.08), color: theme.primary }}>
                            {donationSummary(row)}
                          </span>
                          <span className="px-2.5 py-1 rounded-full text-[10px] font-bold" style={{ background: applyOpacity(theme.secondary, 0.08), color: theme.secondary }}>
                            {formatDate(row.created_at)}
                          </span>
                        </div>
                      </div>
                    </div>

                    <span
                      className="px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-[0.12em] flex-shrink-0"
                      style={{
                        color: isVip ? '#8A5A00' : theme.primary,
                        background: isVip ? 'linear-gradient(135deg, #FFE7A3 0%, #FFD36A 52%, #F5B700 100%)' : applyOpacity(theme.primary, 0.1),
                        border: `1px solid ${isVip ? '#E0A11B' : applyOpacity(theme.primary, 0.15)}`,
                      }}
                    >
                      {isVip ? 'VIP' : 'General'}
                    </span>
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
