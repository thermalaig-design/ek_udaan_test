import React, { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useBackNavigation } from './hooks';
import { checkPhoneNumber } from './services/authService';
import { fetchTrustById } from './services/trustService';

// ─── Constants ────────────────────────────────────────────────────────────────
const TRUST_ID = import.meta.env.VITE_DEFAULT_TRUST_ID || 'b353d2ff-ec3b-4b90-a896-69f40662084e';
// Cache key specifically for the BASE/LOGIN trust — separate from session trust
const LOGIN_TRUST_CACHE_KEY = 'cached_base_trust_info';
const TRUST_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
// No static fallback image — show monogram placeholder until Supabase icon_url loads
const DEFAULT_TRUST_NAME = import.meta.env.VITE_DEFAULT_TRUST_NAME || 'Ek Udaan';
const OTP_FLOW_KEY = 'otp_flow_allowed';

// ─── Cache helpers ─────────────────────────────────────────────────────────────
// IMPORTANT: Login page uses its own cache key (cached_base_trust_info) that is
// ALWAYS tied to the BASE trust ID. This prevents the Home page's trust-switching
// (which writes to selected_trust_id) from ever bleeding wrong logos into Login.
const getCachedBaseTrust = () => {
  try {
    const raw = localStorage.getItem(LOGIN_TRUST_CACHE_KEY);
    if (!raw) return null;
    const { data, ts, trustId } = JSON.parse(raw);
    // Reject cache if it belongs to a different trust
    if (trustId && trustId !== TRUST_ID) {
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

const setCachedBaseTrust = (trust) => {
  try {
    localStorage.setItem(
      LOGIN_TRUST_CACHE_KEY,
      JSON.stringify({ data: trust, ts: Date.now(), trustId: TRUST_ID })
    );
  } catch { /* ignore */ }
};

// ─── Component ─────────────────────────────────────────────────────────────────
function Login() {
  const navigate = useNavigate();
  useBackNavigation();

  const [phoneNumber, setPhoneNumber] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [focused, setFocused] = useState(false);

  // Initialize immediately from BASE-trust-specific cache — prevents wrong logo on refresh
  const [trustInfo, setTrustInfo] = useState(() => getCachedBaseTrust() || null);

  // Logged-in users should not see login/OTP UI again on refresh.
  useEffect(() => {
    const user = localStorage.getItem('user');
    const isLoggedIn = localStorage.getItem('isLoggedIn') === 'true';
    if (user && user !== 'null' && user !== 'undefined' && isLoggedIn) {
      navigate('/', { replace: true });
    }
  }, [navigate]);

  // Clear the OLD shared cache key — it may contain another trust's data from Home page
  // This runs once on mount so stale logos can never bleed back to Login.
  useEffect(() => {
    try { localStorage.removeItem('cached_trust_info'); } catch { /* ignore */ }
  }, []);

  // Always fetch the BASE trust (TRUST_ID = Ek Udaan) — never reads selected_trust_id.
  // Login page must always show Ek Udaan branding regardless of which trust was last active.
  useEffect(() => {
    let active = true;

    const loadTrust = async () => {
      try {
        // Force fetch by the hardcoded BASE trust ID
        const trust = await fetchTrustById(TRUST_ID);
        if (!active || !trust) return;

        setTrustInfo(trust);
        // Write to LOGIN-specific cache (isolated from Home page trust switching)
        setCachedBaseTrust(trust);
      } catch (err) {
        console.warn('[Login] Failed to refresh base trust info:', err?.message || err);
      }
    };

    loadTrust();
    return () => { active = false; };
  }, []);

  // ─── Handlers ───────────────────────────────────────────────────────────────
  const handleCheckPhone = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      // Special admin path
      if (phoneNumber === '9911334455') {
        const checkResult = await checkPhoneNumber(phoneNumber);
        if (!checkResult.success) {
          setError(checkResult.message);
          setLoading(false);
          return;
        }
        sessionStorage.setItem(OTP_FLOW_KEY, 'special');
        navigate('/special-otp-verification', {
          state: { user: checkResult.data.user, phoneNumber }
        });
        return;
      }

      const checkResult = await checkPhoneNumber(phoneNumber);

      if (!checkResult.success) {
        setError(checkResult.message);
        setLoading(false);
        return;
      }

      sessionStorage.setItem(OTP_FLOW_KEY, 'normal');
      navigate('/otp-verification', {
        state: { user: checkResult.data.user, phoneNumber }
      });
    } catch (err) {
      console.error('[Login] Error checking phone:', err);
      setError('Failed to verify phone number. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // ─── Derived display values ────────────────────────────────────────────────────────────────
  const displayName = trustInfo?.name || DEFAULT_TRUST_NAME;
  // Only show logo when Supabase has returned a real icon_url — no fallback to /app-logo.png
  const displayLogo = trustInfo?.icon_url || null;

  // ─── Render ──────────────────────────────────────────────────────────────────
  return (
    <div style={styles.page}>
      {/* Decorative blobs */}
      <div style={styles.blobTL} />
      <div style={styles.blobBR} />
      <div style={styles.blobCenter} />

      <div style={styles.wrapper}>
        <div style={styles.card}>

          {/* Top accent bar */}
          <div style={styles.topBar} />

          {/* Logo — shows only Supabase icon_url; placeholder monogram shown while loading */}
          <div style={styles.logoWrap}>
            <div style={styles.logoRing}>
              {displayLogo ? (
                <img
                  src={displayLogo}
                  alt={displayName || 'Trust Logo'}
                  style={styles.logoImg}
                  loading="eager"
                  onError={(e) => {
                    // If URL is broken, hide the img entirely; do not fall back to Mah-Setu logo
                    e.currentTarget.style.display = 'none';
                  }}
                />
              ) : (
                // Neutral monogram while Supabase fetch is in progress
                <div style={styles.logoMonogram}>
                  {(displayName || 'EU').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
                </div>
              )}
            </div>
          </div>

          {/* Title */}
          <div style={styles.titleWrap}>
            <h1 style={styles.orgName}>{displayName}</h1>
            <div style={styles.divider}>
              <span style={styles.divLine} />
              <span style={styles.divDot} />
              <span style={styles.divLine} />
            </div>
            <p style={styles.subtitle}>Welcome back — please sign in</p>
          </div>

          {/* Secure badge */}
          <div style={styles.badge}>
            <span style={styles.badgePulse} />
            Secure Member Portal
          </div>

          {/* Form */}
          <form onSubmit={handleCheckPhone} style={styles.form}>
            <label style={styles.label}>Mobile Number</label>
            <div style={{ ...styles.inputRow, ...(focused ? styles.inputRowFocus : {}) }}>
              <div style={styles.prefix}>
                <span style={styles.flag}>🇮🇳</span>
                <span style={styles.code}>+91</span>
              </div>
              <div style={styles.inputDivider} />
              <input
                type="tel"
                placeholder="Enter 10-digit mobile number"
                value={phoneNumber}
                onChange={e => setPhoneNumber(e.target.value.replace(/\D/g, ''))}
                maxLength={10}
                required
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                style={styles.input}
                autoComplete="tel"
                inputMode="numeric"
              />
            </div>

            {error && (
              <div style={styles.errorBox}>
                <span>⚠️</span>
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading || phoneNumber.length < 10}
              style={{
                ...styles.btn,
                ...(loading || phoneNumber.length < 10 ? styles.btnDisabled : {})
              }}
            >
              {loading ? (
                <span style={styles.btnInner}>
                  <span style={styles.spinner} />
                  Verifying…
                </span>
              ) : (
                <span style={styles.btnInner}>
                  Continue
                  <span style={styles.arrow}>→</span>
                </span>
              )}
            </button>
          </form>

          {/* Footer */}
          <div style={styles.footer}>
            <div style={styles.footerLinks}>
              <Link to="/terms-and-conditions" style={styles.footerLink}>Terms</Link>
              <span style={styles.footerDot}>•</span>
              <Link to="/privacy-policy" style={styles.footerLink}>Privacy Policy</Link>
            </div>
            {displayName && (
              <p style={styles.copyright}>© {new Date().getFullYear()} {displayName}. All rights reserved.</p>
            )}
          </div>

        </div>
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');

        @keyframes float1 {
          0%,100% { transform: translateY(0) scale(1); }
          50%      { transform: translateY(-20px) scale(1.05); }
        }
        @keyframes float2 {
          0%,100% { transform: translateY(0) scale(1); }
          50%      { transform: translateY(16px) scale(0.97); }
        }
        @keyframes float3 {
          0%,100% { transform: translateX(0); }
          50%      { transform: translateX(14px); }
        }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(28px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        @keyframes pulseRing {
          0%,100% { box-shadow: 0 0 0 0   rgba(192,36,26,0.20); }
          50%      { box-shadow: 0 0 0 12px rgba(192,36,26,0); }
        }
        @keyframes pulse2 {
          0%,100% { opacity: 1; transform: scale(1); }
          50%      { opacity: 0.5; transform: scale(0.85); }
        }
        @keyframes shimmer {
          0%   { background-position: -200px 0; }
          100% { background-position: 200px 0; }
        }
      `}</style>
    </div>
  );
}

// ─── Design Tokens ─────────────────────────────────────────────────────────────
const RED      = 'var(--brand-red, #C0241A)';
const RED_DARK = 'var(--brand-red-dark, #9B1A13)';
const NAVY     = 'var(--brand-navy, #2B2F7E)';
const WHITE    = '#FFFFFF';
const GRAY     = 'var(--body-text-color, #64748b)';
const BORDER   = 'rgba(148, 163, 184, 0.35)';

const styles = {
  page: {
    fontFamily: "'Inter', sans-serif",
    minHeight: '100vh',
    background: 'var(--page-bg, linear-gradient(135deg, #fff5f5 0%, #ffffff 40%, #f0f1fb 100%))',
    position: 'relative',
    overflow: 'hidden',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px 16px',
  },

  // Ambient blobs
  blobTL: {
    position: 'absolute', top: '-80px', left: '-80px',
    width: '320px', height: '320px', borderRadius: '50%',
    background: 'radial-gradient(circle, rgba(192,36,26,0.18) 0%, transparent 70%)',
    animation: 'float1 7s ease-in-out infinite', pointerEvents: 'none',
  },
  blobBR: {
    position: 'absolute', bottom: '-100px', right: '-80px',
    width: '360px', height: '360px', borderRadius: '50%',
    background: 'radial-gradient(circle, rgba(43,47,126,0.14) 0%, transparent 70%)',
    animation: 'float2 9s ease-in-out infinite', pointerEvents: 'none',
  },
  blobCenter: {
    position: 'absolute', top: '40%', left: '60%',
    width: '200px', height: '200px', borderRadius: '50%',
    background: 'radial-gradient(circle, rgba(192,36,26,0.07) 0%, transparent 70%)',
    animation: 'float3 6s ease-in-out infinite', pointerEvents: 'none',
  },

  wrapper: {
    position: 'relative', width: '100%', maxWidth: '420px',
    animation: 'fadeUp 0.55s ease-out both',
  },

  card: {
    background: WHITE, borderRadius: '28px',
    boxShadow: '0 24px 60px rgba(192,36,26,0.10), 0 8px 24px rgba(43,47,126,0.08)',
    border: '1px solid rgba(192,36,26,0.10)',
    overflow: 'hidden', padding: '0 0 28px 0',
  },

  topBar: {
    height: '5px',
    background: `linear-gradient(90deg, ${RED} 0%, ${NAVY} 60%, ${RED} 100%)`,
  },

  logoWrap: {
    display: 'flex', justifyContent: 'center',
    marginTop: '28px', marginBottom: '20px',
  },
  logoRing: {
    width: '120px', height: '120px', borderRadius: '50%',
    background: WHITE,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    boxShadow: '0 0 0 4px #FDECEA, 0 8px 28px rgba(192,36,26,0.18)',
    animation: 'pulseRing 3s ease-in-out infinite',
    padding: '8px',
  },
  logoImg: {
    width: '100%', height: '100%',
    objectFit: 'contain', borderRadius: '50%',
  },
  logoMonogram: {
    width: '100%', height: '100%', borderRadius: '50%',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'linear-gradient(135deg, #FDECEA 0%, #EAEBF8 100%)',
    color: NAVY, fontWeight: 800, fontSize: '36px', letterSpacing: '1px',
  },

  titleWrap: {
    textAlign: 'center', padding: '0 24px', marginBottom: '16px',
  },
  orgName: {
    fontSize: '24px', fontWeight: 800, color: NAVY,
    margin: '0 0 4px 0', letterSpacing: '-0.4px',
  },
  nameSkeleton: {
    height: '28px', borderRadius: '6px', margin: '0 auto 4px auto', width: '180px',
    background: 'linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%)',
    backgroundSize: '400px 100%',
    animation: 'shimmer 1.4s ease-in-out infinite',
  },
  divider: {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    gap: '8px', margin: '0 auto 10px auto', width: '140px',
  },
  divLine: {
    flex: 1, height: '1.5px',
    background: `linear-gradient(to right, transparent, ${RED})`,
    borderRadius: '2px',
  },
  divDot: {
    width: '6px', height: '6px', borderRadius: '50%',
    background: RED, display: 'inline-block',
  },
  subtitle: {
    fontSize: '13px', color: GRAY, margin: 0, fontWeight: 500,
  },

  badge: {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    gap: '6px',
    background: '#EAEBF8', color: NAVY,
    fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em',
    textTransform: 'uppercase', borderRadius: '20px',
    padding: '5px 14px', width: 'fit-content',
    margin: '0 auto 22px auto',
  },
  badgePulse: {
    width: '7px', height: '7px', borderRadius: '50%',
    background: RED, display: 'inline-block',
    boxShadow: `0 0 6px ${RED}`,
    animation: 'pulse2 2s ease-in-out infinite',
  },

  form: {
    padding: '0 24px', display: 'flex',
    flexDirection: 'column', gap: '14px',
  },
  label: {
    fontSize: '12px', fontWeight: 700, color: NAVY,
    textTransform: 'uppercase', letterSpacing: '0.10em',
  },
  inputRow: {
    display: 'flex', alignItems: 'center',
    border: `2px solid ${BORDER}`, borderRadius: '16px',
    background: '#f1f5f9', transition: 'all 0.22s ease',
    overflow: 'hidden',
  },
  inputRowFocus: {
    borderColor: RED, background: '#fff8f8',
    boxShadow: '0 0 0 4px rgba(192,36,26,0.10)',
  },
  prefix: {
    display: 'flex', alignItems: 'center', gap: '6px',
    padding: '14px 12px', flexShrink: 0,
  },
  flag: { fontSize: '18px', lineHeight: 1 },
  code: { fontSize: '15px', fontWeight: 700, color: NAVY },
  inputDivider: {
    width: '1.5px', height: '28px',
    background: BORDER, flexShrink: 0,
  },
  input: {
    flex: 1, border: 'none', background: 'transparent',
    padding: '14px 14px', fontSize: '16px', color: '#1e293b',
    fontFamily: "'Inter', sans-serif", fontWeight: 500,
    outline: 'none', letterSpacing: '0.02em',
  },

  errorBox: {
    display: 'flex', alignItems: 'center', gap: '8px',
    background: '#FDECEA', border: '1.5px solid rgba(192,36,26,0.25)',
    borderRadius: '12px', padding: '12px 14px',
    fontSize: '13px', fontWeight: 500, color: RED_DARK,
  },

  btn: {
    width: '100%', padding: '15px', borderRadius: '16px',
    border: 'none',
    background: `linear-gradient(135deg, ${RED} 0%, ${RED_DARK} 50%, ${NAVY} 100%)`,
    color: WHITE, fontSize: '16px', fontWeight: 700,
    fontFamily: "'Inter', sans-serif", cursor: 'pointer',
    letterSpacing: '0.02em',
    boxShadow: '0 8px 24px rgba(192,36,26,0.32)',
    transition: 'all 0.2s ease', marginTop: '4px',
  },
  btnDisabled: { opacity: 0.52, cursor: 'not-allowed', boxShadow: 'none' },
  btnInner: {
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
  },
  arrow: { fontSize: '20px', fontWeight: 400 },
  spinner: {
    width: '18px', height: '18px',
    border: '2.5px solid rgba(255,255,255,0.35)',
    borderTop: '2.5px solid #fff',
    borderRadius: '50%', display: 'inline-block',
    animation: 'spin 0.75s linear infinite',
  },

  footer: {
    marginTop: '24px', padding: '18px 24px 0 24px',
    borderTop: `1px solid ${BORDER}`, textAlign: 'center',
    display: 'flex', flexDirection: 'column', gap: '6px',
  },
  footerLinks: {
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px',
  },
  footerLink: {
    fontSize: '12px', fontWeight: 600, color: NAVY,
    textDecoration: 'none', opacity: 0.75, transition: 'opacity 0.2s',
  },
  footerDot: { color: RED, fontSize: '14px', opacity: 0.5 },
  copyright: { fontSize: '11px', color: GRAY, margin: 0, opacity: 0.65 },
};

export default Login;
