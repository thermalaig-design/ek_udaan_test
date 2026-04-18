import { useState, useEffect } from 'react';
import { supabase } from '../services/supabaseClient';
import { DEFAULT_THEME, buildThemeFromTemplate } from '../utils/themeUtils';

const LAST_THEME_CACHE_KEY = 'last_theme_cache_v1';

const safeParse = (value) => {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

const resolveStoredTrustId = () => {
  const selected = String(localStorage.getItem('selected_trust_id') || '').trim();
  if (selected) return selected;
  const cachedDefault = safeParse(localStorage.getItem('default_trust_cache') || '');
  const fallback = String(cachedDefault?.id || '').trim();
  return fallback || '';
};

const readCachedTheme = (tid) => {
  if (!tid) return null;
  const parsed = safeParse(sessionStorage.getItem(`theme_cache_${tid}`) || '');
  return parsed && typeof parsed === 'object' ? parsed : null;
};

const readLastThemeCache = () => {
  const parsed = safeParse(localStorage.getItem(LAST_THEME_CACHE_KEY) || '');
  return parsed && typeof parsed === 'object' ? parsed : null;
};

export const useTheme = (trustId) => {
  const [theme, setTheme] = useState(() => {
    try {
      const resolvedTrustId = String(trustId || '').trim() || resolveStoredTrustId();
      return readCachedTheme(resolvedTrustId) || readLastThemeCache() || DEFAULT_THEME;
    } catch {
      return DEFAULT_THEME;
    }
  });
  const [isThemeLoading, setIsThemeLoading] = useState(false);

  useEffect(() => {
    const resolvedTrustId = String(trustId || '').trim() || resolveStoredTrustId();
    if (!resolvedTrustId) {
      setIsThemeLoading(false);
      return;
    }

    // Session cache - same trust pe dobara DB call nahi
    const cacheKey = `theme_cache_${resolvedTrustId}`;
    try {
      const cached = sessionStorage.getItem(cacheKey);
      if (cached) {
        setTheme(JSON.parse(cached));
        setIsThemeLoading(false);
        return;
      }
    } catch {
      // no-op
    }

    const load = async () => {
      setIsThemeLoading(true);
      try {
        const [templateResult, trustResult] = await Promise.all([
          supabase
            .from('app_templates')
            .select('id, trust_id, home_layout, animations, custom_css, template_key, theme_config, updated_at')
            .eq('trust_id', resolvedTrustId)
            .eq('is_active', true)
            .order('updated_at', { ascending: false })
            .limit(1)
            .maybeSingle(),
          supabase
            .from('Trust')
            .select('theme_overrides')
            .eq('id', resolvedTrustId)
            .maybeSingle()
        ]);

        const overrides = trustResult.data?.theme_overrides || {};
        const templateRow = templateResult.data || {
          id: null,
          trust_id: resolvedTrustId,
          home_layout: DEFAULT_THEME.homeLayout,
          animations: DEFAULT_THEME.animations,
          custom_css: '',
          template_key: DEFAULT_THEME.templateKey || 'mahila',
          theme_config: DEFAULT_THEME.themeConfig || {}
        };
        const resolved = buildThemeFromTemplate({
          templateRow,
          trustOverrides: overrides,
          trustId: resolvedTrustId
        });

        console.log('[useTheme] Loaded from DB:', {
          trustId: resolvedTrustId,
          template: templateResult.data || null,
          overrides,
          resolved,
          source: templateResult.data ? 'SUPABASE' : 'TRUST_OVERRIDES_ONLY'
        });

        sessionStorage.setItem(cacheKey, JSON.stringify(resolved));
        localStorage.setItem(LAST_THEME_CACHE_KEY, JSON.stringify(resolved));
        setTheme(resolved);
      } catch (err) {
        console.warn('useTheme failed:', err);
        setTheme((prev) => prev || { ...DEFAULT_THEME, trustId: resolvedTrustId });
      } finally {
        setIsThemeLoading(false);
      }
    };

    load();
  }, [trustId]);

  const clearThemeCache = (tid) => {
    try {
      sessionStorage.removeItem(`theme_cache_${tid || trustId}`);
    } catch {
      // no-op
    }
  };

  return { theme, isThemeLoading, clearThemeCache };
};
