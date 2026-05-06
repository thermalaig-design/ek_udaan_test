import React, { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, FileText, PhoneCall, X } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAppTheme } from './context/ThemeContext';
import { applyOpacity } from './utils/colorUtils';
import { fetchDonationsByTrust, getDonationFormPrefill } from './services/donationService';

const HELP_DESK_NUMBER = '+9136373636';

const DonationForm = () => {
  const theme = useAppTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const [prefill, setPrefill] = useState(() => getDonationFormPrefill());
  const [donations, setDonations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isPopupOpen, setIsPopupOpen] = useState(false);
  const [formData, setFormData] = useState({
    donorName: '',
    mobile: '',
    email: '',
    membershipNumber: '',
    amount: '',
    donationId: '',
  });

  const selectedDonationIdFromRoute = location.state?.selectedDonationId || '';

  const loadDonationForm = async (preferredDonationId = '') => {
    const nextPrefill = getDonationFormPrefill();
    setPrefill(nextPrefill);
    setFormData((prev) => ({
      donorName: prev.donorName || '',
      mobile: prev.mobile || '',
      email: nextPrefill.email || prev.email || '',
      membershipNumber: prev.membershipNumber || '',
      amount: prev.amount || '',
      donationId: prev.donationId || preferredDonationId || '',
    }));

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
      const fallbackDonation = rows.find((item) => item.id === preferredDonationId) || rows[0] || null;
      setFormData((prev) => ({
        ...prev,
        donationId: prev.donationId || fallbackDonation?.id || '',
        amount: prev.amount || (fallbackDonation?.amount ? String(fallbackDonation.amount) : ''),
      }));
    } catch (err) {
      setDonations([]);
      setError(err?.message || 'Unable to load donations.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDonationForm(selectedDonationIdFromRoute);

    const handleTrustChange = () => {
      setIsPopupOpen(false);
      loadDonationForm(selectedDonationIdFromRoute);
    };

    window.addEventListener('trust-changed', handleTrustChange);
    return () => window.removeEventListener('trust-changed', handleTrustChange);
  }, [selectedDonationIdFromRoute]);

  const selectedDonation = useMemo(
    () => donations.find((item) => item.id === formData.donationId) || donations[0] || null,
    [donations, formData.donationId]
  );

  const handleSubmit = (event) => {
    event.preventDefault();
    setIsPopupOpen(true);
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
            onClick={() => navigate('/donation')}
            className="w-10 h-10 rounded-2xl flex items-center justify-center active:scale-95 transition-all"
            style={{ background: `linear-gradient(135deg, ${applyOpacity(theme.accent, 0.65)}, ${theme.accentBg})` }}
          >
            <ChevronLeft className="h-5 w-5" style={{ color: theme.primary }} />
          </button>
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.24em]" style={{ color: theme.primary }}>
              Donate Now
            </p>
            <h1 className="text-lg font-extrabold truncate" style={{ color: 'var(--navbar-text)' }}>
              Donation Form
            </h1>
          </div>
        </div>

        <button
          onClick={() => navigate('/donation')}
          className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0"
          style={{ background: applyOpacity(theme.primary, 0.08), color: theme.primary }}
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="px-5 pt-5">
        <div
          className="rounded-[30px] px-5 py-5"
          style={{
            background: 'var(--surface-color)',
            boxShadow: `0 20px 48px ${applyOpacity('#000', 0.12)}`,
          }}
        >
          {loading ? (
            <div className="rounded-[24px] p-5 text-sm font-semibold" style={{ background: applyOpacity(theme.primary, 0.04) }}>
              Loading donation form...
            </div>
          ) : error ? (
            <div className="rounded-[24px] p-5 text-sm font-semibold" style={{ background: applyOpacity('#ef4444', 0.08), color: '#b91c1c' }}>
              {error}
            </div>
          ) : (
            <form className="space-y-4" onSubmit={handleSubmit}>
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-[0.08em]" style={{ color: theme.primary }}>Donation Entry</label>
                <select
                  value={formData.donationId}
                  onChange={(e) => {
                    const nextId = e.target.value;
                    const nextDonation = donations.find((item) => item.id === nextId);
                    setFormData((prev) => ({
                      ...prev,
                      donationId: nextId,
                      amount: nextDonation?.amount ? String(nextDonation.amount) : prev.amount,
                    }));
                  }}
                  className="w-full rounded-[22px] px-4 py-3.5 outline-none"
                  style={{
                    background: applyOpacity(theme.primary, 0.04),
                    border: `1px solid ${applyOpacity(theme.primary, 0.12)}`,
                    color: 'var(--heading-color)',
                  }}
                >
                  {donations.map((row) => (
                    <option key={row.id} value={row.id}>{row.name}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-[0.08em]" style={{ color: theme.primary }}>Name</label>
                <input
                  value={formData.donorName}
                  onChange={(e) => setFormData((prev) => ({ ...prev, donorName: e.target.value }))}
                  className="w-full rounded-[22px] px-4 py-3.5 outline-none"
                  style={{
                    background: applyOpacity(theme.primary, 0.04),
                    border: `1px solid ${applyOpacity(theme.primary, 0.12)}`,
                    color: 'var(--heading-color)',
                  }}
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-[0.08em]" style={{ color: theme.primary }}>Mobile</label>
                  <input
                    value={formData.mobile}
                    onChange={(e) => setFormData((prev) => ({ ...prev, mobile: e.target.value }))}
                    className="w-full rounded-[22px] px-4 py-3.5 outline-none"
                    style={{
                      background: applyOpacity(theme.primary, 0.04),
                      border: `1px solid ${applyOpacity(theme.primary, 0.12)}`,
                      color: 'var(--heading-color)',
                    }}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-[0.08em]" style={{ color: theme.primary }}>Membership No.</label>
                  <input
                    value={formData.membershipNumber}
                    onChange={(e) => setFormData((prev) => ({ ...prev, membershipNumber: e.target.value }))}
                    className="w-full rounded-[22px] px-4 py-3.5 outline-none"
                    style={{
                      background: applyOpacity(theme.primary, 0.04),
                      border: `1px solid ${applyOpacity(theme.primary, 0.12)}`,
                      color: 'var(--heading-color)',
                    }}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-[0.08em]" style={{ color: theme.primary }}>Email</label>
                <input
                  value={formData.email}
                  onChange={(e) => setFormData((prev) => ({ ...prev, email: e.target.value }))}
                  className="w-full rounded-[22px] px-4 py-3.5 outline-none"
                  style={{
                    background: applyOpacity(theme.primary, 0.04),
                    border: `1px solid ${applyOpacity(theme.primary, 0.12)}`,
                    color: 'var(--heading-color)',
                  }}
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-[0.08em]" style={{ color: theme.primary }}>Amount</label>
                <input
                  value={formData.amount}
                  onChange={(e) => setFormData((prev) => ({ ...prev, amount: e.target.value }))}
                  className="w-full rounded-[22px] px-4 py-3.5 outline-none"
                  style={{
                    background: applyOpacity(theme.primary, 0.04),
                    border: `1px solid ${applyOpacity(theme.primary, 0.12)}`,
                    color: 'var(--heading-color)',
                  }}
                />
              </div>

              <div
                className="rounded-[22px] p-4 text-sm leading-6"
                style={{ background: applyOpacity(theme.primary, 0.06), color: 'var(--body-text-color)' }}
              >
                Selected Trust: <span className="font-extrabold" style={{ color: 'var(--heading-color)' }}>{prefill.trustName}</span>
              </div>

              {selectedDonation ? (
                <div
                  className="rounded-[22px] p-4 text-sm leading-6"
                  style={{ background: applyOpacity(theme.secondary, 0.06), color: 'var(--body-text-color)' }}
                >
                  Selected Donation: <span className="font-extrabold" style={{ color: 'var(--heading-color)' }}>{selectedDonation.name}</span>
                </div>
              ) : null}

              <button
                type="submit"
                className="w-full px-4 py-3.5 rounded-[22px] text-sm font-extrabold active:scale-95 transition-all"
                style={{
                  background: `linear-gradient(135deg, ${applyOpacity(theme.primary, 0.22)} 0%, #ff7a1a 100%)`,
                  color: '#fff',
                  boxShadow: `0 16px 30px ${applyOpacity(theme.primary, 0.18)}`,
                }}
              >
                Submit Donation Request
              </button>
            </form>
          )}
        </div>
      </div>

      {isPopupOpen ? (
        <div className="fixed inset-0 z-[75] px-4 py-6 flex items-center justify-center" style={{ background: 'rgba(15, 23, 42, 0.45)' }}>
          <div
            className="w-full max-w-sm rounded-[28px] p-5 text-center"
            style={{ background: 'var(--surface-color)' }}
          >
            <div className="w-14 h-14 rounded-[20px] flex items-center justify-center mx-auto mb-4" style={{ background: applyOpacity(theme.primary, 0.1) }}>
              <FileText className="h-7 w-7" style={{ color: theme.primary }} />
            </div>
            <h2 className="text-lg font-extrabold mb-2" style={{ color: 'var(--heading-color)' }}>
              Online Donation Coming Soon
            </h2>
            <p className="text-sm leading-6 mb-4" style={{ color: 'var(--body-text-color)' }}>
              Please contact our helpdesk for donation assistance.
            </p>
            <a
              href={`tel:${HELP_DESK_NUMBER}`}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl text-sm font-extrabold"
              style={{ background: applyOpacity(theme.primary, 0.1), color: theme.primary }}
            >
              <PhoneCall className="h-4 w-4" />
              {HELP_DESK_NUMBER}
            </a>
            <button
              onClick={() => setIsPopupOpen(false)}
              className="w-full mt-4 px-4 py-3 rounded-2xl text-sm font-extrabold"
              style={{ background: `linear-gradient(135deg, ${theme.primary}, ${theme.secondary})`, color: '#fff' }}
            >
              Close
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default DonationForm;
