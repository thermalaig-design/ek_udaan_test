import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Building2, ChevronRight, Star } from 'lucide-react';
import { fetchTrustById } from './services/trustService';
import { useAppTheme } from './context/ThemeContext';
import { getAllSponsorsForTrust } from './services/api';
import { mergeByIdAndAppendOrder, setPinnedSponsor, setSelectedSponsorId } from './services/sponsorStore';

const CACHE_KEY = (trustId) => `sp_all_v1_${trustId}`;
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 min

const readAllCache = (trustId) => {
  try {
    const raw = localStorage.getItem(CACHE_KEY(trustId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.ts || !Array.isArray(parsed?.data)) return null;
    if (Date.now() - parsed.ts > CACHE_TTL_MS) { localStorage.removeItem(CACHE_KEY(trustId)); return null; }
    return parsed.data;
  } catch { return null; }
};

const writeAllCache = (trustId, data) => {
  try { localStorage.setItem(CACHE_KEY(trustId), JSON.stringify({ ts: Date.now(), data })); } catch { /* ignore */ }
};

const SponsorsList = ({ onNavigate, onBack }) => {
  const selectedTrustId = localStorage.getItem('selected_trust_id') || '';
  const hasTrust = Boolean(selectedTrustId);
  const theme = useAppTheme();

  const [trustName, setTrustName] = useState(localStorage.getItem('selected_trust_name') || 'Trust Sponsors');
  const [items, setItems] = useState(() => (hasTrust ? (readAllCache(selectedTrustId) || []) : []));
  const [isLoading, setIsLoading] = useState(() => (hasTrust ? !readAllCache(selectedTrustId) : false));
  const [isRefreshing, setIsRefreshing] = useState(false);
  const activeRef = useRef(true);

  useEffect(() => {
    activeRef.current = true;
    return () => { activeRef.current = false; };
  }, []);

  useEffect(() => {
    if (!selectedTrustId) return;

    // Fetch trust name
    fetchTrustById(selectedTrustId).then((t) => {
      if (activeRef.current && t?.name) setTrustName(t.name);
    }).catch(() => {});

    // Check cache
    const cached = readAllCache(selectedTrustId);
    if (cached && cached.length > 0) {
      setItems(cached);
      setIsLoading(false);
      // Background refresh
      setIsRefreshing(true);
      getAllSponsorsForTrust(selectedTrustId).then((res) => {
        if (!activeRef.current) return;
        const fresh = Array.isArray(res?.data) ? res.data : [];
        if (fresh.length > 0) {
          writeAllCache(selectedTrustId, fresh);
          mergeByIdAndAppendOrder(selectedTrustId, fresh);
          setItems(fresh);
        }
      }).catch(() => {}).finally(() => { if (activeRef.current) setIsRefreshing(false); });
      return;
    }

    // No cache — fresh fetch
    setIsLoading(true);
    getAllSponsorsForTrust(selectedTrustId).then((res) => {
      if (!activeRef.current) return;
      const data = Array.isArray(res?.data) ? res.data : [];
      writeAllCache(selectedTrustId, data);
      mergeByIdAndAppendOrder(selectedTrustId, data);
      setItems(data);
    }).catch((err) => {
      console.error('[SponsorsList] fetch error:', err);
    }).finally(() => { if (activeRef.current) setIsLoading(false); });
  }, [selectedTrustId]);

  const list = useMemo(() => items, [items]);

  const openSponsor = (sponsor) => {
    if (!sponsor?.id) return;
    setSelectedSponsorId(sponsor.id);
    setPinnedSponsor(selectedTrustId, sponsor.id);
    onNavigate('sponsor-details');
  };

  return (
    <div className="min-h-screen" style={{ background: '#FFFFFF' }}>
      <div className="theme-navbar backdrop-blur border-b px-5 py-4 flex items-center gap-3 sticky top-0 z-10">
        <button onClick={onBack} className="p-2 rounded-xl transition-colors" style={{ background: 'color-mix(in srgb, var(--app-accent-bg) 45%, transparent)' }}>
          <ArrowLeft className="h-5 w-5" style={{ color: 'var(--navbar-text)' }} />
        </button>
        <div>
          <h1 className="text-lg font-extrabold" style={{ color: 'var(--navbar-text)' }}>Sponsors</h1>
          <p className="text-[11px] font-medium" style={{ color: 'var(--body-text-color)' }}>
            {trustName}{list.length > 0 ? ` · ${list.length} sponsors` : ''}
            {isRefreshing ? ' · refreshing...' : ''}
          </p>
        </div>
      </div>

      <div className="px-4 py-4">
        {isLoading ? (
          <div className="rounded-2xl p-8 text-center" style={{ background: 'color-mix(in srgb, #ffffff 88%, var(--app-accent-bg))', border: '1px solid color-mix(in srgb, var(--brand-navy) 10%, transparent)' }}>
            <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin mx-auto" style={{ borderColor: theme.primary, borderTopColor: 'transparent' }} />
            <p className="text-xs font-semibold mt-2" style={{ color: theme.secondary }}>Loading sponsors...</p>
          </div>
        ) : list.length === 0 ? (
          <div className="rounded-2xl p-8 text-center" style={{ background: 'color-mix(in srgb, #ffffff 88%, var(--app-accent-bg))', border: '1px solid color-mix(in srgb, var(--brand-navy) 10%, transparent)' }}>
            <p className="text-sm font-semibold" style={{ color: 'var(--body-text-color)' }}>No active sponsors available</p>
          </div>
        ) : (
          <div className="space-y-2">
            {list.map((sponsor) => (
              <button
                key={sponsor.id}
                onClick={() => openSponsor(sponsor)}
                className="w-full flex items-center gap-3 rounded-2xl px-3.5 py-3 text-left transition-all active:scale-[0.985]"
                style={{
                  background: `linear-gradient(135deg, #ffffff 0%, ${theme.accentBg || '#f8fafc'} 100%)`,
                  border: `1px solid ${theme.primary}1F`,
                }}
              >
                <div className="w-12 h-12 rounded-xl overflow-hidden flex items-center justify-center bg-slate-50 border border-slate-100 shadow-sm flex-shrink-0">
                  {(sponsor.photo_thumb_url || sponsor.photo_url) ? (
                    <img src={sponsor.photo_thumb_url || sponsor.photo_url} alt={sponsor.name} className="w-full h-full object-cover" loading="lazy" />
                  ) : (
                    <Star className="h-4 w-4" style={{ color: theme.primary }} />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-extrabold truncate" style={{ color: theme.secondary }}>
                    {sponsor.name || sponsor.company_name || 'Sponsor'}
                  </p>
                  <div className="mt-0.5 flex items-center gap-1.5 min-w-0">
                    <Building2 className="h-3 w-3 text-slate-400 flex-shrink-0" />
                    <p className="text-[10px] font-semibold text-slate-500 truncate">
                      {sponsor.company_name || sponsor.position || 'Community partner'}
                    </p>
                  </div>
                </div>
                <div
                  className="w-7 h-7 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: `linear-gradient(135deg, ${theme.primary} 0%, ${theme.secondary} 100%)` }}
                >
                  <ChevronRight className="h-3.5 w-3.5 text-white" />
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default SponsorsList;
