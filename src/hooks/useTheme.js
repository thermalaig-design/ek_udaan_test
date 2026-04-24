import { useState, useEffect, useRef } from 'react';
import { supabase } from '../services/supabaseClient';
import {
  DEFAULT_THEME,
  buildThemeFromTemplate,
  mergeResolvedThemes,
  sanitizeCustomCss,
  getThemeToken
} from '../utils/themeUtils';
import {
  THEME_TEMPLATE_APPLIED_EVENT,
  dispatchThemeRefresh,
  dispatchThemeTemplateApplied
} from '../utils/themeEvents';

const LAST_THEME_CACHE_KEY = 'last_theme_cache_v2';
const LEGACY_LAST_THEME_CACHE_KEY = 'last_theme_cache_v1';
const BASE_TRUST_ID = import.meta.env.VITE_DEFAULT_TRUST_ID || 'b353d2ff-ec3b-4b90-a896-69f40662084e';
const THEME_CACHE_TTL_MS = Number(import.meta.env.VITE_THEME_CACHE_TTL_MS) > 0
  ? Number(import.meta.env.VITE_THEME_CACHE_TTL_MS)
  : (import.meta.env.DEV ? 5 * 60 * 1000 : 20 * 60 * 1000);

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

const getTrustCacheIndexKey = (trustId) => `theme_cache_trust_v2_${trustId}`;
const getThemeCacheEntryKey = (trustId, templateId) => `theme_cache_v2_${trustId}_${templateId || 'none'}`;
const normalizeTemplateMetaValue = (value) => String(value || '').trim() || null;

const readLastThemeCache = (trustId) => {
  const parsedV2 = safeParse(localStorage.getItem(LAST_THEME_CACHE_KEY) || '');
  const parsed = parsedV2 || safeParse(localStorage.getItem(LEGACY_LAST_THEME_CACHE_KEY) || '');
  if (!parsed || typeof parsed !== 'object') return null;
  if (!trustId) return parsed;
  const cachedTrustId = String(parsed.selectedTrustId || parsed.trustId || '').trim();
  return cachedTrustId && cachedTrustId === trustId ? parsed : null;
};

const readCachedThemeEntry = (trustId) => {
  if (!trustId) return null;

  const indexKey = getTrustCacheIndexKey(trustId);
  const activeEntryKey = sessionStorage.getItem(indexKey);
  if (activeEntryKey) {
    const parsed = safeParse(sessionStorage.getItem(activeEntryKey) || '');
    if (parsed && typeof parsed === 'object' && parsed.theme && typeof parsed.theme === 'object') {
      return {
        theme: parsed.theme,
        ts: Number(parsed.ts) || 0,
        templateId: parsed.templateId || null,
        cacheKey: activeEntryKey
      };
    }
  }

  const legacyParsed = safeParse(sessionStorage.getItem(`theme_cache_${trustId}`) || '');
  if (!legacyParsed || typeof legacyParsed !== 'object') return null;

  if (legacyParsed.theme && typeof legacyParsed.theme === 'object') {
    return {
      theme: legacyParsed.theme,
      ts: Number(legacyParsed.ts) || 0,
      templateId: legacyParsed.theme?.selectedTrustTemplateId || legacyParsed.theme?.templateId || null,
      cacheKey: `theme_cache_${trustId}`
    };
  }

  return {
    theme: legacyParsed,
    ts: 0,
    templateId: legacyParsed?.selectedTrustTemplateId || legacyParsed?.templateId || null,
    cacheKey: `theme_cache_${trustId}`
  };
};

const isStale = (timestamp) => {
  const ts = Number(timestamp) || 0;
  if (!ts) return true;
  return (Date.now() - ts) > THEME_CACHE_TTL_MS;
};

const clearThemeCacheForTrust = (trustId) => {
  if (!trustId) return;
  const trustPrefix = `theme_cache_v2_${trustId}_`;
  const indexKey = getTrustCacheIndexKey(trustId);
  const keysToRemove = [];

  for (let i = 0; i < sessionStorage.length; i += 1) {
    const key = sessionStorage.key(i);
    if (!key) continue;
    if (key === indexKey || key === `theme_cache_${trustId}` || key.startsWith(trustPrefix)) {
      keysToRemove.push(key);
    }
  }

  keysToRemove.forEach((key) => sessionStorage.removeItem(key));

  // Also clear localStorage last-theme cache so stale data doesn't
  // persist across sessions after a template change.
  try {
    const stored = safeParse(localStorage.getItem(LAST_THEME_CACHE_KEY) || '');
    const storedTrustId = String(stored?.selectedTrustId || stored?.trustId || '').trim();
    if (storedTrustId === trustId) {
      localStorage.removeItem(LAST_THEME_CACHE_KEY);
    }
  } catch {
    // no-op
  }
};

