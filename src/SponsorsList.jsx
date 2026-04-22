import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Building2, ChevronRight, Star } from 'lucide-react';
import { fetchTrustById } from './services/trustService';
import { useAppTheme } from './context/ThemeContext';
import {
  flattenListPages,
  getCachedListPage,
  getListPage,
  setPinnedSponsor,
  setSelectedSponsorId,
  sponsorConfig
} from './services/sponsorStore';

const SPONSOR_SCROLL_KEY = 'sponsor_list_scroll_top_v1';

const SponsorsList = ({ onNavigate, onBack }) => {
  const selectedTrustId = localStorage.getItem('selected_trust_id') || '';
  const theme = useAppTheme();

  const [trustName, setTrustName] = useState(localStorage.getItem('selected_trust_name') || 'Trust Sponsors');
  const [items, setItems] = useState([]);
  const [loadedPages, setLoadedPages] = useState([]);
  const [currentPage, setCurrentPage] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  const loadMoreRef = useRef(null);
  const lockRef = useRef(false);

  const refreshFromPages = useCallback((pages) => {
    if (!selectedTrustId) return;
    const merged = flattenListPages(selectedTrustId, pages, true);
    setItems(merged);
  }, [selectedTrustId]);

  const loadNextPage = useCallback(async () => {
    if (!selectedTrustId || !hasMore || isLoading || isLoadingMore || lockRef.current) return;

    lockRef.current = true;
    setIsLoadingMore(true);
    const nextPage = currentPage + 1;
    try {
      const cachedPage = getCachedListPage(selectedTrustId, nextPage);
      const pageRes = (cachedPage.sponsors.length > 0 && cachedPage.isFresh)
        ? { sponsors: cachedPage.sponsors, hasMore: cachedPage.sponsors.length === sponsorConfig.LIST_PAGE_SIZE }
        : await getListPage({ trustId: selectedTrustId, page: nextPage, pageSize: sponsorConfig.LIST_PAGE_SIZE });

      const hasItems = Array.isArray(pageRes.sponsors) && pageRes.sponsors.length > 0;
      if (!hasItems) {
        setHasMore(false);
        return;
      }
      setCurrentPage(nextPage);
      setLoadedPages((prev) => {
        const next = prev.includes(nextPage) ? prev : [...prev, nextPage];
        refreshFromPages(next);
        return next;
      });
      setHasMore(Boolean(pageRes.hasMore));
    } catch (err) {
      console.error('Error loading more sponsors:', err);
    } finally {
      lockRef.current = false;
      setIsLoadingMore(false);
    }
  }, [selectedTrustId, hasMore, isLoading, isLoadingMore, currentPage, refreshFromPages]);

  useEffect(() => {
    let active = true;
    const init = async () => {
      if (!selectedTrustId) {
        setItems([]);
        setIsLoading(false);
        setHasMore(false);
        return;
      }

      try {
        const trust = await fetchTrustById(selectedTrustId);
        if (active && trust?.name) setTrustName(trust.name);
      } catch {
        // ignore trust metadata failures
      }

      const cachedFirst = getCachedListPage(selectedTrustId, 1);
      if (cachedFirst.sponsors.length > 0) {
        setLoadedPages([1]);
        setCurrentPage(1);
        setHasMore(cachedFirst.sponsors.length === sponsorConfig.LIST_PAGE_SIZE);
        refreshFromPages([1]);
        setIsLoading(false);
        if (cachedFirst.isFresh) return;
      }

      try {
        const first = await getListPage({ trustId: selectedTrustId, page: 1, pageSize: sponsorConfig.LIST_PAGE_SIZE });
        if (!active) return;
        const hasItems = Array.isArray(first.sponsors) && first.sponsors.length > 0;
        setLoadedPages(hasItems ? [1] : []);
        setCurrentPage(hasItems ? 1 : 0);
        setHasMore(hasItems && Boolean(first.hasMore));
        refreshFromPages(hasItems ? [1] : []);
      } catch (err) {
        if (active) console.error('Error loading sponsor list page 1:', err);
      } finally {
        if (active) setIsLoading(false);
      }
    };

    init();
    return () => { active = false; };
  }, [selectedTrustId, refreshFromPages]);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(SPONSOR_SCROLL_KEY);
      const value = Number(raw || 0);
      if (Number.isFinite(value) && value > 0) {
        requestAnimationFrame(() => window.scrollTo(0, value));
      }
    } catch {
      // ignore
    }

    return () => {
      try { sessionStorage.setItem(SPONSOR_SCROLL_KEY, String(window.scrollY || 0)); } catch { /* ignore */ }
    };
  }, []);

  useEffect(() => {
    if (!loadMoreRef.current) return;
    const observer = new IntersectionObserver(
      async (entries) => {
        const first = entries[0];
        if (!first?.isIntersecting) return;
        if (!selectedTrustId || !hasMore || isLoading || isLoadingMore || lockRef.current) return;
        await loadNextPage();
      },
      { rootMargin: '160px 0px' }
    );

    observer.observe(loadMoreRef.current);
    return () => observer.disconnect();
  }, [selectedTrustId, hasMore, isLoading, isLoadingMore, loadNextPage]);

  useEffect(() => {
    if (!selectedTrustId || isLoading || isLoadingMore || !hasMore || lockRef.current) return;
    if (loadedPages.length === 0) return;
    if (!(items.length > 0 && items.length < sponsorConfig.LIST_PAGE_SIZE)) return;

    const timer = setTimeout(() => {
      void loadNextPage();
    }, 80);

    return () => clearTimeout(timer);
  }, [selectedTrustId, isLoading, isLoadingMore, hasMore, items.length, loadedPages.length, loadNextPage]);

  const list = useMemo(() => items, [items]);

  const openSponsor = (sponsor) => {
    if (!sponsor?.id) return;
    setSelectedSponsorId(sponsor.id);
    setPinnedSponsor(selectedTrustId, sponsor.id);
    onNavigate('sponsor-details');
  };

  return (
    <div className="min-h-screen" style={{ background: 'var(--page-bg, var(--app-page-bg))' }}>
      <div className="theme-navbar backdrop-blur border-b px-5 py-4 flex items-center gap-3 sticky top-0 z-10">
        <button onClick={onBack} className="p-2 rounded-xl transition-colors" style={{ background: 'color-mix(in srgb, var(--app-accent-bg) 45%, transparent)' }}>
          <ArrowLeft className="h-5 w-5" style={{ color: 'var(--navbar-text)' }} />
        </button>
        <div>
          <h1 className="text-lg font-extrabold" style={{ color: 'var(--navbar-text)' }}>Sponsors</h1>
          <p className="text-[11px] font-medium" style={{ color: 'var(--body-text-color)' }}>{trustName}</p>
        </div>
      </div>

      <div className="px-4 py-4 space-y-4">
        {isLoading ? (
          <div className="rounded-2xl p-6 text-center" style={{ background: 'color-mix(in srgb, #ffffff 88%, var(--app-accent-bg))', border: '1px solid color-mix(in srgb, var(--brand-navy) 10%, transparent)' }}>
            <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin mx-auto" style={{ borderColor: theme.primary, borderTopColor: 'transparent' }} />
            <p className="text-xs font-semibold mt-2" style={{ color: theme.secondary }}>Loading sponsors...</p>
          </div>
        ) : list.length === 0 ? (
          <div className="rounded-2xl p-6 text-center" style={{ background: 'color-mix(in srgb, #ffffff 88%, var(--app-accent-bg))', border: '1px solid color-mix(in srgb, var(--brand-navy) 10%, transparent)' }}>
            <p className="text-sm font-semibold" style={{ color: 'var(--body-text-color)' }}>No active sponsors available</p>
          </div>
        ) : (
          <div
            className="rounded-3xl p-[1px]"
            style={{
              background: `linear-gradient(135deg, ${theme.primary}26 0%, ${theme.secondary}18 50%, ${theme.primary}14 100%)`,
              boxShadow: `0 10px 24px ${theme.secondary}12`,
            }}
          >
            <div className="rounded-3xl backdrop-blur px-3 py-3" style={{ background: 'color-mix(in srgb, #ffffff 95%, var(--app-accent-bg))' }}>
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
                    <div className="w-12 h-12 rounded-xl overflow-hidden flex items-center justify-center bg-slate-50 border border-slate-100 shadow-sm">
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
        )}

        <div ref={loadMoreRef} className="h-8 flex items-center justify-center">
          {isLoadingMore ? (
            <div className="w-5 h-5 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: theme.primary, borderTopColor: 'transparent' }} />
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default SponsorsList;
