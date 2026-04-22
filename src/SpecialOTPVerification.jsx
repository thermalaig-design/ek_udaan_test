import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useBackNavigation } from './hooks';
import { specialLogin } from './services/authService';
import { fetchDirectoryData } from './services/directoryService';
import { persistUserSession } from './utils/storageUtils';
import { useAppTheme } from './context/ThemeContext';

const OTP_FLOW_KEY = 'otp_flow_allowed';
const TRUST_ID = import.meta.env.VITE_DEFAULT_TRUST_ID || 'b353d2ff-ec3b-4b90-a896-69f40662084e';

function SpecialOTPVerification() {
  const navigate = useNavigate();
  const location = useLocation();
  useAppTheme();
  useBackNavigation(() => navigate('/login'));
  const [passcode, setPasscode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [focused, setFocused] = useState(false);

  const user = location.state?.user || null;
  const phoneNumber = location.state?.phoneNumber || '';
  const isSpecialFlowAllowed = sessionStorage.getItem(OTP_FLOW_KEY) === 'special';
  const canRenderSpecialOtp = Boolean(user && phoneNumber && isSpecialFlowAllowed);

  React.useEffect(() => {
    const isLoggedIn = localStorage.getItem('isLoggedIn') === 'true';
    if (isLoggedIn) {
      navigate('/', { replace: true });
      return;
    }
    if (!canRenderSpecialOtp) {
      navigate('/login', { replace: true });
    }
  }, [canRenderSpecialOtp, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const result = await specialLogin(phoneNumber, passcode);
      if (!result.success) {
        setError(result.message || 'Invalid passcode. Please try again.');
        setLoading(false);
        return;
      }
      if (user) {
        const persisted = persistUserSession(user);
        if (!persisted.success) {
          setError(persisted.message || 'Unable to save session on this device. Please try again.');
          setLoading(false);
          return;
        }
        const memberships = Array.isArray(user?.hospital_memberships) ? user.hospital_memberships : [];
        const baseMembership = memberships.find((m) => String(m?.trust_id || '') === String(TRUST_ID));
        const fallbackMembership = baseMembership ||
          memberships.find((m) => m?.is_active && m?.trust_id) ||
          memberships[0] ||
          null;
        const selectedTrustId =
          fallbackMembership?.trust_id ||
          user?.primary_trust?.id ||
          localStorage.getItem('selected_trust_id') ||
          TRUST_ID;
        const selectedTrustName =
          fallbackMembership?.trust_name ||
          user?.primary_trust?.name ||
          localStorage.getItem('selected_trust_name');
        if (selectedTrustId) localStorage.setItem('selected_trust_id', String(selectedTrustId));
        if (selectedTrustName) localStorage.setItem('selected_trust_name', String(selectedTrustName));
        fetchDirectoryData(selectedTrustId || null, selectedTrustName || null).catch(err =>
          console.warn('Failed to pre-load directory data:', err)
        );
        try { sessionStorage.removeItem('trust_selected_in_session'); } catch { /* ignore */ }
        try { sessionStorage.removeItem(OTP_FLOW_KEY); } catch { /* ignore */ }
        navigate('/', { replace: true });
      } else {
        setError('User data not found. Please try again.');
      }
    } catch (error) {
      console.error('❌ Error verifying special login:', error);
      setError('Failed to verify passcode. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {
    try { sessionStorage.removeItem(OTP_FLOW_KEY); } catch { /* ignore */ }
    navigate('/login', { replace: true });
  };

  if (!canRenderSpecialOtp) return null;

  return (
    <div className="brand-page min-h-screen flex items-center justify-center px-4 py-8 relative overflow-hidden" style={{ background: 'var(--page-bg, var(--app-page-bg))' }}>
      <div className="pointer-events-none absolute -top-20 -left-20 w-72 h-72 rounded-full"
        style={{ background: 'radial-gradient(circle, color-mix(in srgb, var(--brand-red, #C0241A) 18%, transparent) 0%, transparent 70%)' }} />
      <div className="pointer-events-none absolute -bottom-24 -right-16 w-80 h-80 rounded-full"
        style={{ background: 'radial-gradient(circle, color-mix(in srgb, var(--brand-navy, #2B2F7E) 14%, transparent) 0%, transparent 70%)' }} />

      <div className="relative w-full max-w-md" style={{ animation: 'fadeUp 0.5s ease-out both' }}>
        <div className="brand-card overflow-hidden">
          <div className="brand-accent-bar" />

          {/* Shield icon header */}
          <div className="flex justify-center mt-6 mb-4">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl"
              style={{ background: 'var(--brand-navy-light, #EAEBF8)' }}>
              🔐
            </div>
          </div>

          <div className="text-center px-6 mb-6">
            <h2 className="text-2xl font-extrabold tracking-tight" style={{ color: 'var(--heading-color, var(--brand-navy, #2B2F7E))' }}>
              Special Login
            </h2>
            <div className="flex items-center justify-center gap-2 mt-2 mb-3">
              <span className="flex-1 h-px" style={{ background: 'linear-gradient(to right, transparent, var(--brand-red, #C0241A))' }} />
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--brand-red, #C0241A)' }} />
              <span className="flex-1 h-px" style={{ background: 'linear-gradient(to left, transparent, var(--brand-red, #C0241A))' }} />
            </div>
            <p className="text-sm font-medium" style={{ color: 'var(--body-text-color, #64748b)' }}>Enter the special passcode for</p>
            <p className="font-bold text-base mt-1" style={{ color: 'var(--subheading-color, var(--brand-navy, #2B2F7E))' }}>+91 {phoneNumber}</p>

            <div className="mt-4 rounded-xl px-4 py-2.5 text-sm font-semibold flex items-center justify-center gap-2"
              style={{ background: 'var(--brand-navy-light, #EAEBF8)', color: 'var(--brand-navy, #2B2F7E)' }}>
              <span>🔧</span> Special Access Enabled
            </div>
          </div>

          <form onSubmit={handleSubmit} className="px-6 pb-6 space-y-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-widest mb-2"
                style={{ color: 'var(--subheading-color, var(--brand-navy, #2B2F7E))' }}>
                Special Passcode
              </label>
              <input
                type="text"
                placeholder="— — — — — —"
                value={passcode}
                onChange={(e) => setPasscode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                maxLength={6}
                required
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                className="w-full px-5 py-4 text-2xl text-center tracking-[0.5em] font-bold rounded-2xl outline-none transition-all"
                style={{
                  border: focused ? '2px solid var(--brand-red, #C0241A)' : '2px solid color-mix(in srgb, var(--brand-navy, #2B2F7E) 16%, #ffffff)',
                  background: focused ? 'color-mix(in srgb, #ffffff 84%, var(--brand-red-light, #FDECEA))' : 'color-mix(in srgb, var(--app-accent-bg, #F8FAFC) 74%, #ffffff)',
                  color: 'var(--body-text-color, #1e293b)',
                  boxShadow: focused ? '0 0 0 4px color-mix(in srgb, var(--brand-red, #C0241A) 12%, transparent)' : 'none',
                }}
              />
            </div>

            {error && (
              <div className="rounded-2xl px-4 py-3 text-sm font-medium flex items-center gap-2"
                style={{ background: 'var(--brand-red-light, #FDECEA)', border: '1.5px solid color-mix(in srgb, var(--brand-red, #C0241A) 26%, transparent)', color: 'var(--brand-red-dark, #9B1A13)' }}>
                <span>⚠️</span><span>{error}</span>
              </div>
            )}

            <div className="flex gap-3 pt-1">
              <button
                type="button"
                onClick={handleBack}
                className="flex-1 py-4 rounded-2xl font-bold text-base transition-all active:scale-[0.98]"
                style={{ background: 'var(--brand-navy-light, #EAEBF8)', color: 'var(--brand-navy, #2B2F7E)' }}
              >
                ← Back
              </button>
              <button
                type="submit"
                disabled={loading || passcode.length !== 6}
                className="flex-[2] py-4 rounded-2xl font-bold text-base text-white transition-all active:scale-[0.98] btn-brand"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full"
                      style={{ animation: 'spin 0.75s linear infinite' }} />
                    Verifying...
                  </span>
                ) : 'Verify Passcode ✓'}
              </button>
            </div>
          </form>

          <div className="border-t pb-5 pt-4 text-center" style={{ borderColor: 'color-mix(in srgb, var(--brand-navy, #2B2F7E) 10%, #ffffff)' }}>
            <p className="text-xs font-medium" style={{ color: 'color-mix(in srgb, var(--body-text-color, #64748b) 70%, #ffffff)' }}>Special access for authorized users only</p>
          </div>
        </div>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

export default SpecialOTPVerification;
