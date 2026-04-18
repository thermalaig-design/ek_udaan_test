import { useState, useEffect } from 'react';
import { supabase } from '../services/supabaseClient';
import { DEFAULT_THEME, buildThemeFromTemplate } from '../utils/themeUtils';

export const useTheme = (trustId) => {
  const [theme, setTheme] = useState(DEFAULT_THEME);
  const [isThemeLoading, setIsThemeLoading] = useState(true);

  useEffect(() => {
    if (!trustId) {
      setTheme(DEFAULT_THEME);
      setIsThemeLoading(false);
      return;
    }

    // Session cache - same trust pe dobara DB call nahi
    const cacheKey = `theme_cache_${trustId}`;
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
            .eq('trust_id', trustId)
            .eq('is_active', true)
            .order('updated_at', { ascending: false })
            .limit(1)
            .maybeSingle(),
          supabase
            .from('Trust')
            .select('theme_overrides')
            .eq('id', trustId)
            .maybeSingle()
        ]);

        const overrides = trustResult.data?.theme_overrides || {};
        const templateRow = templateResult.data || {
          id: null,
          trust_id: trustId,
          home_layout: DEFAULT_THEME.homeLayout,
          animations: DEFAULT_THEME.animations,
          custom_css: '',
          template_key: DEFAULT_THEME.templateKey || 'mahila',
          theme_config: DEFAULT_THEME.themeConfig || {}
        };
        const resolved = buildThemeFromTemplate({
          templateRow,
          trustOverrides: overrides,
          trustId
        });

        console.log('[useTheme] Loaded from DB:', {
          trustId,
          template: templateResult.data || null,
          overrides,
          resolved,
          source: templateResult.data ? 'SUPABASE' : 'TRUST_OVERRIDES_ONLY'
        });

        sessionStorage.setItem(cacheKey, JSON.stringify(resolved));
        setTheme(resolved);
      } catch (err) {
        console.warn('useTheme failed:', err);
        setTheme({ ...DEFAULT_THEME, trustId });
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