const writeThemeCache = (trustId, theme) => {
  if (!trustId || !theme) return;
  const templateId = String(theme?.selectedTrustTemplateId || theme?.templateId || 'none');
  const entryKey = getThemeCacheEntryKey(trustId, templateId);
  const payload = {
    trustId,
    templateId,
    ts: Date.now(),
    theme
  };

  sessionStorage.setItem(entryKey, JSON.stringify(payload));
  sessionStorage.setItem(getTrustCacheIndexKey(trustId), entryKey);
  localStorage.setItem(LAST_THEME_CACHE_KEY, JSON.stringify({
    ...theme,
    selectedTrustId: trustId,
    selectedTrustTemplateId: templateId,
    themeLoadSource: 'cache'
  }));
};

const hasTemplateMetaChanged = ({ cachedTemplateId, cachedTemplateUpdatedAt, latestMeta }) => {
  const latestTemplateId = normalizeTemplateMetaValue(latestMeta?.trustTemplateId);
  const latestTemplateUpdatedAt = latestMeta?.linkedTemplateUpdatedAt || null;

  return latestTemplateId !== normalizeTemplateMetaValue(cachedTemplateId)
    || latestTemplateUpdatedAt !== (cachedTemplateUpdatedAt || null);
};

const fetchTrustThemeLink = async (targetTrustId) => {
  if (!targetTrustId) {
    return {
      trust: null,
      template: null,
      overrides: {},
      linkSource: 'missing_trust'
    };
  }

  const isMissingThemeOverridesColumnError = (error) =>
    /column\s+Trust\.theme_overrides\s+does not exist/i.test(String(error?.message || ''))
    || /column\s+theme_overrides\s+does not exist/i.test(String(error?.message || ''));

  let trustResult = await supabase
    .from('Trust')
    .select('id, name, template_id, theme_overrides')
    .eq('id', targetTrustId)
    .maybeSingle();

  // Backward compatibility: some Trust schemas do not have `theme_overrides`.
  // In that case, retry without this column so template linking still works.
  if (trustResult?.error && isMissingThemeOverridesColumnError(trustResult.error)) {
    trustResult = await supabase
      .from('Trust')
      .select('id, name, template_id')
      .eq('id', targetTrustId)
      .maybeSingle();
  }

  if (trustResult?.error) {
    return {
      trust: null,
      template: null,
      overrides: {},
      linkSource: 'trust_query_error',
      error: trustResult.error
    };
  }

  const trust = trustResult?.data || null;
  if (!trust) {
    return {
      trust: null,
      template: null,
      overrides: {},
      linkSource: 'missing_trust'
    };
  }

  const linkedTemplateId = trust.template_id || null;
  if (!linkedTemplateId) {
    if (import.meta.env.DEV) {
      console.log('[useTheme][TemplateLink][Fetch]', {
        trustId: targetTrustId,
        trustTemplateId: null,
        fetchedTemplateId: null,
        fetchedTemplateUpdatedAt: null,
        fetchedTemplateIsActive: null,
        linkSource: 'no_template_link'
      });
    }
    return {
      trust,
      template: null,
      overrides: trust.theme_overrides || {},
      linkSource: 'no_template_link'
    };
  }

  const templateResult = await supabase
    .from('app_templates')
    .select('id, trust_id, name, template_key, theme_config, home_layout, animations, custom_css, updated_at')
    .eq('id', linkedTemplateId)
    .maybeSingle();

  if (templateResult?.error) {
    return {
      trust,
      template: null,
      overrides: trust.theme_overrides || {},
      linkSource: 'linked_template_query_error',
      error: templateResult.error
    };
  }

  const template = templateResult?.data || null;
  if (import.meta.env.DEV) {
    console.log('[useTheme][TemplateLink][Fetch]', {
      trustId: targetTrustId,
      trustTemplateId: linkedTemplateId,
      fetchedTemplateId: template?.id || null,
      fetchedTemplateUpdatedAt: template?.updated_at || null,
      linkSource: !template
        ? 'invalid_template_link'
        : 'linked_template'
    });
  }
  return {
    trust,
    template: template,
    overrides: trust.theme_overrides || {},
    linkSource: !template
      ? 'invalid_template_link'
      : 'linked_template'
  };
};

