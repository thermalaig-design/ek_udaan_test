import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBackNavigation } from './hooks';
import { fetchTrustById } from './services/trustService';

const TRUST_ID = import.meta.env.VITE_DEFAULT_TRUST_ID || 'b353d2ff-ec3b-4b90-a896-69f40662084e';
const TRUST_CACHE_KEY = 'cached_trust_info';

const getCachedTrust = () => {
  try {
    const raw = localStorage.getItem(TRUST_CACHE_KEY);
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw);
    if (Date.now() - ts > 24 * 60 * 60 * 1000) return null;
    return data;
  } catch { return null; }
};

// Parse plain-text numbered sections
const parseSections = (rawText) => {
  if (!rawText) return [];
  if (/<[a-z][\s\S]*>/i.test(rawText)) {
    return [{ title: '', body: rawText, isHtml: true }];
  }
  const parts = rawText.split(/(?=\d+\.\s)/);
  return parts
    .map(p => p.trim())
    .filter(Boolean)
    .map(part => {
      const match = part.match(/^(\d+)\.\s+(.+?)(?:\n|$)([\s\S]*)/);
      if (match) {
        return { num: match[1], title: match[2].trim(), body: match[3].trim(), isHtml: false };
      }
      return { num: null, title: null, body: part, isHtml: false };
    });
};

const SkeletonLine = ({ width = '100%', height = '14px', mb = '10px' }) => (
  <div style={{
    width, height,
    background: 'linear-gradient(90deg, #f0f0f0 25%, #e8e8e8 50%, #f0f0f0 75%)',
    backgroundSize: '400px 100%',
    borderRadius: '6px', marginBottom: mb,
    animation: 'shimmer 1.4s ease-in-out infinite',
  }} />
);

