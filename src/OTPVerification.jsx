import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useBackNavigation } from './hooks';
import { verifyOTP } from './services/authService';
import { fetchDirectoryData } from './services/directoryService';
import { fetchTrustById } from './services/trustService';
import { persistUserSession } from './utils/storageUtils';
import { useAppTheme } from './context/ThemeContext';

// ─── Constants ────────────────────────────────────────────────────────────────
const TRUST_ID = import.meta.env.VITE_DEFAULT_TRUST_ID || '';
// Separate cache key for Login/OTP screens — never polluted by Home page trust switching
const LOGIN_TRUST_CACHE_KEY = 'cached_base_trust_info';
const TRUST_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
// No static fallback image — show monogram placeholder instead of Mah-Setu logo
const OTP_FLOW_KEY = 'otp_flow_allowed';

const resolveAuthDefaultTrust = () => {
  const defaultName = import.meta.env.VITE_DEFAULT_TRUST_NAME || 'Mahila Mandal';
  try {
    const cachedDefault = localStorage.getItem('default_trust_cache');
    if (cachedDefault) {
      const parsed = JSON.parse(cachedDefault);
      const id = parsed?.id ? String(parsed.id).trim() : '';
      const name = parsed?.name ? String(parsed.name).trim() : '';
      if (id) return { id, name: name || defaultName };
    }
  } catch {
    // ignore malformed cache
  }

  const selectedId = String(localStorage.getItem('selected_trust_id') || '').trim();
  const selectedName = String(localStorage.getItem('selected_trust_name') || '').trim();
  if (selectedId) return { id: selectedId, name: selectedName || defaultName };

  if (TRUST_ID) return { id: TRUST_ID, name: defaultName };
  return { id: '', name: defaultName };
};

// ─── Cache helpers ─────────────────────────────────────────────────────────────
const getCachedBaseTrust = (expectedTrustId) => {
  if (!expectedTrustId) return null;
  try {
    const raw = localStorage.getItem(LOGIN_TRUST_CACHE_KEY);
    if (!raw) return null;
    const { data, ts, trustId } = JSON.parse(raw);
    // Reject stale or wrong-trust cache
    if (trustId && trustId !== expectedTrustId) {
      localStorage.removeItem(LOGIN_TRUST_CACHE_KEY);
      return null;
    }
    if (Date.now() - ts > TRUST_CACHE_TTL_MS) {
      localStorage.removeItem(LOGIN_TRUST_CACHE_KEY);
      return null;
    }
    return data;
  } catch {
    return null;
  }
};

const setCachedBaseTrust = (trust, trustId) => {
  if (!trustId) return;
  try {
    localStorage.setItem(
      LOGIN_TRUST_CACHE_KEY,
      JSON.stringify({ data: trust, ts: Date.now(), trustId })
    );
  } catch { /* ignore */ }
};