const fetchTrustTemplateMeta = async (targetTrustId) => {
  if (!targetTrustId) return null;

  const trustResult = await supabase
    .from('Trust')
    .select('id, name, template_id')
    .eq('id', targetTrustId)
    .maybeSingle();

  if (trustResult?.error) {
    return {
      trustId: targetTrustId,
      trustName: null,
      trustTemplateId: null,
      trustUpdatedAt: null,
      linkedTemplateId: null,
      linkedTemplateUpdatedAt: null,
      linkedTemplateName: null,
      templateExists: false,
      source: 'trust_meta_error'
    };
  }

  const trust = trustResult?.data || null;
  if (!trust) {
    return {
      trustId: targetTrustId,
      trustName: null,
      trustTemplateId: null,
      trustUpdatedAt: null,
      linkedTemplateId: null,
      linkedTemplateUpdatedAt: null,
      linkedTemplateName: null,
      templateExists: false
    };
  }

  const linkedTemplateId = trust.template_id || null;
  if (!linkedTemplateId) {
    return {
      trustId: trust.id,
      trustName: trust.name || null,
      trustTemplateId: null,
      trustUpdatedAt: null,
      linkedTemplateId: null,
      linkedTemplateUpdatedAt: null,
      linkedTemplateName: null,
      templateExists: false
    };
  }

  const templateResult = await supabase
    .from('app_templates')
    .select('id, name, updated_at')
    .eq('id', linkedTemplateId)
    .maybeSingle();

  const template = templateResult?.data || null;

  return {
    trustId: trust.id,
    trustName: trust.name || null,
    trustTemplateId: linkedTemplateId,
    trustUpdatedAt: null,
    linkedTemplateId,
    linkedTemplateUpdatedAt: template?.updated_at || null,
    linkedTemplateName: template?.name || null,
    templateExists: Boolean(template?.id)
  };
};

