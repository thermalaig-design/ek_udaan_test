import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Building2, ChevronRight, Star } from 'lucide-react';
import { getSponsors } from './services/api';
import { fetchMemberTrusts, fetchTrustById } from './services/trustService';
import { useTheme } from './hooks';

const SPONSORS_LIST_CACHE_PREFIX = 'sponsors_list_cache_v1';
const buildSponsorsListCacheKey = (trustId) => `${SPONSORS_LIST_CACHE_PREFIX}_${trustId || 'all'}`;

const SponsorsList = ({ onNavigate, onBack }) => {
  const [trusts, setTrusts] = useState([]);
  const [trustSponsors, setTrustSponsors] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const selectedTrustId = localStorage.getItem('selected_trust_id') || '';
  const { theme } = useTheme(selectedTrustId);

  const sortedTrusts = useMemo(() => {
    return [...trusts].sort((a, b) => {
      if (a.is_active !== b.is_active) return a.is_active ? -1 : 1;
      return String(a.name || '').localeCompare(String(b.name || ''));
    });
  }, [trusts]);

  useEffect(() => {
    const loadTrustsAndSponsors = async () => {
      const cacheKey = buildSponsorsListCacheKey(selectedTrustId);
      let cacheApplied = false;

      // Show cached sponsors instantly; refresh from API in background.
      try {
        const cached = localStorage.getItem(cacheKey);
        if (cached) {
          const parsed = JSON.parse(cached);
          const cachedTrusts = Array.isArray(parsed?.trusts) ? parsed.trusts : [];
          const cachedMap = parsed?.sponsorsByTrust && typeof parsed.sponsorsByTrust === 'object'
            ? parsed.sponsorsByTrust
            : {};
          const hasAnySponsors = Object.values(cachedMap).some(
            (list) => Array.isArray(list) && list.length > 0
          );

          if (cachedTrusts.length > 0 && hasAnySponsors) {
            setTrusts(cachedTrusts);
            setTrustSponsors(cachedMap);
            setIsLoading(false);
            cacheApplied = true;
          }
        }
      } catch {
        // ignore malformed cache
      }

      if (!cacheApplied && selectedTrustId) {
        try {
          const trustName = localStorage.getItem('selected_trust_name') || 'Trust Sponsors';
          const rawSponsorCache = localStorage.getItem(`sponsors_cache_${selectedTrustId}`);
          if (rawSponsorCache) {
            const parsedSponsorCache = JSON.parse(rawSponsorCache);
            const sponsorList = Array.isArray(parsedSponsorCache)
              ? parsedSponsorCache
              : (Array.isArray(parsedSponsorCache?.data) ? parsedSponsorCache.data : []);
            if (Array.isArray(sponsorList) && sponsorList.length > 0) {
              setTrusts([{ id: selectedTrustId, name: trustName, is_active: true }]);
              setTrustSponsors({ [selectedTrustId]: sponsorList });
              setIsLoading(false);
              cacheApplied = true;
            }
          }
        } catch {
          // ignore malformed cache
        }
      }

      try {
        if (!cacheApplied) setIsLoading(true);
        const userStr = localStorage.getItem('user');
        const user = userStr ? JSON.parse(userStr) : null;
        const membersId = user?.members_id || user?.member_id || user?.id || null;

        let trustsList = [];
        if (membersId) {
          const memberTrusts = await fetchMemberTrusts(membersId);
          trustsList = memberTrusts.filter((t) => t?.is_active !== false);
        }

        if (selectedTrustId) {
          const selectedFromMembership = trustsList.filter((t) => t?.id === selectedTrustId);
          if (selectedFromMembership.length) {
            trustsList = selectedFromMembership;
          } else {
            const fallbackTrust = await fetchTrustById(selectedTrustId);
            trustsList = fallbackTrust ? [fallbackTrust] : [];
          }
        } else if (!trustsList.length) {
          const fallbackTrust = await fetchTrustById(localStorage.getItem('selected_trust_id') || '');
          trustsList = fallbackTrust ? [fallbackTrust] : [];
        }

        const uniqueTrusts = [];
        const seen = new Set();
        trustsList.forEach((t) => {
          if (!t?.id || seen.has(t.id)) return;
          seen.add(t.id);
          uniqueTrusts.push(t);
        });

        setTrusts(uniqueTrusts);

        const sponsorEntries = await Promise.all(
          uniqueTrusts.map(async (trust) => {
            const res = await getSponsors(trust.id, trust.name);
            return [trust.id, res?.success ? res.data || [] : []];
          })
        );

        const sponsorMap = sponsorEntries.reduce((acc, [trustId, list]) => {
          acc[trustId] = list;
          return acc;
        }, {});

        setTrustSponsors(sponsorMap);
        try {
          localStorage.setItem(
            cacheKey,
            JSON.stringify({
              ts: Date.now(),
              trusts: uniqueTrusts,
              sponsorsByTrust: sponsorMap
            })
          );
        } catch {
          // ignore cache write failures
        }
      } catch (err) {
        console.error('Error loading sponsor list:', err);
        if (!cacheApplied) {
          setTrusts([]);
          setTrustSponsors({});
        }
      } finally {
        setIsLoading(false);
      }
    };

    loadTrustsAndSponsors();
  }, [selectedTrustId]);

  const openSponsor = (trust, sponsor) => {
    try {
      sessionStorage.setItem('selectedSponsor', JSON.stringify(sponsor));
    } catch {
      // ignore
    }
    if (trust?.id) localStorage.setItem('selected_trust_id', trust.id);
    if (trust?.name) localStorage.setItem('selected_trust_name', trust.name);
    onNavigate('sponsor-details');
  };

  return (
    <div className="min-h-screen" style={{ background: `linear-gradient(160deg, #ffffff 0%, ${theme.accentBg || '#f8fafc'} 48%, #ffffff 100%)` }}>
      <div className="theme-navbar backdrop-blur border-b px-5 py-4 flex items-center gap-3 sticky top-0 z-10">
        <button onClick={onBack} className="p-2 rounded-xl hover:bg-gray-100 transition-colors">
          <ArrowLeft className="h-5 w-5 text-gray-700" />
        </button>
        <div>
          <h1 className="text-lg font-extrabold" style={{ color: theme.secondary }}>Sponsors</h1>
          <p className="text-[11px] font-medium text-slate-400">Choose a sponsor to view details</p>
        </div>
      </div>

      <div className="px-4 py-4 space-y-4">
        {isLoading ? (
          <div className="rounded-2xl bg-white p-6 text-center border border-slate-200">
            <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin mx-auto" style={{ borderColor: theme.primary, borderTopColor: 'transparent' }} />
            <p className="text-xs font-semibold mt-2" style={{ color: theme.secondary }}>Loading sponsors...</p>
          </div>
        ) : sortedTrusts.length === 0 ? (
          <div className="rounded-2xl bg-white p-6 text-center border border-slate-200">
            <p className="text-sm font-semibold text-slate-600">No trusts available</p>
          </div>
        ) : (
          sortedTrusts.map((trust) => {
            const list = trustSponsors[trust.id] || [];
            if (!list.length) return null;
            return (
              <div
                key={trust.id}
                className="rounded-3xl p-[1px]"
                style={{
                  background: `linear-gradient(135deg, ${theme.primary}26 0%, ${theme.secondary}18 50%, ${theme.primary}14 100%)`,
                  boxShadow: `0 10px 24px ${theme.secondary}12`,
                }}
              >
                <div className="rounded-3xl bg-white/95 backdrop-blur px-3 py-3">
                  <div className="px-1 pb-2">
                    <p className="text-[11px] font-extrabold uppercase tracking-[0.18em]" style={{ color: theme.primary }}>
                      {trust.name || 'Trust Sponsors'}
                    </p>
                    {trust.remark && (
                      <p className="text-[10px] text-slate-400 mt-0.5 truncate">{trust.remark}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                {list.map((sponsor) => (
                  <button
                    key={sponsor.id}
                    onClick={() => openSponsor(trust, sponsor)}
                    className="w-full flex items-center gap-3 rounded-2xl px-3.5 py-3 text-left transition-all active:scale-[0.985]"
                    style={{
                      background: `linear-gradient(135deg, #ffffff 0%, ${theme.accentBg || '#f8fafc'} 100%)`,
                      border: `1px solid ${theme.primary}1F`,
                    }}
                  >
                    <div className="w-12 h-12 rounded-xl overflow-hidden flex items-center justify-center bg-slate-50 border border-slate-100 shadow-sm">
                      {sponsor.photo_url ? (
                        <img src={sponsor.photo_url} alt={sponsor.name} className="w-full h-full object-cover" />
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
                      className="w-7 h-7 rounded-xl flex items-center justify-center"
                      style={{ background: `linear-gradient(135deg, ${theme.primary} 0%, ${theme.secondary} 100%)` }}
                    >
                      <ChevronRight className="h-3.5 w-3.5 text-white" />
                    </div>
                  </button>
                ))}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default SponsorsList;