// ─── Component ─────────────────────────────────────────────────────────────────
function OTPVerification() {
  const navigate = useNavigate();
  const location = useLocation();
  useBackNavigation(() => navigate('/login'));
  const theme = useAppTheme();
  const authDefaultTrust = resolveAuthDefaultTrust();

  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [focused, setFocused] = useState(false);

  // Serve from BASE-trust-specific cache instantly — no wrong logo flash
  const [trustInfo, setTrustInfo] = useState(() => getCachedBaseTrust(authDefaultTrust.id) || null);

  const user = location.state?.user || null;
  const accountCandidates = Array.isArray(location.state?.accounts) && location.state.accounts.length > 0
    ? location.state.accounts
    : (user ? [user] : []);
  const [otpVerified, setOtpVerified] = useState(false);
  const [selectedAccountId, setSelectedAccountId] = useState(
    accountCandidates[0]?.members_id || accountCandidates[0]?.id || ''
  );
  const phoneNumber = location.state?.phoneNumber || '';
  const isOtpFlowAllowed = sessionStorage.getItem(OTP_FLOW_KEY) === 'normal';
  const canRenderOtpPage = Boolean(user && phoneNumber && isOtpFlowAllowed);

  useEffect(() => {
    const isLoggedIn = localStorage.getItem('isLoggedIn') === 'true';
    if (isLoggedIn) {
      navigate('/', { replace: true });
      return;
    }
    if (!canRenderOtpPage) {
      navigate('/login', { replace: true });
    }
  }, [canRenderOtpPage, navigate]);

  // Clear old shared cache key that may have another trust's logo data
  useEffect(() => {
    try { localStorage.removeItem('cached_trust_info'); } catch { /* ignore */ }
  }, []);

  // Always refresh from BASE trust ID — not from whatever selected_trust_id says
  useEffect(() => {
    let active = true;

    const refresh = async () => {
      try {
        if (!authDefaultTrust.id) return;
        const trust = await fetchTrustById(authDefaultTrust.id);
        if (!active || !trust) return;
        setTrustInfo(trust);
        setCachedBaseTrust(trust, authDefaultTrust.id);
      } catch (err) {
        console.warn('[OTP] Trust refresh failed:', err?.message || err);
      }
    };

    refresh();
    return () => { active = false; };
  }, [authDefaultTrust.id]);

  const resolveSelectedAccount = () => {
    if (!accountCandidates.length) return null;
    const selectedId = String(selectedAccountId || '');
    if (!selectedId) return accountCandidates[0];
    return accountCandidates.find((account) => {
      const accountId = String(account?.members_id || account?.id || '');
      return accountId === selectedId;
    }) || accountCandidates[0];
  };

  const completeLogin = (selectedUser) => {
    const persisted = persistUserSession(selectedUser);
    if (!persisted.success) {
      setError(persisted.message || 'Unable to save session on this device. Please try again.');
      return false;
    }

    const selectedTrustId = authDefaultTrust.id || TRUST_ID;
    const selectedTrustName = trustInfo?.name || localStorage.getItem('selected_trust_name') || '';
    localStorage.setItem('selected_trust_id', String(selectedTrustId));
    if (selectedTrustName) localStorage.setItem('selected_trust_name', String(selectedTrustName));

    fetchDirectoryData(selectedTrustId, selectedTrustName).catch(err =>
      console.warn('[OTP] Directory pre-fetch failed:', err)
    );

    try { sessionStorage.removeItem('trust_selected_in_session'); } catch { /* ignore */ }
    try { sessionStorage.removeItem(OTP_FLOW_KEY); } catch { /* ignore */ }

    navigate('/', { replace: true });
    return true;
  };

  // ─── OTP Submit ─────────────────────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      if (otpVerified) {
        const selectedUser = resolveSelectedAccount();
        if (!selectedUser) {
          setError('Please select an account to continue.');
          setLoading(false);
          return;
        }
        completeLogin(selectedUser);
        setLoading(false);
        return;
      }

      const result = await verifyOTP(phoneNumber, otp);
      if (!result.success) {
        setError(result.message || 'Invalid OTP. Please try again.');
        setLoading(false);
        return;
      }

      if (!user) {
        setError('User data not found. Please go back and try again.');
        setLoading(false);
        return;
      }

      if (accountCandidates.length > 1) {
        setOtpVerified(true);
        const nextId = accountCandidates[0]?.members_id || accountCandidates[0]?.id || '';
        setSelectedAccountId(nextId);
        setLoading(false);
        return;
      }

      completeLogin(accountCandidates[0] || user);
    } catch (err) {
      console.error('[OTP] Verify error:', err);
      setError('Failed to verify OTP. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {
    if (otpVerified) {
      setOtpVerified(false);
      setError('');
      return;
    }
    try { sessionStorage.removeItem(OTP_FLOW_KEY); } catch { /* ignore */ }
    navigate('/login', { replace: true });
  };

  // ─── Derived values ─────────────────────────────────────────────────────────────────────
  // Only show logo when Supabase returns a real icon_url — no fallback to Mah-Setu image
  const displayLogo = trustInfo?.icon_url || null;
  const displayName = trustInfo?.name || 'Mahila Mandal';

  if (!canRenderOtpPage) return null;

  // ─── Render ──────────────────────────────────────────────────────────────────
  return (
    <div style={{ ...styles.page, color: theme?.themeConfig?.typography?.body_text_color || 'var(--body-text-color)' }}>
      {/* Ambient blobs */}
      <div style={styles.blobTL} />
      <div style={styles.blobBR} />

      <div style={styles.wrapper}>
        <div style={styles.card}>

          {/* Top accent bar */}
          <div style={styles.topBar} />

          {/* Logo — shows Supabase icon_url; monogram placeholder while loading */}
          <div style={styles.logoWrap}>
            <div style={styles.logoRing}>
              {displayLogo ? (
                <img
                  src={displayLogo}
                  alt={displayName || 'Trust Logo'}
                  style={styles.logoImg}
                  loading="eager"
                  onError={(e) => {
                    // Hide broken image; do not fall back to Mah-Setu logo
                    e.currentTarget.style.display = 'none';
                  }}
                />
              ) : (
                <div style={styles.logoMonogram}>
                  {(displayName || 'EU').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
                </div>
              )}
            </div>
          </div>

          {/* Header */}
          <div style={styles.headerWrap}>
            <h1 style={styles.heading}>{otpVerified ? 'Select Account' : 'Verify OTP'}</h1>
            <div style={styles.divider}>
              <span style={styles.divLine} />
              <span style={styles.divDot} />
              <span style={styles.divLine} />
            </div>
            <p style={styles.subtext}>
              {otpVerified ? 'Choose the account you want to continue with' : 'Enter the 6-digit OTP sent to'}
            </p>
            {!otpVerified && phoneNumber && (
              <p style={styles.phone}>+91 {phoneNumber}</p>
            )}
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} style={styles.form}>
            <div style={{ display: otpVerified ? 'none' : 'block' }}>
              <label style={styles.label}>OTP Code</label>
              <input
                type="text"
                placeholder="— — — — — —"
                value={otp}
                onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                maxLength={6}
                required={!otpVerified}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                autoComplete="one-time-code"
                inputMode="numeric"
                style={{
                  ...styles.otpInput,
                  ...(focused ? styles.otpInputFocus : {}),
                }}
              />
            </div>

            {otpVerified && (
              <div style={styles.accountList}>
                {accountCandidates.map((account, index) => {
                  const accountId = String(account?.members_id || account?.id || `account-${index}`);
                  const name = account?.Name || account?.name || `Account ${index + 1}`;
                  const membershipNumber = account?.membership_number || account?.['Membership number'] || 'N/A';
                  const mobile = account?.mobile || account?.Mobile || phoneNumber;
                  return (
                    <label key={accountId} style={styles.accountItem}>
                      <input
                        type="radio"
                        name="selected-account"
                        value={accountId}
                        checked={String(selectedAccountId) === accountId}
                        onChange={(e) => setSelectedAccountId(e.target.value)}
                      />
                      <div style={styles.accountMeta}>
                        <span style={styles.accountName}>{name}</span>
                        <span style={styles.accountSub}>Membership: {membershipNumber}</span>
                        <span style={styles.accountSub}>Mobile: {mobile}</span>
                      </div>
                    </label>
                  );
                })}
              </div>
            )}

            {error && (
              <div style={styles.errorBox}>
                <span>⚠️</span>
                <span>{error}</span>
              </div>
            )}

            <div style={styles.btnRow}>
              <button
                type="button"
                onClick={handleBack}
                style={styles.backBtn}
              >
                ← Back
              </button>
              <button
                type="submit"
                disabled={loading || (!otpVerified && otp.length !== 6)}
                style={{
                  ...styles.verifyBtn,
                  ...(loading || (!otpVerified && otp.length !== 6) ? styles.verifyBtnDisabled : {}),
                }}
              >
                {loading ? (
                  <span style={styles.btnInner}>
                    <span style={styles.spinner} />
                    Verifying…
                  </span>
                ) : (
                  <span style={styles.btnInner}>{otpVerified ? 'Continue' : 'Verify OTP ✓'}</span>
                )}
              </button>
            </div>
          </form>

          {/* Resend */}
          {!otpVerified && (
            <div style={styles.resendWrap}>
              <p style={styles.resendText}>
                Didn't receive the OTP?{' '}
                <button onClick={handleBack} style={styles.resendBtn}>
                  Try again
                </button>
              </p>
            </div>
          )}

        </div>
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(28px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes float1 {
          0%,100% { transform: translateY(0) scale(1); }
          50%      { transform: translateY(-20px) scale(1.05); }
        }
        @keyframes float2 {
          0%,100% { transform: translateY(0) scale(1); }
          50%      { transform: translateY(16px) scale(0.97); }
        }
        @keyframes pulseRing {
          0%,100% { box-shadow: 0 0 0 0   color-mix(in srgb, var(--brand-red) 20%, transparent); }
          50%      { box-shadow: 0 0 0 12px color-mix(in srgb, var(--brand-red) 0%, transparent); }
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

// ─── Design tokens ─────────────────────────────────────────────────────────────
const RED      = 'var(--brand-red)';
const RED_DARK = 'var(--brand-red-dark)';
const NAVY     = 'var(--brand-navy)';
const WHITE    = 'var(--surface-color)';
const GRAY     = 'var(--body-text-color)';
const BORDER   = 'color-mix(in srgb, var(--brand-navy) 22%, transparent)';

const styles = {
  page: {
    fontFamily: "var(--font-family, 'Inter', sans-serif)",
    minHeight: '100vh',
    background: 'var(--page-bg, var(--app-page-bg))',
    position: 'relative', overflow: 'hidden',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: '24px 16px',
  },
  blobTL: {
    position: 'absolute', top: '-80px', left: '-80px',
    width: '300px', height: '300px', borderRadius: '50%',
    background: 'radial-gradient(circle, color-mix(in srgb, var(--brand-red) 16%, transparent) 0%, transparent 70%)',
    animation: 'float1 7s ease-in-out infinite', pointerEvents: 'none',
  },
  blobBR: {
    position: 'absolute', bottom: '-100px', right: '-80px',
    width: '340px', height: '340px', borderRadius: '50%',
    background: 'radial-gradient(circle, color-mix(in srgb, var(--brand-navy) 14%, transparent) 0%, transparent 70%)',
    animation: 'float2 9s ease-in-out infinite', pointerEvents: 'none',
  },
  wrapper: {
    position: 'relative', width: '100%', maxWidth: '420px',
    animation: 'fadeUp 0.55s ease-out both',
  },
  card: {
    background: WHITE, borderRadius: '28px',
    boxShadow: '0 24px 60px color-mix(in srgb, var(--brand-red) 11%, transparent), 0 8px 24px color-mix(in srgb, var(--brand-navy) 8%, transparent)',
    border: '1px solid color-mix(in srgb, var(--brand-red) 10%, transparent)',
    overflow: 'hidden', padding: '0 0 28px 0',
  },
  topBar: {
    height: '5px',
    background: `linear-gradient(90deg, ${RED} 0%, ${NAVY} 60%, ${RED} 100%)`,
  },
  logoWrap: {
    display: 'flex', justifyContent: 'center',
    marginTop: '28px', marginBottom: '16px',
  },
  logoRing: {
    width: '80px', height: '80px', borderRadius: '50%',
    background: WHITE,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    boxShadow: '0 0 0 4px var(--brand-red-light), 0 6px 20px color-mix(in srgb, var(--brand-red) 20%, transparent)',
    animation: 'pulseRing 3s ease-in-out infinite',
    padding: '6px',
  },
  logoImg: {
    width: '100%', height: '100%',
    objectFit: 'contain', borderRadius: '50%',
  },
  logoMonogram: {
    width: '100%', height: '100%', borderRadius: '50%',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'linear-gradient(135deg, var(--brand-red-light) 0%, var(--brand-navy-light) 100%)',
    color: NAVY, fontWeight: 800, fontSize: '24px', letterSpacing: '1px',
  },

  headerWrap: { textAlign: 'center', padding: '0 24px', marginBottom: '20px' },
  heading: { fontSize: '24px', fontWeight: 800, color: NAVY, margin: '0 0 6px 0', letterSpacing: '-0.4px' },
  divider: {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    gap: '8px', margin: '0 auto 10px auto', width: '120px',
  },
  divLine: {
    flex: 1, height: '1.5px',
    background: `linear-gradient(to right, transparent, ${RED})`,
    borderRadius: '2px',
  },
  divDot: { width: '6px', height: '6px', borderRadius: '50%', background: RED, display: 'inline-block' },
  subtext: { fontSize: '13px', color: GRAY, margin: 0, fontWeight: 500 },
  phone: { fontSize: '16px', fontWeight: 700, color: NAVY, margin: '4px 0 0 0' },

  form: { padding: '0 24px', display: 'flex', flexDirection: 'column', gap: '14px' },
  label: { display: 'block', fontSize: '12px', fontWeight: 700, color: NAVY, textTransform: 'uppercase', letterSpacing: '0.10em', marginBottom: '8px' },
  otpInput: {
    width: '100%', boxSizing: 'border-box',
    padding: '16px 12px', fontSize: '28px',
    textAlign: 'center', letterSpacing: '0.5em',
    fontWeight: 700, color: 'var(--body-text-color)',
    border: `2px solid ${BORDER}`, borderRadius: '16px',
    background: 'color-mix(in srgb, var(--app-accent-bg) 72%, var(--surface-color))', outline: 'none',
    fontFamily: "var(--font-family, 'Inter', monospace)",
    transition: 'all 0.22s ease',
  },
  otpInputFocus: {
    borderColor: RED, background: 'color-mix(in srgb, var(--surface-color) 85%, var(--brand-red-light))',
    boxShadow: '0 0 0 4px color-mix(in srgb, var(--brand-red) 11%, transparent)',
  },
  accountList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  accountItem: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '10px',
    border: `1px solid ${BORDER}`,
    borderRadius: '12px',
    padding: '10px 12px',
    background: 'color-mix(in srgb, var(--app-accent-bg) 72%, var(--surface-color))',
    cursor: 'pointer',
  },
  accountMeta: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  accountName: {
    fontSize: '14px',
    fontWeight: 700,
    color: NAVY,
  },
  accountSub: {
    fontSize: '12px',
    color: GRAY,
    fontWeight: 500,
  },

  errorBox: {
    display: 'flex', alignItems: 'center', gap: '8px',
    background: 'var(--brand-red-light)', border: '1.5px solid color-mix(in srgb, var(--brand-red) 28%, transparent)',
    borderRadius: '12px', padding: '12px 14px',
    fontSize: '13px', fontWeight: 500, color: RED_DARK,
  },

  btnRow: { display: 'flex', gap: '12px', marginTop: '4px' },
  backBtn: {
    flex: 1, padding: '14px', borderRadius: '16px',
    border: 'none', cursor: 'pointer',
    background: 'var(--brand-navy-light)', color: NAVY,
    fontSize: '15px', fontWeight: 700,
    fontFamily: "var(--font-family, 'Inter', sans-serif)",
    transition: 'all 0.2s ease',
  },
  verifyBtn: {
    flex: 2, padding: '14px', borderRadius: '16px',
    border: 'none', cursor: 'pointer',
    background: `linear-gradient(135deg, ${RED} 0%, ${RED_DARK} 50%, ${NAVY} 100%)`,
    color: WHITE, fontSize: '15px', fontWeight: 700,
    fontFamily: "var(--font-family, 'Inter', sans-serif)",
    boxShadow: '0 8px 24px color-mix(in srgb, var(--brand-red) 32%, transparent)',
    transition: 'all 0.2s ease',
  },
  verifyBtnDisabled: { opacity: 0.52, cursor: 'not-allowed', boxShadow: 'none' },
  btnInner: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' },
  spinner: {
    width: '16px', height: '16px',
    border: '2.5px solid color-mix(in srgb, var(--surface-color) 35%, transparent)',
    borderTop: '2.5px solid var(--surface-color)',
    borderRadius: '50%', display: 'inline-block',
    animation: 'spin 0.75s linear infinite',
  },

  resendWrap: {
    marginTop: '20px', paddingTop: '16px',
    borderTop: `1px solid ${BORDER}`, textAlign: 'center',
  },
  resendText: { fontSize: '13px', color: GRAY, margin: 0 },
  resendBtn: {
    background: 'none', border: 'none', cursor: 'pointer',
    color: RED, fontWeight: 700, fontSize: '13px',
    fontFamily: "var(--font-family, 'Inter', sans-serif)",
    padding: 0,
  },
};

export default OTPVerification;