const PrivacyPolicy = () => {
  const navigate = useNavigate();
  useBackNavigation();

  const [trustInfo, setTrustInfo] = useState(() => getCachedTrust());
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const cached = getCachedTrust();
        if (cached) {
          setTrustInfo(cached);
          setContent(cached.privacy_content || '');
          setLoading(false);
        }

        const trust = await fetchTrustById(TRUST_ID);
        if (!active || !trust) return;
        setTrustInfo(trust);
        setContent(trust.privacy_content || '');
        try {
          localStorage.setItem(TRUST_CACHE_KEY, JSON.stringify({ data: trust, ts: Date.now() }));
        } catch {}
      } catch (err) {
        console.warn('[Privacy] Load error:', err);
        if (active) setError('Failed to load Privacy Policy. Please try again.');
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => { active = false; };
  }, []);

  const sections = parseSections(content);
  const trustName = trustInfo?.name || '';
  const trustLogo = trustInfo?.icon_url || '';

  return (
    <div style={s.page}>
      {/* Header */}
      <div style={s.header}>
        <button onClick={() => navigate(-1)} style={s.backBtn} aria-label="Go back">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <div style={s.headerCenter}>
          {trustLogo && <img src={trustLogo} alt={trustName} style={s.headerLogo} />}
          <div>
            <h1 style={s.headerTitle}>Privacy Policy</h1>
            {trustName && <p style={s.headerSub}>{trustName}</p>}
          </div>
        </div>
      </div>

      {/* Top accent */}
      <div style={s.accentStrip} />

      {/* Body */}
      <div style={s.body}>
        {loading && (
          <div style={{ padding: '24px' }}>
            <SkeletonLine width="55%" height="18px" mb="20px" />
            {[1,2,3,4,5].map(i => (
              <div key={i} style={{ marginBottom: '28px' }}>
                <SkeletonLine width="45%" height="15px" mb="10px" />
                <SkeletonLine width="100%" mb="6px" />
                <SkeletonLine width="92%" mb="6px" />
                <SkeletonLine width="80%" mb="0" />
              </div>
            ))}
          </div>
        )}

        {!loading && error && (
          <div style={s.errorBox}>
            <span style={{ fontSize: '24px' }}>⚠️</span>
            <div>
              <p style={{ fontWeight: 700, margin: '0 0 4px 0', color: '#9B1A13' }}>Unable to load</p>
              <p style={{ margin: 0, fontSize: '13px', color: '#C0241A' }}>{error}</p>
            </div>
          </div>
        )}

        {!loading && !error && !content && (
          <div style={s.emptyBox}>
            <span style={{ fontSize: '40px', display: 'block', marginBottom: '12px' }}>🔒</span>
            <p style={{ color: '#64748b', fontSize: '15px', margin: 0 }}>Privacy Policy not available yet.</p>
          </div>
        )}

        {!loading && !error && content && (
          <>
            {/* Intro card */}
            <div style={s.introCard}>
              <div style={s.introIcon}>🛡️</div>
              <div>
                <p style={s.introTitle}>Your privacy matters</p>
                <p style={s.introText}>
                  We are committed to protecting your personal information and being transparent about how we use it.
                </p>
              </div>
            </div>

            {/* Sections */}
            {sections.map((sec, idx) => (
              <div key={idx} style={s.section}>
                {sec.isHtml ? (
                  <>
                    {sec.title && <h2 style={s.sectionTitle}>{sec.title}</h2>}
                    <div style={s.sectionBody} dangerouslySetInnerHTML={{ __html: sec.body }} />
                  </>
                ) : sec.num ? (
                  <>
                    <div style={s.sectionHeader}>
                      <span style={s.sectionNum}>{sec.num}</span>
                      <h2 style={s.sectionTitle}>{sec.title}</h2>
                    </div>
                    {sec.body && <p style={s.sectionBody}>{sec.body}</p>}
                  </>
                ) : (
                  <p style={{ ...s.sectionBody, marginTop: 0 }}>{sec.body}</p>
                )}
              </div>
            ))}

            {/* Footer */}
            <div style={s.footerCard}>
              <div style={s.footerRow}>
                <span style={{ fontSize: '18px' }}>🔒</span>
                <span style={s.footerText}>
                  {trustName
                    ? `© ${new Date().getFullYear()} ${trustName}. All rights reserved.`
                    : `© ${new Date().getFullYear()} All rights reserved.`}
                </span>
              </div>
              {trustInfo?.created_at && (
                <p style={s.lastUpdated}>
                  Last updated: {new Date(trustInfo.created_at).toLocaleDateString('en-IN', {
                    day: '2-digit', month: 'long', year: 'numeric'
                  })}
                </p>
              )}
            </div>
          </>
        )}
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
        @keyframes shimmer {
          0%   { background-position: -400px 0; }
          100% { background-position: 400px 0; }
        }
      `}</style>
    </div>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────
const RED   = '#C0241A';
const NAVY  = '#2B2F7E';

const s = {
  page: {
    fontFamily: "'Inter', sans-serif",
    minHeight: '100vh',
    background: '#f8fafc',
    display: 'flex',
    flexDirection: 'column',
  },
  header: {
    display: 'flex', alignItems: 'center', gap: '14px',
    padding: '16px 18px',
    background: `linear-gradient(135deg, ${NAVY} 0%, ${RED} 100%)`,
    color: '#fff',
  },
  backBtn: {
    width: '40px', height: '40px', borderRadius: '12px',
    border: 'none', background: 'rgba(255,255,255,0.18)',
    color: '#fff', cursor: 'pointer', flexShrink: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  headerCenter: {
    display: 'flex', alignItems: 'center', gap: '12px', flex: 1,
  },
  headerLogo: {
    width: '40px', height: '40px', borderRadius: '50%',
    objectFit: 'contain', backgroundColor: '#fff',
    padding: '3px', flexShrink: 0,
  },
  headerTitle: {
    fontSize: '18px', fontWeight: 800, margin: 0, letterSpacing: '-0.3px',
  },
  headerSub: {
    fontSize: '12px', margin: '2px 0 0 0', opacity: 0.82, fontWeight: 500,
  },
  accentStrip: {
    height: '4px',
    background: `linear-gradient(90deg, ${NAVY}, ${RED}, ${NAVY})`,
  },
  body: {
    flex: 1, overflowY: 'auto',
    padding: '20px 16px 32px 16px',
    display: 'flex', flexDirection: 'column',
  },
  introCard: {
    display: 'flex', gap: '14px', alignItems: 'flex-start',
    background: 'linear-gradient(135deg, #f0f1fb 0%, #fff5f5 100%)',
    border: `1px solid rgba(43,47,126,0.15)`,
    borderRadius: '16px', padding: '16px', marginBottom: '20px',
  },
  introIcon: { fontSize: '28px', flexShrink: 0, lineHeight: 1 },
  introTitle: { fontWeight: 700, fontSize: '14px', color: NAVY, margin: '0 0 4px 0' },
  introText: { fontSize: '13px', color: '#64748b', margin: 0, lineHeight: 1.5 },

  section: {
    background: '#fff',
    borderRadius: '16px',
    padding: '18px',
    marginBottom: '12px',
    boxShadow: '0 2px 10px rgba(0,0,0,0.05)',
    border: '1px solid rgba(226,232,240,0.8)',
  },
  sectionHeader: {
    display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '10px',
  },
  sectionNum: {
    width: '30px', height: '30px', borderRadius: '8px', flexShrink: 0,
    background: `linear-gradient(135deg, ${NAVY}, ${RED})`,
    color: '#fff', fontSize: '13px', fontWeight: 800,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  sectionTitle: {
    fontSize: '15px', fontWeight: 700, color: NAVY, margin: 0, lineHeight: 1.3,
  },
  sectionBody: {
    fontSize: '14px', color: '#475569', lineHeight: 1.75, margin: '0',
    whiteSpace: 'pre-wrap',
  },

  footerCard: {
    background: '#fff', borderRadius: '16px',
    padding: '16px 18px', marginTop: '8px',
    border: '1px solid rgba(226,232,240,0.8)',
  },
  footerRow: {
    display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px',
  },
  footerText: { fontSize: '13px', fontWeight: 600, color: NAVY, opacity: 0.75 },
  lastUpdated: { fontSize: '12px', color: '#94a3b8', margin: 0, fontStyle: 'italic' },

  errorBox: {
    display: 'flex', gap: '14px', alignItems: 'flex-start',
    background: '#FDECEA', border: '1.5px solid rgba(192,36,26,0.25)',
    borderRadius: '16px', padding: '18px', marginTop: '8px',
  },
  emptyBox: { textAlign: 'center', padding: '60px 24px' },
};

export default PrivacyPolicy;
