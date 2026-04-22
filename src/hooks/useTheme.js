import { useState, useEffect, useRef } from 'react';
import { supabase } from '../services/supabaseClient';
import {
  DEFAULT_THEME,
  buildThemeFromTemplate,
  mergeResolvedThemes,
  sanitizeCustomCss
} from '../utils/themeUtils';

const LAST_THEME_CACHE_KEY = 'last_theme_cache_v1';
const BASE_TRUST_ID = import.meta.env.VITE_DEFAULT_TRUST_ID || 'b353d2ff-ec3b-4b90-a896-69f40662084e';
const THEME_CACHE_TTL_MS = Number(import.meta.env.VITE_THEME_CACHE_TTL_MS) > 0
  ? Number(import.meta.env.VITE_THEME_CACHE_TTL_MS)
  : (import.meta.env.DEV ? 5 * 60 * 1000 : 20 * 60 * 1000);
const THEME_CACHE_VALIDATE_INTERVAL_MS = Number(import.meta.env.VITE_THEME_CACHE_VALIDATE_INTERVAL_MS) > 0
  ? Number(import.meta.env.VITE_THEME_CACHE_VALIDATE_INTERVAL_MS)
  : (import.meta.env.DEV ? 30 * 1000 : 2 * 60 * 1000);

const safeParse = (value) => {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

const isPlainObject = (value) =>
  Object.prototype.toString.call(value) === '[object Object]';

const deepMergeObjects = (base, override) => {
  if (!isPlainObject(base)) return isPlainObject(override) ? { ...override } : {};
  if (!isPlainObject(override)) return { ...base };
  const next = { ...base };
  Object.keys(override).forEach((key) => {
    const baseValue = base[key];
    const overrideValue = override[key];
    if (isPlainObject(baseValue) && isPlainObject(overrideValue)) {
      next[key] = deepMergeObjects(baseValue, overrideValue);
      return;
    }
    next[key] = overrideValue;
  });
  return next;
};

const parseJsonObject = (value, fallback = {}) => {
  if (isPlainObject(value)) return value;
  if (typeof value !== 'string') return fallback;
  const parsed = safeParse(value);
  return isPlainObject(parsed) ? parsed : fallback;
};

const tagThemeSource = (theme, source) => {
  if (!theme || typeof theme !== 'object') return theme;
  return { ...theme, themeLoadSource: source };
};

const resolveStoredTrustId = () => {
  const selected = String(localStorage.getItem('selected_trust_id') || '').trim();
  if (selected) return selected;
  const cachedDefault = safeParse(localStorage.getItem('default_trust_cache') || '');
  const fallback = String(cachedDefault?.id || '').trim();
  return fallback || '';
};

const readCachedThemeEntry = (tid) => {
  if (!tid) return null;
  const parsed = safeParse(sessionStorage.getItem(`theme_cache_${tid}`) || '');
  if (!parsed || typeof parsed !== 'object') return null;

  // Backward compatibility for old cache shape (raw theme object)
  if (parsed.theme && typeof parsed.theme === 'object') {
    return {
      theme: parsed.theme,
      ts: Number(parsed.ts) || 0
    };
  }
  return {
    theme: parsed,
    ts: 0
  };
};

const readLastThemeCache = (trustId) => {
  const parsed = safeParse(localStorage.getItem(LAST_THEME_CACHE_KEY) || '');
  if (!parsed || typeof parsed !== 'object') return null;
  if (!trustId) return parsed;
  const cachedTrustId = String(parsed.selectedTrustId || parsed.trustId || '').trim();
  return cachedTrustId && cachedTrustId === trustId ? parsed : null;
};

const isStale = (timestamp) => {
  const ts = Number(timestamp) || 0;
  if (!ts) return true;
  return (Date.now() - ts) > THEME_CACHE_TTL_MS;
};

const writeThemeCache = (trustId, theme) => {
  if (!trustId || !theme) return;
  const payload = {
    theme,
    ts: Date.now()
  };
  sessionStorage.setItem(`theme_cache_${trustId}`, JSON.stringify(payload));
  localStorage.setItem(LAST_THEME_CACHE_KEY, JSON.stringify(theme));
};

const fetchTemplateAndOverrides = async (targetTrustId) => {
  if (!targetTrustId) return { template: null, overrides: {} };
  const [templateResult, trustResult] = await Promise.all([
    supabase
      .from('app_templates')
      .select('id, trust_id, name, template_key, is_active, theme_config, home_layout, animations, custom_css, updated_at')
      .eq('trust_id', targetTrustId)
      .eq('is_active', true)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('Trust')
      .select('theme_overrides')
      .eq('id', targetTrustId)
      .maybeSingle()
  ]);

  return {
    template: templateResult?.data || null,
    overrides: trustResult?.data?.theme_overrides || {}
  };
};

const fetchTemplateMeta = async (targetTrustId) => {
  if (!targetTrustId) return null;
  const result = await supabase
    .from('app_templates')
    .select('id, trust_id, updated_at')
    .eq('trust_id', targetTrustId)
    .eq('is_active', true)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return result?.data || null;
};

export const useTheme = (trustId) => {
  const [refreshTick, setRefreshTick] = useState(0);
  const isCacheValidationInFlightRef = useRef(false);
  const hasQueuedRefreshRef = useRef(false);
  const [theme, setTheme] = useState(() => {
    try {
      const resolvedTrustId = String(trustId || '').trim() || resolveStoredTrustId();
      return readCachedThemeEntry(resolvedTrustId)?.theme || readLastThemeCache(resolvedTrustId) || DEFAULT_THEME;
    } catch {
      return DEFAULT_THEME;
    }
  });
  const [isThemeLoading, setIsThemeLoading] = useState(false);

  useEffect(() => {
    const resolvedTrustId = String(trustId || '').trim() || resolveStoredTrustId();
    let validationIntervalId = null;
    if (!resolvedTrustId) {
      setIsThemeLoading(false);
      return undefined;
    }

    const validateCacheInBackground = async (cachedTheme) => {
      if (isCacheValidationInFlightRef.current) return;
      isCacheValidationInFlightRef.current = true;
      try {
        const isBaseTrustSelected = resolvedTrustId === BASE_TRUST_ID;
        const [latestBase, latestSelected] = await Promise.all([
          fetchTemplateMeta(BASE_TRUST_ID),
          isBaseTrustSelected ? Promise.resolve(null) : fetchTemplateMeta(resolvedTrustId)
        ]);
        const cachedBaseUpdatedAt = cachedTheme?.baseTemplateUpdatedAt || null;
        const cachedSelectedUpdatedAt = cachedTheme?.selectedTemplateUpdatedAt || null;
        const shouldReloadBase = Boolean(latestBase?.updated_at) && latestBase.updated_at !== cachedBaseUpdatedAt;
        const shouldReloadSelected = Boolean(latestSelected?.updated_at) && latestSelected.updated_at !== cachedSelectedUpdatedAt;

        console.log('[useTheme] Cache validation:', {
          selectedTrustId: resolvedTrustId,
          latestBaseTemplateUpdatedAt: latestBase?.updated_at || null,
          latestSelectedTemplateUpdatedAt: latestSelected?.updated_at || null,
          cachedBaseUpdatedAt,
          cachedSelectedUpdatedAt,
          cacheOutdated: shouldReloadBase || shouldReloadSelected
        });

        if ((shouldReloadBase || shouldReloadSelected) && !hasQueuedRefreshRef.current) {
          hasQueuedRefreshRef.current = true;
          setRefreshTick((prev) => prev + 1);
        }
      } catch (err) {
        console.warn('[useTheme] Cache validation failed:', err);
      } finally {
        isCacheValidationInFlightRef.current = false;
      }
    };

    // Cache-first apply for instant paint
    const cachedEntry = readCachedThemeEntry(resolvedTrustId);
    const hasCachedTheme = Boolean(cachedEntry?.theme);
    const shouldRefreshFromDb = !hasCachedTheme || isStale(cachedEntry?.ts);
    try {
      if (hasCachedTheme) {
        const cachedTheme = tagThemeSource(cachedEntry.theme, 'cache');
        setTheme(cachedTheme);
        if (import.meta.env.DEV) {
          console.log('[useTheme] Cache hit:', {
            selectedTrustId: resolvedTrustId,
            cacheKey: `theme_cache_${resolvedTrustId}`,
            cachedAt: cachedEntry?.ts ? new Date(cachedEntry.ts).toISOString() : null,
            cachedTemplateId: cachedTheme?.templateId || null,
            cachedTemplateUpdatedAt: cachedTheme?.templateUpdatedAt || null,
            cachedBaseTemplateUpdatedAt: cachedTheme?.baseTemplateUpdatedAt || null,
            cachedSelectedTemplateUpdatedAt: cachedTheme?.selectedTemplateUpdatedAt || null
          });
        }
        if (!shouldRefreshFromDb) {
          setIsThemeLoading(false);
          void validateCacheInBackground(cachedTheme);
          validationIntervalId = window.setInterval(() => {
            const latestCachedRaw = readCachedThemeEntry(resolvedTrustId)?.theme || cachedEntry.theme;
            const latestCached = tagThemeSource(latestCachedRaw, 'cache');
            void validateCacheInBackground(latestCached);
          }, THEME_CACHE_VALIDATE_INTERVAL_MS);
          return () => {
            if (validationIntervalId) window.clearInterval(validationIntervalId);
          };
        }
      }
    } catch {
      // no-op
    }

    const load = async ({ silent = false } = {}) => {
      if (!silent) setIsThemeLoading(true);
      hasQueuedRefreshRef.current = false;
      try {
        const isBaseTrustSelected = resolvedTrustId === BASE_TRUST_ID;
        const [baseResult, selectedResult] = await Promise.all([
          fetchTemplateAndOverrides(BASE_TRUST_ID),
          isBaseTrustSelected
            ? Promise.resolve(null)
            : fetchTemplateAndOverrides(resolvedTrustId)
        ]);

        const baseTheme = baseResult?.template
          ? buildThemeFromTemplate({
            templateRow: baseResult.template,
            trustOverrides: baseResult.overrides,
            trustId: BASE_TRUST_ID
          })
          : { ...DEFAULT_THEME, trustId: BASE_TRUST_ID };

        const selectedTheme = isBaseTrustSelected
          ? null
          : (selectedResult?.template
            ? buildThemeFromTemplate({
              templateRow: selectedResult.template,
              trustOverrides: selectedResult.overrides,
              trustId: resolvedTrustId
            })
            : null);

        const resolved = mergeResolvedThemes(baseTheme, selectedTheme);
        resolved.customCss = sanitizeCustomCss(resolved.customCss);
        resolved.baseTemplateUpdatedAt = baseResult?.template?.updated_at || null;
        resolved.selectedTemplateUpdatedAt = selectedResult?.template?.updated_at || null;
        resolved.selectedTrustId = resolvedTrustId;
        const baseThemeConfigRaw = deepMergeObjects(
          parseJsonObject(baseResult?.template?.theme_config, {}),
          parseJsonObject(baseResult?.overrides, {})
        );
        const selectedThemeConfigRaw = deepMergeObjects(
          parseJsonObject(selectedResult?.template?.theme_config, {}),
          parseJsonObject(selectedResult?.overrides, {})
        );
        resolved.baseThemeConfigRaw = baseThemeConfigRaw;
        resolved.selectedThemeConfigRaw = selectedThemeConfigRaw;
        resolved.themeLoadSource = 'db';

        console.log('[useTheme] Loaded from DB:', {
          selectedTrustId: resolvedTrustId,
          baseTrustId: BASE_TRUST_ID,
          baseTemplateId: baseResult?.template?.id || null,
          selectedTemplateId: selectedResult?.template?.id || null,
          selectedTemplateTrustId: selectedResult?.template?.trust_id || null,
          baseThemeApplied: Boolean(baseResult?.template),
          selectedThemeApplied: Boolean(selectedResult?.template) || isBaseTrustSelected,
          usedHardcodedFallback: !baseResult?.template && !selectedResult?.template,
          fetchedBaseTemplateUpdatedAt: baseResult?.template?.updated_at || null,
          fetchedSelectedTemplateUpdatedAt: selectedResult?.template?.updated_at || null,
          cachedTemplateUpdatedAt: cachedEntry?.theme?.templateUpdatedAt || null,
          replacedCachedTheme: Boolean(cachedEntry?.theme) && (
            cachedEntry?.theme?.baseTemplateUpdatedAt !== (baseResult?.template?.updated_at || null)
            || cachedEntry?.theme?.selectedTemplateUpdatedAt !== (selectedResult?.template?.updated_at || null)
          ),
          homeLayout: resolved.homeLayout,
          animations: resolved.animations,
          finalTheme: resolved
        });

        writeThemeCache(resolvedTrustId, resolved);
        setTheme(tagThemeSource(resolved, 'db'));
      } catch (err) {
        console.warn('useTheme failed:', err);
        setTheme((prev) => prev || { ...DEFAULT_THEME, trustId: BASE_TRUST_ID });
      } finally {
        if (!silent) setIsThemeLoading(false);
      }
    };

    load();
    return () => {
      if (validationIntervalId) window.clearInterval(validationIntervalId);
    };
  }, [trustId, refreshTick]);

  const clearThemeCache = (tid) => {
    try {
      sessionStorage.removeItem(`theme_cache_${tid || trustId}`);
    } catch {
      // no-op
    }
  };

  const refreshTheme = () => {
    const targetTrustId = String(trustId || '').trim() || resolveStoredTrustId();
    clearThemeCache(targetTrustId);
    hasQueuedRefreshRef.current = false;
    setRefreshTick((prev) => prev + 1);
  };

  return { theme, isThemeLoading, clearThemeCache, refreshTheme };
};