export const useTheme = (trustId) => {
  const [refreshTick, setRefreshTick] = useState(0);
  const isCacheValidationInFlightRef = useRef(false);
  const hasQueuedRefreshRef = useRef(false);
  const previousTrustIdRef = useRef(null);
  const initialThemeStateRef = useRef(null);
  if (!initialThemeStateRef.current) {
    try {
      const resolvedTrustId = String(trustId || '').trim() || resolveStoredTrustId();
      const immediateTheme = readCachedThemeEntry(resolvedTrustId)?.theme || readLastThemeCache(resolvedTrustId) || null;
      initialThemeStateRef.current = {
        theme: immediateTheme || DEFAULT_THEME,
        hasImmediateTheme: Boolean(immediateTheme),
        resolvedTrustId
      };
    } catch {
      initialThemeStateRef.current = {
        theme: DEFAULT_THEME,
        hasImmediateTheme: false,
        resolvedTrustId: ''
      };
    }
  }
  const [theme, setTheme] = useState(() => initialThemeStateRef.current.theme);
  const [isThemeLoading, setIsThemeLoading] = useState(() => {
    const initialState = initialThemeStateRef.current;
    if (!initialState?.resolvedTrustId) return false;
    return !initialState.hasImmediateTheme;
  });

  useEffect(() => {
    const resolvedTrustId = String(trustId || '').trim() || resolveStoredTrustId();
    const previousTrustId = previousTrustIdRef.current;
    previousTrustIdRef.current = resolvedTrustId || null;
    if (!resolvedTrustId) {
      setIsThemeLoading(false);
      return undefined;
    }

    if (import.meta.env.DEV) {
      console.log('[useTheme][TemplateLink] Trust context resolved:', {
        previousTrustId: previousTrustId || null,
        selectedTrustId: resolvedTrustId
      });
    }

    const validateCacheInBackground = async (cachedTheme) => {
      if (isCacheValidationInFlightRef.current) return;
      isCacheValidationInFlightRef.current = true;
      try {
        const isBaseTrustSelected = resolvedTrustId === BASE_TRUST_ID;
        const [latestBaseMeta, latestSelectedMeta] = await Promise.all([
          fetchTrustTemplateMeta(BASE_TRUST_ID),
          isBaseTrustSelected ? Promise.resolve(null) : fetchTrustTemplateMeta(resolvedTrustId)
        ]);

        const cachedBaseTemplateId = String(cachedTheme?.baseTrustTemplateId || '').trim() || null;
        const cachedSelectedTemplateId = String(cachedTheme?.selectedTrustTemplateId || '').trim() || null;
        const cachedBaseTemplateUpdatedAt = cachedTheme?.baseTemplateUpdatedAt || null;
        const cachedSelectedTemplateUpdatedAt = cachedTheme?.selectedTemplateUpdatedAt || null;

        const shouldReloadBase = hasTemplateMetaChanged({
          cachedTemplateId: cachedBaseTemplateId,
          cachedTemplateUpdatedAt: cachedBaseTemplateUpdatedAt,
          latestMeta: latestBaseMeta
        });

        const shouldReloadSelected = isBaseTrustSelected
          ? false
          : hasTemplateMetaChanged({
            cachedTemplateId: cachedSelectedTemplateId,
            cachedTemplateUpdatedAt: cachedSelectedTemplateUpdatedAt,
            latestMeta: latestSelectedMeta
          });

        const cacheOutdated = shouldReloadBase || shouldReloadSelected;

        if (import.meta.env.DEV) {
          console.log('[useTheme][TemplateLink][CacheValidation]', {
            selectedTrustId: resolvedTrustId,
            selectedTrustTemplateId: latestSelectedMeta?.trustTemplateId || null,
            baseTrustTemplateId: latestBaseMeta?.trustTemplateId || null,
            linkedSelectedTemplateId: latestSelectedMeta?.linkedTemplateId || null,
            linkedSelectedTemplateName: latestSelectedMeta?.linkedTemplateName || null,
            linkedBaseTemplateId: latestBaseMeta?.linkedTemplateId || null,
            linkedBaseTemplateName: latestBaseMeta?.linkedTemplateName || null,
            cachedSelectedTemplateId,
            cachedBaseTemplateId,
            cacheOutdated
          });
        }

        if (cacheOutdated && !hasQueuedRefreshRef.current) {
          hasQueuedRefreshRef.current = true;
          clearThemeCacheForTrust(resolvedTrustId);
          setRefreshTick((prev) => prev + 1);
        }
      } catch (err) {
        console.warn('[useTheme][TemplateLink] Cache validation failed:', err);
      } finally {
        isCacheValidationInFlightRef.current = false;
      }
    };

    const cachedEntry = readCachedThemeEntry(resolvedTrustId);
    const hasCachedTheme = Boolean(cachedEntry?.theme);
    const shouldRefreshFromDb = !hasCachedTheme || isStale(cachedEntry?.ts);

    try {
      if (hasCachedTheme) {
        const cachedTheme = tagThemeSource(cachedEntry.theme, 'cache');
        setTheme(cachedTheme);
        setIsThemeLoading(false);

        if (import.meta.env.DEV) {
          console.log('[useTheme][TemplateLink] Cache hit:', {
            selectedTrustId: resolvedTrustId,
            cacheKey: cachedEntry?.cacheKey || null,
            cachedAt: cachedEntry?.ts ? new Date(cachedEntry.ts).toISOString() : null,
            selectedTrustTemplateId: cachedTheme?.selectedTrustTemplateId || null,
            baseTrustTemplateId: cachedTheme?.baseTrustTemplateId || null,
            linkedTemplateId: cachedTheme?.templateId || null,
            linkedTemplateName: cachedTheme?.template?.name || null,
            navbarTextColor: getThemeToken(cachedTheme, 'navbar.text_color', null),
            source: 'cache'
          });
        }

        if (!shouldRefreshFromDb) {
          const verifyTemplateLink = async () => {
            try {
              const isBaseTrust = resolvedTrustId === BASE_TRUST_ID;

              // Fetch selected AND base trust meta in parallel so a base-template
              // change is detected immediately even when the user is on a non-base trust.
              const [latestSelectedMeta, latestBaseMeta] = await Promise.all([
                fetchTrustTemplateMeta(resolvedTrustId),
                isBaseTrust ? Promise.resolve(null) : fetchTrustTemplateMeta(BASE_TRUST_ID)
              ]);

              const cachedSelectedTemplateId = String(cachedTheme?.selectedTrustTemplateId || '').trim() || null;
              const latestSelectedTemplateId = String(latestSelectedMeta?.trustTemplateId || '').trim() || null;
              const selectedChanged = cachedSelectedTemplateId !== latestSelectedTemplateId;

              // For non-base trust users: also check if the BASE trust's template changed.
              const cachedBaseTemplateId = String(cachedTheme?.baseTrustTemplateId || '').trim() || null;
              const latestBaseTemplateId = isBaseTrust
                ? null
                : (String(latestBaseMeta?.trustTemplateId || '').trim() || null);
              const baseChanged = !isBaseTrust && cachedBaseTemplateId !== latestBaseTemplateId;
              const selectedTemplateUpdatedAtChanged = hasTemplateMetaChanged({
                cachedTemplateId: cachedSelectedTemplateId,
                cachedTemplateUpdatedAt: cachedTheme?.selectedTemplateUpdatedAt || null,
                latestMeta: latestSelectedMeta
              });
              const baseTemplateUpdatedAtChanged = !isBaseTrust && hasTemplateMetaChanged({
                cachedTemplateId: cachedBaseTemplateId,
                cachedTemplateUpdatedAt: cachedTheme?.baseTemplateUpdatedAt || null,
                latestMeta: latestBaseMeta
              });

              if (selectedChanged || baseChanged || selectedTemplateUpdatedAtChanged || baseTemplateUpdatedAtChanged) {
                if (import.meta.env.DEV) {
                  console.log('[useTheme][TemplateLink] Cache discarded due to template link change:', {
                    selectedTrustId: resolvedTrustId,
                    cachedSelectedTemplateId,
                    latestSelectedTemplateId,
                    selectedChanged,
                    selectedTemplateUpdatedAtChanged,
                    cachedBaseTemplateId,
                    latestBaseTemplateId,
                    baseChanged,
                    baseTemplateUpdatedAtChanged,
                    cacheSource: 'cache',
                    nextSource: 'db'
                  });
                }
                clearThemeCacheForTrust(resolvedTrustId);
                hasQueuedRefreshRef.current = true;
                setRefreshTick((prev) => prev + 1);
                return;
              }

              setIsThemeLoading(false);
              void validateCacheInBackground(cachedTheme);
            } catch (err) {
              console.warn('[useTheme][TemplateLink] Trust template verification failed:', err);
              hasQueuedRefreshRef.current = true;
              setRefreshTick((prev) => prev + 1);
            }
          };

          void verifyTemplateLink();
          return undefined;
        }
      } else if (import.meta.env.DEV) {
        console.log('[useTheme][TemplateLink] Cache miss:', {
          selectedTrustId: resolvedTrustId,
          cacheKey: null
        });
      }
    } catch {
      // no-op
    }

    const load = async ({ silent = false } = {}) => {
      if (!silent) setIsThemeLoading(true);
      hasQueuedRefreshRef.current = false;
      try {
        const isBaseTrustSelected = resolvedTrustId === BASE_TRUST_ID;
        const [baseLink, selectedLink] = await Promise.all([
          fetchTrustThemeLink(BASE_TRUST_ID),
          isBaseTrustSelected
            ? Promise.resolve(null)
            : fetchTrustThemeLink(resolvedTrustId)
        ]);

        const effectiveBaseTemplate = baseLink?.template || null;
        const effectiveSelectedTemplate = isBaseTrustSelected
          ? null
          : (selectedLink?.template || null);

        const baseTheme = effectiveBaseTemplate
          ? buildThemeFromTemplate({
            templateRow: effectiveBaseTemplate,
            trustOverrides: baseLink.overrides,
            trustId: BASE_TRUST_ID
          })
          : { ...DEFAULT_THEME, trustId: BASE_TRUST_ID };

        const selectedTheme = isBaseTrustSelected
          ? null
          : (effectiveSelectedTemplate
            ? buildThemeFromTemplate({
              templateRow: effectiveSelectedTemplate,
              trustOverrides: selectedLink.overrides,
              trustId: resolvedTrustId
            })
            : null);

        const resolved = mergeResolvedThemes(baseTheme, selectedTheme);
        resolved.customCss = sanitizeCustomCss(resolved.customCss);
        resolved.baseTemplateUpdatedAt = effectiveBaseTemplate?.updated_at || null;
        resolved.selectedTemplateUpdatedAt = effectiveSelectedTemplate?.updated_at || null;
        resolved.baseTrustTemplateId = baseLink?.trust?.template_id || null;
        resolved.selectedTrustTemplateId = isBaseTrustSelected
          ? (baseLink?.trust?.template_id || null)
          : (selectedLink?.trust?.template_id || null);
        resolved.currentTrustTemplateId = resolved.selectedTrustTemplateId;
        resolved.selectedTrustId = resolvedTrustId;
        resolved.baseTrustUpdatedAt = null;
        resolved.selectedTrustUpdatedAt = null;

        const baseThemeConfigRaw = deepMergeObjects(
          parseJsonObject(effectiveBaseTemplate?.theme_config, {}),
          parseJsonObject(baseLink?.overrides, {})
        );
        const selectedThemeConfigRaw = deepMergeObjects(
          parseJsonObject(effectiveSelectedTemplate?.theme_config, {}),
          parseJsonObject(selectedLink?.overrides, {})
        );
        resolved.baseThemeConfigRaw = baseThemeConfigRaw;
        resolved.selectedThemeConfigRaw = selectedThemeConfigRaw;

        const selectedSource = isBaseTrustSelected
          ? (baseLink?.template ? (baseLink?.linkSource || 'linked_template') : 'fallback_default')
          : (selectedLink?.template ? (selectedLink?.linkSource || 'linked_template') : 'fallback_base');
        resolved.themeLoadSource = selectedSource.startsWith('linked_') ? 'db.linked_template' : `fallback.${selectedSource}`;

        if (import.meta.env.DEV) {
          console.log('[useTheme][TemplateLink] Loaded theme:', {
            previousTrustId: previousTrustId || null,
            selectedTrustId: resolvedTrustId,
            selectedTrustTemplateIdFromTrust: isBaseTrustSelected
              ? (baseLink?.trust?.template_id || null)
              : (selectedLink?.trust?.template_id || null),
            selectedTrustTemplateId: resolved.selectedTrustTemplateId,
            selectedLinkedTemplateId: isBaseTrustSelected
              ? (effectiveBaseTemplate?.id || null)
              : (effectiveSelectedTemplate?.id || null),
            selectedLinkedTemplateName: isBaseTrustSelected
              ? (effectiveBaseTemplate?.name || null)
              : (effectiveSelectedTemplate?.name || null),
            baseTrustTemplateId: resolved.baseTrustTemplateId,
            baseLinkedTemplateId: effectiveBaseTemplate?.id || null,
            baseLinkedTemplateName: effectiveBaseTemplate?.name || null,
            baseLinkSource: baseLink?.linkSource || null,
            selectedLinkSource: selectedLink?.linkSource || null,
            source: resolved.themeLoadSource,
            cacheUsed: false,
            selectedTemplateUpdatedAt: resolved.selectedTemplateUpdatedAt,
            baseTemplateUpdatedAt: resolved.baseTemplateUpdatedAt,
            navbarTextColor: getThemeToken(resolved, 'navbar.text_color', null),
            homeLayout: resolved.homeLayout,
            animations: resolved.animations
          });
        }

        writeThemeCache(resolvedTrustId, resolved);
        setTheme(tagThemeSource(resolved, 'db'));
      } catch (err) {
        console.warn('[useTheme][TemplateLink] Theme load failed:', err);
        setTheme((prev) => prev || { ...DEFAULT_THEME, trustId: BASE_TRUST_ID });
      } finally {
        if (!silent) setIsThemeLoading(false);
      }
    };

    void load({ silent: hasCachedTheme });
    return undefined;
  }, [trustId, refreshTick]);

  useEffect(() => {
    const queueRefreshFromEvent = async () => {
      const targetTrustId = String(trustId || '').trim() || resolveStoredTrustId();
      if (!targetTrustId || hasQueuedRefreshRef.current) return;
      const cachedEntry = readCachedThemeEntry(targetTrustId);
      const shouldRefresh = !cachedEntry?.theme || isStale(cachedEntry?.ts);
      if (shouldRefresh) {
        hasQueuedRefreshRef.current = true;
        clearThemeCacheForTrust(targetTrustId);
        setRefreshTick((prev) => prev + 1);
        return;
      }

      try {
        const cachedTheme = cachedEntry.theme;
        const isBaseTrust = targetTrustId === BASE_TRUST_ID;
        const [latestSelectedMeta, latestBaseMeta] = await Promise.all([
          fetchTrustTemplateMeta(targetTrustId),
          isBaseTrust ? Promise.resolve(null) : fetchTrustTemplateMeta(BASE_TRUST_ID)
        ]);

        const selectedTemplateChanged = hasTemplateMetaChanged({
          cachedTemplateId: cachedTheme?.selectedTrustTemplateId || null,
          cachedTemplateUpdatedAt: cachedTheme?.selectedTemplateUpdatedAt || null,
          latestMeta: latestSelectedMeta
        });

        const baseTemplateChanged = !isBaseTrust && hasTemplateMetaChanged({
          cachedTemplateId: cachedTheme?.baseTrustTemplateId || null,
          cachedTemplateUpdatedAt: cachedTheme?.baseTemplateUpdatedAt || null,
          latestMeta: latestBaseMeta
        });

        if (!selectedTemplateChanged && !baseTemplateChanged) return;

        if (import.meta.env.DEV) {
          console.log('[useTheme][TemplateLink] Refresh queued from app lifecycle event:', {
            selectedTrustId: targetTrustId,
            selectedTemplateChanged,
            baseTemplateChanged,
            trigger: 'focus_or_visibility'
          });
        }
      } catch (err) {
        console.warn('[useTheme][TemplateLink] Lifecycle cache validation failed:', err);
      }

      hasQueuedRefreshRef.current = true;
      clearThemeCacheForTrust(targetTrustId);
      setRefreshTick((prev) => prev + 1);
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        queueRefreshFromEvent();
      }
    };
    const onTemplateApplied = () => {
      const targetTrustId = String(trustId || '').trim() || resolveStoredTrustId();
      if (!targetTrustId || hasQueuedRefreshRef.current) return;
      hasQueuedRefreshRef.current = true;
      clearThemeCacheForTrust(targetTrustId);
      setRefreshTick((prev) => prev + 1);
    };

    window.addEventListener('focus', queueRefreshFromEvent);
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener(THEME_TEMPLATE_APPLIED_EVENT, onTemplateApplied);

    return () => {
      window.removeEventListener('focus', queueRefreshFromEvent);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener(THEME_TEMPLATE_APPLIED_EVENT, onTemplateApplied);
    };
  }, [trustId]);

  const clearThemeCache = (tid) => {
    try {
      const targetTrustId = String(tid || trustId || '').trim() || resolveStoredTrustId();
      clearThemeCacheForTrust(targetTrustId);
    } catch {
      // no-op
    }
  };

  const refreshTheme = () => {
    const targetTrustId = String(trustId || '').trim() || resolveStoredTrustId();
    clearThemeCacheForTrust(targetTrustId);
    hasQueuedRefreshRef.current = false;
    setRefreshTick((prev) => prev + 1);
  };

  const applyTrustTemplate = async ({ trustId: explicitTrustId, templateId }) => {
    const targetTrustId = String(explicitTrustId || trustId || '').trim() || resolveStoredTrustId();
    const nextTemplateId = String(templateId || '').trim();

    if (!targetTrustId) {
      return { success: false, error: 'Missing trust id' };
    }

    if (!nextTemplateId) {
      return { success: false, error: 'Missing template id' };
    }

    try {
      const { data, error } = await supabase
        .from('Trust')
        .update({
          template_id: nextTemplateId
        })
        .eq('id', targetTrustId)
        .select('id, name, template_id')
        .maybeSingle();

      if (error) throw error;

      clearThemeCacheForTrust(targetTrustId);

      if (import.meta.env.DEV) {
        console.log('[useTheme][TemplateLink] Trust.template_id updated:', {
          selectedTrustId: targetTrustId,
          trustTemplateId: data?.template_id || null,
          templateIdChangedTo: nextTemplateId,
          trigger: 'applyTrustTemplate'
        });
      }

      dispatchThemeTemplateApplied({
        trustId: targetTrustId,
        templateId: nextTemplateId,
        source: 'applyTrustTemplate'
      });
      dispatchThemeRefresh({
        trustId: targetTrustId,
        reason: 'template-applied'
      });

      hasQueuedRefreshRef.current = false;
      setRefreshTick((prev) => prev + 1);

      return {
        success: true,
        trust: data || null
      };
    } catch (err) {
      console.warn('[useTheme][TemplateLink] Failed to apply template:', err);
      return {
        success: false,
        error: err?.message || 'Failed to apply template'
      };
    }
  };

  return {
    theme,
    isThemeLoading,
    clearThemeCache,
    refreshTheme,
    applyTrustTemplate,
    currentTrustTemplateId: theme?.currentTrustTemplateId || null
  };
};
