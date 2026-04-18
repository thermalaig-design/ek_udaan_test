import React, { useState, useEffect, useRef } from 'react';
import { User, Users, Clock, FileText, UserPlus, Bell, ChevronLeft, ChevronRight, Heart, Shield, Plus, ArrowRight, Pill, ShoppingCart, Calendar, Stethoscope, Building2, Phone, QrCode, Monitor, Brain, Package, FileCheck, Search, Filter, MapPin, Star, HelpCircle, BookOpen, Video, Headphones, Menu, X, Home as HomeIcon, Settings, UserCircle, Image, Trash2, Code, FolderOpen, Crown } from 'lucide-react';
import Sidebar from './components/Sidebar';
import TermsModal from './components/TermsModal';
import ImageSlider from './components/ImageSlider';
import { getProfile, getMarqueeUpdates, getSponsors, getUserNotifications, markNotificationAsRead, markAllNotificationsAsRead, deleteNotification, getMemberTrustLinks } from './services/api';
import { fetchLatestGalleryImages, getCachedLatestGalleryImages } from './services/galleryService';
import { registerSidebarState, useTheme } from './hooks';
import { supabase } from './services/supabaseClient';
import { getCurrentNotificationContext, matchesNotificationForContext } from './services/notificationAudience';
import { fetchFeatureFlags, subscribeFeatureFlags, isFeatureEnabled } from './services/featureFlags';
import { fetchMemberTrusts, fetchTrustByName, fetchTrustById, fetchDefaultTrust } from './services/trustService';
import { DEFAULT_THEME, buildThemeFromTemplate } from './utils/themeUtils';

const DEFAULT_TRUST_NAME = import.meta.env.VITE_DEFAULT_TRUST_NAME || 'Ek Udaan';
const DEFAULT_TRUST_LOGO = '/new_logo.png';
const SPONSOR_CACHE_TTL_MS = 5 * 60 * 1000;
const SPONSOR_CHUNK_SIZE = 5;

const buildNotificationContentKey = (notification) => {
  const title = String(notification?.title || '').trim().toLowerCase();
  const message = String(notification?.message || notification?.body || '').trim().toLowerCase();
  const type = String(notification?.type || '').trim().toLowerCase();
  const createdAt = String(notification?.created_at || '').trim();
  const createdAtSecond = createdAt ? createdAt.slice(0, 19) : '';
  return `${type}|${title}|${message}|${createdAtSecond}`;
};

const mergeUniqueTrusts = (...collections) => {
  const merged = [];
  const seen = new Set();

  collections
    .flat()
    .filter(Boolean)
    .forEach((trust) => {
      const id = trust.id === null || trust.id === undefined ? '' : String(trust.id);
      if (!id || seen.has(id)) return;
      seen.add(id);
      merged.push({
        id,
        name: trust.name || null,
        icon_url: trust.icon_url || null,
        remark: trust.remark || null,
        is_active: Boolean(trust.is_active) !== false
      });
    });

  return merged;
};

// Ensure default trust (Ek Udaan) is always in the list
const ensureDefaultTrustIncluded = (trustList, defaultTrust, baseAppId = 'b353d2ff-ec3b-4b90-a896-69f40662084e') => {
  if (!trustList || trustList.length === 0) {
    return defaultTrust ? [defaultTrust] : [];
  }

  // Check if default trust is already in the list by ID
  const defaultId = String(defaultTrust?.id || baseAppId || '').trim();
  const hasDefault = trustList.some((t) => String(t?.id || '').trim() === defaultId);

  // If default trust is not here, add it to the beginning
  if (!hasDefault && defaultTrust) {
    return [defaultTrust, ...trustList];
  }

  return trustList;
};

const getCachedSponsorsForTrust = (trustId) => {
  if (!trustId) return [];
  try {
    const direct = localStorage.getItem(`sponsors_cache_${trustId}`);
    if (direct) {
      const parsed = JSON.parse(direct);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {
    // ignore malformed direct cache
  }

  // Fallback to sponsors list cache created by SponsorsList screen.
  try {
    const listCache = localStorage.getItem(`sponsors_list_cache_v1_${trustId}`);
    if (listCache) {
      const parsed = JSON.parse(listCache);
      const byTrust = parsed?.sponsorsByTrust?.[trustId];
      if (Array.isArray(byTrust) && byTrust.length > 0) return byTrust;
    }
  } catch {
    // ignore malformed list cache
  }

  return [];
};

const readSponsorCache = (trustId) => {
  if (!trustId) return { list: [], isFresh: false };
  try {
    const raw = localStorage.getItem(`sponsors_cache_${trustId}`);
    if (!raw) return { list: [], isFresh: false };
    const parsed = JSON.parse(raw);

    // Backward-compatible: old cache format was plain array.
    if (Array.isArray(parsed)) {
      return { list: parsed, isFresh: parsed.length > 0 };
    }

    const list = Array.isArray(parsed?.data) ? parsed.data : [];
    const ts = Number(parsed?.ts || 0);
    const isFresh = ts > 0 && (Date.now() - ts) < SPONSOR_CACHE_TTL_MS;
    return { list, isFresh };
  } catch {
    return { list: [], isFresh: false };
  }
};

const writeSponsorCache = (trustId, list) => {
  if (!trustId || !Array.isArray(list)) return;
  try {
    localStorage.setItem(
      `sponsors_cache_${trustId}`,
      JSON.stringify({ ts: Date.now(), data: list })
    );
  } catch {
    // ignore
  }
};

/* eslint-disable react-refresh/only-export-components */
const Home = ({ onNavigate, onLogout, isMember }) => {
  const normalizeTrustId = (id) => {
    if (id === null || id === undefined) return '';
    const normalized = String(id).trim();
    if (!normalized) return '';
    const lowered = normalized.toLowerCase();
    if (lowered === 'null' || lowered === 'undefined' || lowered === 'nan') return '';
    return normalized;
  };
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const mainContainerRef = useRef(null);
  const channelRef = useRef(null);

  // Welcome strip: initialize from localStorage instantly to avoid delay
  const [userProfile, setUserProfile] = useState(() => {
    try {
      const user = localStorage.getItem('user');
      if (!user) return null;
      const parsed = JSON.parse(user);
      const fallbackName = parsed.name || parsed.Name || parsed['Name'] || '';
      if (!fallbackName) return null;
      return { name: fallbackName, profilePhotoUrl: '' };
    } catch { return null; }
  });

  // Trust: prefer user's last selection; fall back to env trust id.
  const [selectedTrustId, setSelectedTrustId] = useState(() => {
    const cachedSelected = normalizeTrustId(localStorage.getItem('selected_trust_id') || '');
    let cachedDefaultId = '';
    try {
      const cachedDefault = localStorage.getItem('default_trust_cache');
      if (cachedDefault) {
        const parsed = JSON.parse(cachedDefault);
        cachedDefaultId = normalizeTrustId(parsed?.id || '');
      }
    } catch {
      // ignore malformed cache
    }
    const envId = normalizeTrustId(import.meta.env.VITE_DEFAULT_TRUST_ID || '');
    return cachedSelected || cachedDefaultId || envId || '';
  });

  // Synchronously pre-populate trustInfo from cached default-trust data
  const [trustInfo, setTrustInfo] = useState(() => {
    try {
      const cached = localStorage.getItem('default_trust_cache');
      if (cached) return JSON.parse(cached);
    } catch { /* ignore */ }
    return null;
  });

  // trustList: pre-populate from full trust list cache so selector shows instantly
  const [trustList, setTrustList] = useState(() => {
    try {
      const listCached = localStorage.getItem('trust_list_cache');
      if (listCached) {
        const list = JSON.parse(listCached);
        if (Array.isArray(list) && list.length > 0) return list;
      }
      const cached = localStorage.getItem('default_trust_cache');
      if (cached) return [JSON.parse(cached)];
    } catch { /* ignore */ }
    return [];
  });

  const [defaultTrust, setDefaultTrust] = useState(() => {
    try {
      const cached = localStorage.getItem('default_trust_cache');
      if (cached) return JSON.parse(cached);
    } catch { /* ignore */ }
    return null;
  });
  const [showTermsModal, setShowTermsModal] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [marqueeUpdates, setMarqueeUpdates] = useState(() => {
    try {
      const trustId = localStorage.getItem('selected_trust_id') || import.meta.env.VITE_DEFAULT_TRUST_ID || '';
      if (!trustId) return [];
      const cached = localStorage.getItem(`marquee_cache_${trustId}`);
      if (cached) return JSON.parse(cached);
    } catch { /* ignore */ }
    return [];
  });

  // Sponsors: load from localStorage cache instantly to avoid loading delay
  const [sponsors, setSponsors] = useState(() => {
    try {
      const trustId = localStorage.getItem('selected_trust_id') || import.meta.env.VITE_DEFAULT_TRUST_ID || '';
      if (!trustId) return [];
      const primary = readSponsorCache(trustId).list;
      if (Array.isArray(primary) && primary.length > 0) return primary;
      return getCachedSponsorsForTrust(trustId);
    } catch { /* ignore */ }
    return [];
  });
  const [isSponsorsLoading, setIsSponsorsLoading] = useState(sponsors.length === 0);
  const hasLoadedSponsorsOnce = useRef(sponsors.length > 0);
  const [sponsorFetchSettledTrustId, setSponsorFetchSettledTrustId] = useState(
    sponsors.length > 0
      ? (normalizeTrustId(localStorage.getItem('selected_trust_id')) || normalizeTrustId(import.meta.env.VITE_DEFAULT_TRUST_ID) || '')
      : ''
  );
  const [sponsorIndex, setSponsorIndex] = useState(0);
  const [galleryImages, setGalleryImages] = useState([]);
  const [isGalleryLoading, setIsGalleryLoading] = useState(true);
  const [galleryError, setGalleryError] = useState(null);
  const [featureFlags, setFeatureFlags] = useState({});
  const [flagsData, setFlagsData] = useState({}); // full metadata: { feature_key: { display_name, tagline, icon_url } }
  const hasLoadedMemberTrusts = useRef(false);

  // Theme for currently selected trust
  const { theme, isThemeLoading } = useTheme(selectedTrustId);

  // Register sidebar state with Android back handler
  useEffect(() => {
    registerSidebarState(isMenuOpen, () => setIsMenuOpen(false));
  }, [isMenuOpen]);

  // Warm theme cache for visible trusts so trust switching feels instant.
  useEffect(() => {
    let active = true;
    const primeThemeCache = async () => {
      try {
        const trustIds = Array.from(
          new Set((trustList || []).map((t) => normalizeTrustId(t?.id)).filter(Boolean))
        );
        if (trustIds.length === 0) return;

        for (const trustId of trustIds) {
          if (!active) return;
          const cacheKey = `theme_cache_${trustId}`;
          try {
            if (sessionStorage.getItem(cacheKey)) continue;
          } catch {
            // ignore storage access issues
          }

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

            const overrides = trustResult?.data?.theme_overrides || {};
            const templateRow = templateResult?.data || {
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
            try { sessionStorage.setItem(cacheKey, JSON.stringify(resolved)); } catch { /* ignore */ }
          } catch {
            // ignore prefetch failures; main theme loader will handle actual switch
          }
        }
      } catch {
        // no-op
      }
    };

    primeThemeCache();
    return () => { active = false; };
  }, [trustList]);

  const getSessionSelectionFlag = () => {
    if (typeof window === 'undefined') return false;
    try {
      return sessionStorage.getItem('trust_selected_in_session') === 'true';
    } catch {
      return false;
    }
  };

  const setSessionSelectionFlag = () => {
    if (typeof window === 'undefined') return;
    try {
      sessionStorage.setItem('trust_selected_in_session', 'true');
    } catch {
      // no-op
    }
  };

  useEffect(() => {
    let isActive = true;
    const loadDefaultTrust = async () => {
      try {
        let trust = null;
        const envTrustId = import.meta.env.VITE_DEFAULT_TRUST_ID;
        const envTrustName = import.meta.env.VITE_DEFAULT_TRUST_NAME;
        const normalizedEnvTrustId = normalizeTrustId(envTrustId);
        let resolvedViaEnv = false;

        if (envTrustId) {
          trust = await fetchTrustById(envTrustId);
          resolvedViaEnv = Boolean(trust);
        } else if (envTrustName) {
          trust = await fetchTrustByName(envTrustName);
          resolvedViaEnv = Boolean(trust);
        }

        if (!trust) trust = await fetchDefaultTrust();

        if (isActive && trust) {
          const normalizedDefaultId = normalizeTrustId(trust.id);
          const currentSelected = normalizeTrustId(localStorage.getItem('selected_trust_id') || selectedTrustId);

          setDefaultTrust(trust);
          setTrustList((prev) => {
            const existing = (prev || []).find((t) => normalizeTrustId(t.id) === normalizedDefaultId);
            if (existing) {
              return (prev || []).map((t) =>
                normalizeTrustId(t.id) === normalizedDefaultId ? { ...t, ...trust } : t
              );
            }
            return [trust, ...(prev || [])];
          });

          // Apply as active trust only when nothing is selected yet.
          // Also apply default when selected trust is just stale env id
          // that failed to resolve (common after env/db trust id changes).
          const shouldApplyDefaultSelection =
            !currentSelected ||
            (!resolvedViaEnv && normalizedEnvTrustId && currentSelected === normalizedEnvTrustId);
          if (shouldApplyDefaultSelection) {
            setSelectedTrustId(normalizedDefaultId);
            localStorage.setItem('selected_trust_id', normalizedDefaultId);
            if (trust.name) localStorage.setItem('selected_trust_name', trust.name);
            setTrustInfo(trust);
          }

          try { localStorage.setItem('default_trust_cache', JSON.stringify(trust)); } catch { /* ignore */ }
        }
      } catch (err) {
        console.warn('Failed to load default trust:', err);
      }
    };
    loadDefaultTrust();
    return () => { isActive = false; };
  }, []);
  // Close sidebar when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (isMenuOpen) {
        const isSidebarClick = event.target.closest('[data-sidebar="true"]');
        const isOverlayClick = event.target.closest('[data-sidebar-overlay="true"]');
        if (isOverlayClick) setIsMenuOpen(false);
        if (!isSidebarClick && !isOverlayClick) setIsMenuOpen(false);
      }
    };
    if (isMenuOpen) {
      document.addEventListener('click', handleClickOutside, true);
      return () => document.removeEventListener('click', handleClickOutside, true);
    }
  }, [isMenuOpen]);

  // Close notifications when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (isNotificationsOpen) {
        const notificationsPanel = event.target.closest('.notification-dropdown');
        const notificationsButton = event.target.closest('.notification-button');
        if (!notificationsPanel && !notificationsButton) setIsNotificationsOpen(false);
      }
    };
    if (isNotificationsOpen) {
      document.addEventListener('click', handleClickOutside, true);
      return () => document.removeEventListener('click', handleClickOutside, true);
    }
  }, [isNotificationsOpen]);

  // Lock scroll when notifications open
  useEffect(() => {
    if (isNotificationsOpen) {
      const scrollY = window.scrollY;
      document.documentElement.style.overflow = 'hidden';
      document.body.style.overflow = 'hidden';
      document.body.style.position = 'fixed';
      document.body.style.width = '100%';
      document.body.style.top = `-${scrollY}px`;
      document.body.style.touchAction = 'none';
    } else {
      const scrollY = parseInt(document.body.style.top || '0') * -1;
      document.documentElement.style.overflow = 'unset';
      document.body.style.overflow = 'unset';
      document.body.style.position = 'unset';
      document.body.style.width = 'unset';
      document.body.style.top = 'unset';
      document.body.style.touchAction = 'auto';
      window.scrollTo(0, scrollY);
    }
    return () => {
      document.documentElement.style.overflow = 'unset';
      document.body.style.overflow = 'unset';
      document.body.style.position = 'unset';
      document.body.style.width = 'unset';
      document.body.style.top = 'unset';
      document.body.style.touchAction = 'auto';
    };
  }, [isNotificationsOpen]);

  // Load user profile — state is already pre-filled synchronously above;
  // this effect only upgrades it with the full profile from API/cache
  useEffect(() => {
    const loadProfile = async () => {
      const user = localStorage.getItem('user');
      if (user) {
        try {
          const parsedUser = JSON.parse(user);
          const userKey = `userProfile_${parsedUser.Mobile || parsedUser.mobile || parsedUser.id || 'default'}`;
          // First, apply cached profile photo if available
          const savedProfile = localStorage.getItem(userKey);
          if (savedProfile) {
            const parsed = JSON.parse(savedProfile);
            setUserProfile((prev) => ({ ...prev, ...parsed }));
          }
          const userId = parsedUser['Membership number'] || parsedUser.mobile || parsedUser.id;
          if (userId) {
            try {
              const response = await getProfile();
              if (response.success && response.profile) {
                setUserProfile({ name: response.profile.name || '', profilePhotoUrl: response.profile.profile_photo_url || '' });
                return;
              }
            } catch (error) {
              console.error('Error loading from Supabase:', error);
            }
          }
        } catch (error) {
          console.error('Error loading user profile:', error);
        }
      }
    };
    loadProfile();
  }, []);

  // Load trusts from user localStorage
  useEffect(() => {
    const user = localStorage.getItem('user');
    if (!user) return;
    try {
      const parsedUser = JSON.parse(user);
      const memberships = Array.isArray(parsedUser.hospital_memberships) ? parsedUser.hospital_memberships : [];
      const derivedTrusts = memberships.map((m) => ({
        id: m.trust_id || m.id || null,
        name: m.trust_name || (m.trust_id ? 'Hospital' : null),
        icon_url: m.trust_icon_url || null,
        remark: m.trust_remark || null,
        is_active: m.is_active !== false
      }));
      const uniqueTrusts = mergeUniqueTrusts(derivedTrusts);
      const primaryTrust = parsedUser.primary_trust || parsedUser.trust || derivedTrusts.find((t) => t.is_active) || derivedTrusts[0] || (parsedUser.trust_name ? { name: parsedUser.trust_name } : null);
      const normalizedTrusts = uniqueTrusts.length > 0 ? uniqueTrusts : primaryTrust ? [primaryTrust] : [];
      // Keep only trusts linked to current member (no global/mixed trust carry-over).
      let mergedTrusts = normalizedTrusts.length > 0
        ? mergeUniqueTrusts(normalizedTrusts)
        : mergeUniqueTrusts(defaultTrust ? [defaultTrust] : []);
      
      // Ensure default trust is always included
      mergedTrusts = ensureDefaultTrustIncluded(mergedTrusts, defaultTrust);
      
      setTrustList(mergedTrusts);
      try { localStorage.setItem('trust_list_cache', JSON.stringify(mergedTrusts)); } catch { /* ignore */ }

      const normalizedSelected = normalizeTrustId(selectedTrustId);
      const selectedExistsInMerged = mergedTrusts.some((t) => normalizeTrustId(t.id) === normalizedSelected);
      const defaultInMergedId = normalizeTrustId(defaultTrust?.id);
      const shouldForceDefault =
        !getSessionSelectionFlag() &&
        defaultInMergedId &&
        mergedTrusts.some((t) => normalizeTrustId(t.id) === defaultInMergedId);
      const effectiveTrustId =
        (shouldForceDefault ? defaultInMergedId : '') ||
        (selectedExistsInMerged ? normalizedSelected : '') ||
        normalizeTrustId(primaryTrust?.id) ||
        normalizeTrustId(defaultTrust?.id) ||
        normalizeTrustId(mergedTrusts[0]?.id) ||
        '';
      if (effectiveTrustId && effectiveTrustId !== selectedTrustId) {
        setSelectedTrustId(effectiveTrustId);
        localStorage.setItem('selected_trust_id', effectiveTrustId);
      }
      const effectiveTrust =
        mergedTrusts.find((t) => normalizeTrustId(t.id) === effectiveTrustId) ||
        primaryTrust ||
        defaultTrust ||
        mergedTrusts[0] ||
        null;
      setTrustInfo(effectiveTrust);
      if (effectiveTrust?.name) localStorage.setItem('selected_trust_name', effectiveTrust.name);
    } catch (error) {
      console.warn('Could not parse user trust info:', error);
    }
  }, [selectedTrustId, defaultTrust?.id]);

  // Load member trusts from API
  useEffect(() => {
    if (hasLoadedMemberTrusts.current) return;
    const user = localStorage.getItem('user');
    if (!user) return;
    let parsedUser = null;
    try { parsedUser = JSON.parse(user); } catch { return; }
    
    const userDerivedTrusts = Array.isArray(parsedUser?.hospital_memberships)
      ? parsedUser.hospital_memberships.map((m) => ({
        id: m?.trust_id || m?.id || null,
        name: m?.trust_name || null,
        icon_url: m?.trust_icon_url || null,
        remark: m?.trust_remark || null,
        is_active: m?.is_active
      }))
      : [];
    
    console.log('📋 User derived trusts from hospital_memberships:', userDerivedTrusts.length, userDerivedTrusts.map(t => t.name).join(', '));
    
    const fallbackIdsFromMemberships = Array.isArray(parsedUser?.hospital_memberships)
      ? parsedUser.hospital_memberships.map((m) => m?.members_id).filter(Boolean)
      : [];
    const explicitMemberIds = Array.isArray(parsedUser?.member_ids)
      ? parsedUser.member_ids.filter(Boolean)
      : [];
    const membersIds = Array.from(
      new Set(
        [
          parsedUser?.members_id,
          parsedUser?.member_id,
          parsedUser?.id,
          ...explicitMemberIds,
          ...fallbackIdsFromMemberships
        ]
          .filter(Boolean)
          .map((id) => String(id))
      )
    );
    if (membersIds.length === 0) return;
    hasLoadedMemberTrusts.current = true;
    const loadMemberTrusts = async () => {
      try {
        console.log('🔍 Fetching member trusts for IDs:', membersIds.join(', '));
        
        const membershipResults = await Promise.all(
          membersIds.map((memberId) => fetchMemberTrusts(memberId).catch(() => []))
        );
        const membershipTrusts = membershipResults
          .flat()
          .map((trust) => ({
            id: trust.id || null,
            name: trust.name || null,
            icon_url: trust.icon_url || null,
            remark: trust.remark || null,
            is_active: trust.is_active
          }));
        
        console.log('📊 Membership trusts found:', membershipTrusts.length, membershipTrusts.map(t => t.name).join(', '));

        const linkResults = await Promise.all(
          membersIds.map((memberId) => getMemberTrustLinks(memberId).catch(() => ({ success: false, data: [] })))
        );
        const linkTrusts = linkResults
          .flatMap((res) => (res?.success && Array.isArray(res?.data) ? res.data : []))
          .map((link) => ({
            id: link?.trust_id || link?.Trust?.id || null,
            name: link?.Trust?.name || null,
            icon_url: link?.Trust?.icon_url || null,
            remark: link?.remark1 || link?.remark2 || null,
            is_active: link?.is_active !== false
          }));
        
        console.log('🔗 Link trusts found:', linkTrusts.length, linkTrusts.map(t => t.name).join(', '));

        const uniqueTrusts = mergeUniqueTrusts(userDerivedTrusts, membershipTrusts, linkTrusts);
        console.log('✨ Total unique trusts:', uniqueTrusts.length, uniqueTrusts.map(t => t.name).join(', '));
        
        if (uniqueTrusts.length === 0) return;

        const primaryTrust = parsedUser?.primary_trust || uniqueTrusts.find((t) => t.is_active) || uniqueTrusts[0];
        setTrustList(() => {
          const merged = mergeUniqueTrusts(uniqueTrusts);
          // Ensure default trust is always included (Ek Udaan)
          const withDefault = ensureDefaultTrustIncluded(merged, defaultTrust);
          // Cache full trust list so it appears instantly on next refresh
          try { localStorage.setItem('trust_list_cache', JSON.stringify(withDefault)); } catch { /* ignore */ }
          console.log(`✅ Final trust list (${withDefault.length} trusts):`, withDefault.map(t => ({ name: t.name, id: t.id.substring(0, 8) })));
          return withDefault;
        });
        const normalizedSelected = normalizeTrustId(selectedTrustId);
        const selectedExistsInUnique = uniqueTrusts.some((t) => normalizeTrustId(t.id) === normalizedSelected);
        const defaultInUniqueId = normalizeTrustId(defaultTrust?.id);
        const shouldForceDefault =
          !getSessionSelectionFlag() &&
          defaultInUniqueId &&
          uniqueTrusts.some((t) => normalizeTrustId(t.id) === defaultInUniqueId);
        const effectiveTrustId =
          (shouldForceDefault ? defaultInUniqueId : '') ||
          (selectedExistsInUnique ? normalizedSelected : '') ||
          normalizeTrustId(primaryTrust?.id) ||
          normalizeTrustId(defaultTrust?.id) ||
          normalizeTrustId(uniqueTrusts[0]?.id) ||
          '';
        if (effectiveTrustId && effectiveTrustId !== selectedTrustId) {
          setSelectedTrustId(effectiveTrustId);
          localStorage.setItem('selected_trust_id', effectiveTrustId);
        }
        const effectiveTrust = uniqueTrusts.find((t) => normalizeTrustId(t.id) === effectiveTrustId) || primaryTrust || uniqueTrusts[0] || null;
        if (effectiveTrust) {
          setTrustInfo(effectiveTrust);
          if (effectiveTrust.name) localStorage.setItem('selected_trust_name', effectiveTrust.name);
        }
      } catch (error) {
        console.warn('Failed to load member trusts:', error);
      }
    };
    loadMemberTrusts();
  }, [selectedTrustId]);


  // Feature flags
  useEffect(() => {
    const loadFlags = async (force = false) => {
      const trustId = selectedTrustId || trustInfo?.id || '';
      const result = await fetchFeatureFlags(trustId || null, { force });
      if (result.success) {
        setFeatureFlags(result.flags || {});
        setFlagsData(result.flagsData || {}); // store full metadata (display_name, tagline, icon_url)
      }
    };
    loadFlags();
    const handleFocus = () => loadFlags(true);
    const handleVisibility = () => { if (document.visibilityState === 'visible') loadFlags(true); };
    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibility);
    const trustId = selectedTrustId || trustInfo?.id || '';
    const unsubscribe = subscribeFeatureFlags(trustId || null, () => loadFlags(true));
    return () => {
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibility);
      unsubscribe?.();
    };
  }, [selectedTrustId, trustInfo?.id]);

  const handleTrustSelect = async (trustId) => {
    const normalizedId = normalizeTrustId(trustId);
    console.log(`🔄 Switching trust from "${selectedTrustId}" to "${normalizedId}"`);
    
    // Force reload by resetting all cached data states
    setMarqueeUpdates([]);
    setSponsors([]);
    setSponsorIndex(0);
    setGalleryImages([]);
    setNotifications([]);
    setUnreadCount(0);
    setSponsorFetchSettledTrustId(''); // Force sponsor refetch
    
    // Clear localStorage caches for this operation to force refresh
    try {
      localStorage.removeItem(`sponsor_carousel_index_${normalizedId}`);
    } catch { /* ignore */ }
    
    // Update selected trust
    setSelectedTrustId(normalizedId);
    localStorage.setItem('selected_trust_id', normalizedId);
    setSessionSelectionFlag();
    
    const selected = trustList.find((t) => normalizeTrustId(t.id) === normalizedId) || null;
    setTrustInfo(selected);
    if (selected?.name) {
      localStorage.setItem('selected_trust_name', selected.name);
      console.log(`✓ Trust switched to: ${selected.name}`);
    }
    
    window.dispatchEvent(new CustomEvent('trust-changed', { 
      detail: { trustId: normalizedId, trustName: selected?.name || null } 
    }));
    
    // Fetch and update fresh trust details
    try {
      const freshTrust = await fetchTrustById(normalizedId);
      if (freshTrust) {
        console.log(`✓ Fetched fresh trust details: ${freshTrust.name}`);
        setTrustInfo(freshTrust);
        setTrustList((prev) => (prev || []).map((t) => 
          normalizeTrustId(t.id) === normalizedId ? { ...t, ...freshTrust } : t
        ));
        if (freshTrust.name) localStorage.setItem('selected_trust_name', freshTrust.name);
        window.dispatchEvent(new CustomEvent('trust-changed', { 
          detail: { trustId: normalizedId, trustName: freshTrust.name || null } 
        }));
      }
    } catch (err) {
      console.warn('Failed to refresh trust details:', err?.message);
    }
  };

  // Marquee updates
  useEffect(() => {
    let active = true;
    const loadMarqueeUpdates = async () => {
      try {
        const trustId =
          normalizeTrustId(selectedTrustId) ||
          normalizeTrustId(trustInfo?.id) ||
          normalizeTrustId(localStorage.getItem('selected_trust_id')) ||
          null;
        const trustName = localStorage.getItem('selected_trust_name') || trustInfo?.name || null;

        // Show cached marquee instantly while fetching fresh data
        if (trustId) {
          try {
            const cached = localStorage.getItem(`marquee_cache_${trustId}`);
            if (cached && active) {
              const cachedUpdates = JSON.parse(cached);
              if (Array.isArray(cachedUpdates) && cachedUpdates.length > 0) {
                setMarqueeUpdates(cachedUpdates);
              }
            }
          } catch { /* ignore */ }
        }

        const response = await getMarqueeUpdates(trustId, trustName);
        if (!active) return;
        if (response.success && response.data && response.data.length > 0) {
          const updates = response.data.map(item => item.message).filter(msg => msg && msg.trim() !== '');
          if (updates.length > 0) {
            setMarqueeUpdates(updates);
            // Cache for instant display next time
            if (trustId) {
              try { localStorage.setItem(`marquee_cache_${trustId}`, JSON.stringify(updates)); } catch { /* ignore */ }
            }
          }
        } else {
          setMarqueeUpdates([]);
        }
      } catch (error) {
        console.error('Error loading marquee updates:', error);
        setMarqueeUpdates([]);
      }
    };
    // No artificial delay — cached data shows in <1ms
    loadMarqueeUpdates();
    return () => { active = false; };
  }, [selectedTrustId, trustInfo]);

  // Ref to track which trustId has already been fetched — avoids repeated/cancelled calls
  const lastFetchedSponsorTrustId = useRef('');
  
  // Reset sponsor tracking ref when trust changes to force fresh load
  useEffect(() => {
    console.log(`🔄 Trust changed, resetting sponsor fetch tracking`);
    lastFetchedSponsorTrustId.current = ''; // Reset so next fetch will be fresh
  }, [selectedTrustId]);

  // Sponsor: ref-based fetch that cannot be cancelled by re-renders
  useEffect(() => {
    let isActive = true;
    const progressiveTimers = [];
    let loadingSafetyTimer = null;

    const trustId =
      normalizeTrustId(selectedTrustId) ||
      normalizeTrustId(trustInfo?.id) ||
      normalizeTrustId(localStorage.getItem('selected_trust_id')) ||
      normalizeTrustId(import.meta.env.VITE_DEFAULT_TRUST_ID) ||
      '';
    if (!trustId) {
      setIsSponsorsLoading(false);
      hasLoadedSponsorsOnce.current = true;
      setSponsorFetchSettledTrustId('');
      return;
    }
    const isSameTrustAsLastFetch = trustId === lastFetchedSponsorTrustId.current;

    const trustName = localStorage.getItem('selected_trust_name') || null;
    const { list: cachedList, isFresh } = readSponsorCache(trustId);
    const hasCachedList = Array.isArray(cachedList) && cachedList.length > 0;
    let hasImmediateSponsors = false;

    // Step 1: Show cache immediately (synchronous, zero delay)
    if (hasCachedList) {
      setSponsors(cachedList);
      hasLoadedSponsorsOnce.current = true;
      setIsSponsorsLoading(false);
      hasImmediateSponsors = true;
    } else {
      // Legacy/fallback cache path (from SponsorsList screen cache).
      try {
        const fallbackList = getCachedSponsorsForTrust(trustId);
        if (Array.isArray(fallbackList) && fallbackList.length > 0) {
          setSponsors(fallbackList);
          hasLoadedSponsorsOnce.current = true;
          setIsSponsorsLoading(false);
          hasImmediateSponsors = true;
        } else {
          setIsSponsorsLoading(true);
        }
      } catch {
        setIsSponsorsLoading(true);
      }
    }

    // Fresh cache hit: skip network call fully so second load stays instant.
    if (isFresh && hasCachedList) {
      lastFetchedSponsorTrustId.current = trustId;
      hasLoadedSponsorsOnce.current = true;
      setIsSponsorsLoading(false);
      setSponsorFetchSettledTrustId(trustId);
      return () => {
        isActive = false;
        progressiveTimers.forEach((id) => clearTimeout(id));
      };
    }

    // Same trust pe rerender hua ho to loader me atakne se bachane ke liye:
    // only skip fetch when we already have something visible.
    if (isSameTrustAsLastFetch && (hasImmediateSponsors || hasLoadedSponsorsOnce.current)) {
      setIsSponsorsLoading(false);
      if (hasImmediateSponsors) setSponsorFetchSettledTrustId(trustId);
      return () => {
        isActive = false;
        if (loadingSafetyTimer) clearTimeout(loadingSafetyTimer);
        progressiveTimers.forEach((id) => clearTimeout(id));
      };
    }

    lastFetchedSponsorTrustId.current = trustId;
    if (!hasImmediateSponsors) {
      // Safety: avoid infinite "Loading sponsors..." if network hangs.
      loadingSafetyTimer = setTimeout(() => {
        if (!isActive) return;
        setIsSponsorsLoading(false);
      }, 6000);
    }

    // Step 2: Fetch fresh data in background — promise-based, cannot be cancelled
    getSponsors(trustId, trustName)
      .then((response) => {
        if (!isActive) return;
        if (loadingSafetyTimer) clearTimeout(loadingSafetyTimer);
        if (response.success && Array.isArray(response.data) && response.data.length > 0) {
          const list = response.data;
          writeSponsorCache(trustId, list);

          const matchIndex = list.findIndex((item) => item.is_user_match);
          const trustKey = `sponsor_carousel_index_${trustId}`;
          let restoredIndex = 0;
          try {
            const storedIndex = localStorage.getItem(trustKey);
            const parsedIndex = Number(storedIndex);
            if (Number.isFinite(parsedIndex) && parsedIndex >= 0) restoredIndex = parsedIndex;
          } catch { /* ignore */ }
          if (restoredIndex >= list.length) restoredIndex = 0;
          const finalIndex = matchIndex >= 0 ? matchIndex : restoredIndex;

          if (hasImmediateSponsors) {
            // We already have visible data from cache, so refresh instantly.
            setSponsors(list);
            setSponsorIndex(finalIndex);
          } else {
            // No immediate cache: progressively reveal sponsors in small chunks.
            setSponsors([]);
            setIsSponsorsLoading(true);
            for (let start = 0; start < list.length; start += SPONSOR_CHUNK_SIZE) {
              const chunk = list.slice(start, start + SPONSOR_CHUNK_SIZE);
              const chunkIndex = Math.floor(start / SPONSOR_CHUNK_SIZE);
              const timerId = setTimeout(() => {
                if (!isActive) return;
                setSponsors((prev) => {
                  const existingIds = new Set(prev.map((p) => p.id));
                  const nextItems = chunk.filter((item) => !existingIds.has(item.id));
                  return nextItems.length > 0 ? [...prev, ...nextItems] : prev;
                });
                if (chunkIndex === 0) setIsSponsorsLoading(false);
                if (start + chunk.length >= list.length) {
                  setSponsorIndex(finalIndex);
                }
              }, chunkIndex * 180);
              progressiveTimers.push(timerId);
            }
          }
        } else if (response.success && Array.isArray(response.data) && response.data.length === 0) {
          setSponsors([]);
        }
        hasLoadedSponsorsOnce.current = true;
        setSponsorFetchSettledTrustId(trustId);
        setIsSponsorsLoading(false);
      })
      .catch((err) => {
        console.error('Error loading sponsors:', err);
        if (loadingSafetyTimer) clearTimeout(loadingSafetyTimer);
        hasLoadedSponsorsOnce.current = true;
        setSponsorFetchSettledTrustId(trustId);
        setIsSponsorsLoading(false);
      });

    return () => {
      isActive = false;
      if (loadingSafetyTimer) clearTimeout(loadingSafetyTimer);
      progressiveTimers.forEach((id) => clearTimeout(id));
    };
  }, [selectedTrustId, trustInfo?.id]);

  useEffect(() => {
    if (!sponsors.length) return;
    const trustId =
      normalizeTrustId(selectedTrustId) ||
      normalizeTrustId(trustInfo?.id) ||
      normalizeTrustId(localStorage.getItem('selected_trust_id')) ||
      null;
    if (!trustId) return;
    const current = sponsors[sponsorIndex];
    if (current?.is_user_match) return;
    const trustKey = `sponsor_carousel_index_${trustId}`;
    try {
      localStorage.setItem(trustKey, String(sponsorIndex));
    } catch {
      // ignore
    }
  }, [sponsorIndex, sponsors, selectedTrustId, trustInfo?.id]);

  useEffect(() => {
    if (!sponsors.length) return;
    if (sponsorIndex >= sponsors.length) {
      setSponsorIndex(0);
      return;
    }
    const current = sponsors[sponsorIndex];
    const durationSeconds = Math.max(3, Number(current?.duration_seconds) || 5);
    const timer = setTimeout(() => {
      setSponsorIndex((prev) => (prev + 1) % sponsors.length);
    }, durationSeconds * 1000);
    return () => clearTimeout(timer);
  }, [sponsors, sponsorIndex]);

  const currentSponsorTrustId =
    normalizeTrustId(selectedTrustId) ||
    normalizeTrustId(trustInfo?.id) ||
    normalizeTrustId(localStorage.getItem('selected_trust_id')) ||
    normalizeTrustId(import.meta.env.VITE_DEFAULT_TRUST_ID) ||
    '';
  const hasSettledSponsorsForCurrentTrust =
    Boolean(currentSponsorTrustId) &&
    sponsorFetchSettledTrustId === currentSponsorTrustId;
  const isSponsorSectionLoading = !hasSettledSponsorsForCurrentTrust || isSponsorsLoading;
  const sponsorChunkStart = sponsors.length > 0
    ? Math.floor(sponsorIndex / SPONSOR_CHUNK_SIZE) * SPONSOR_CHUNK_SIZE
    : 0;
  const visibleSponsors = sponsors.slice(sponsorChunkStart, sponsorChunkStart + SPONSOR_CHUNK_SIZE);
  const activeVisibleSponsorIndex = sponsorIndex - sponsorChunkStart;

  // Gallery
  useEffect(() => {
    if (import.meta.env.VITE_DISABLE_GALLERY === 'true') return;
    let active = true;
    const loadGallery = async () => {
      try {
        const trustId =
          normalizeTrustId(selectedTrustId) ||
          normalizeTrustId(trustInfo?.id) ||
          normalizeTrustId(localStorage.getItem('selected_trust_id')) ||
          null;
        if (!trustId) {
          if (active) {
            setGalleryImages([]);
            setIsGalleryLoading(false);
          }
          return;
        }

        // Show cached gallery instantly (if available), then refresh in background.
        const cachedImages = getCachedLatestGalleryImages(trustId, 6);
        if (active) {
          if (cachedImages.length > 0) {
            setGalleryImages(cachedImages);
            setIsGalleryLoading(false);
          } else {
            setIsGalleryLoading(true);
          }
          setGalleryError(null);
        }

        const images = await fetchLatestGalleryImages(6, trustId, { preferCache: false });
        if (active) setGalleryImages(images);
      } catch (err) {
        console.error('Error loading gallery images:', err);
        if (active) {
          setGalleryError('Could not load gallery photos');
          setGalleryImages([]);
        }
      } finally {
        if (active) setIsGalleryLoading(false);
      }
    };
    loadGallery();
    return () => {
      active = false;
    };
  }, [selectedTrustId, trustInfo?.id]);

  // Notifications
  useEffect(() => {
    if (import.meta.env.VITE_DISABLE_NOTIFICATIONS === 'true') return;
    const fetchNotifications = async () => {
      try {
        const response = await getUserNotifications();
        if (response.success) {
          setNotifications(response.data || []);
          setUnreadCount((response.data || []).filter(n => !n.is_read).length);
        }
      } catch (error) {
        console.error('Error fetching notifications:', error);
      }
    };
    const handleBirthdayInserted = () => fetchNotifications();
    window.addEventListener('birthdayNotifInserted', handleBirthdayInserted);
    const handlePushNotificationArrived = () => fetchNotifications();
    window.addEventListener('pushNotificationArrived', handlePushNotificationArrived);
    const handlePushNotificationClicked = () => fetchNotifications();
    window.addEventListener('pushNotificationClicked', handlePushNotificationClicked);
    const handleAppResumed = () => fetchNotifications();
    window.addEventListener('appResumed', handleAppResumed);
    const initialDelay = setTimeout(fetchNotifications, 2200);
    const interval = setInterval(fetchNotifications, 30000);
    return () => {
      clearInterval(interval);
      clearTimeout(initialDelay);
      window.removeEventListener('birthdayNotifInserted', handleBirthdayInserted);
      window.removeEventListener('pushNotificationArrived', handlePushNotificationArrived);
      window.removeEventListener('pushNotificationClicked', handlePushNotificationClicked);
      window.removeEventListener('appResumed', handleAppResumed);
    };
  }, [selectedTrustId]);

  // Real-time notifications
  useEffect(() => {
    if (import.meta.env.VITE_DISABLE_NOTIFICATIONS === 'true') return;
    const subscribeToNotifications = () => {
      const notificationContext = getCurrentNotificationContext();
      if (!notificationContext.userId) return;
      const channel = supabase
        .channel('notifications-realtime-home')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications' }, (payload) => {
          const newNotif = payload.new;
          const isForMe = matchesNotificationForContext(newNotif, notificationContext);
          if (isForMe) {
            setNotifications((prev) => {
              const existingKeys = new Set(prev.map(buildNotificationContentKey));
              const newKey = buildNotificationContentKey(newNotif);
              if (existingKeys.has(newKey)) return prev;
              if (!newNotif.is_read) setUnreadCount((count) => count + 1);
              return [newNotif, ...prev];
            });
          }
        })
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'notifications' }, (payload) => {
          const updatedNotif = payload.new;
          const isForMe = matchesNotificationForContext(updatedNotif, notificationContext);
          if (isForMe) {
            setNotifications((prev) => prev.map((n) => (n.id === updatedNotif.id ? updatedNotif : n)));
            if (payload.old?.is_read === false && updatedNotif.is_read === true) setUnreadCount((prev) => Math.max(0, prev - 1));
          }
        })
        .subscribe();
      channelRef.current = channel;
    };
    const timer = setTimeout(subscribeToNotifications, 1800);
    return () => {
      clearTimeout(timer);
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, []);

  const handleMarkAsRead = async (id) => {
    try {
      await markNotificationAsRead(id);
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (error) { console.error('Error marking notification as read:', error); }
  };

  const handleMarkAllAsRead = async () => {
    try {
      await markAllNotificationsAsRead();
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
      setUnreadCount(0);
    } catch (error) { console.error('Error marking all notifications as read:', error); }
  };

  const handleDismissNotification = async (id) => {
    try {
      setNotifications(prev => prev.filter(n => n.id !== id));
      setUnreadCount(prev => {
        const dismissed = notifications.find(n => n.id === id);
        return dismissed && !dismissed.is_read ? Math.max(0, prev - 1) : prev;
      });
      try { await deleteNotification(id); } catch (apiError) { console.error('Error deleting notification from backend:', apiError); }
    } catch (error) { console.error('Error dismissing notification:', error); }
  };

  const handleClearAll = async () => {
    const toDelete = [...notifications];
    setNotifications([]);
    setUnreadCount(0);
    setIsNotificationsOpen(false);
    try { await Promise.all(toDelete.map(n => deleteNotification(n.id))); } catch (error) { console.error('Error clearing notifications:', error); }
  };

  useEffect(() => {
    const termsAccepted = localStorage.getItem('terms_accepted');
    if (!termsAccepted) setShowTermsModal(true);
  }, []);

  const handleAcceptTerms = () => {
    localStorage.setItem('terms_accepted', 'true');
    setShowTermsModal(false);
  };

  const formatNotificationTitle = (title, message) => {
    if (title.includes('Appointment') && message.includes('appointment')) {
      if (message.includes('date has been changed')) return '📅 Appointment Rescheduled';
      else if (message.includes('remark')) return '💬 New Message';
      else return '📋 Appointment Updated';
    }
    return title;
  };

  const formatNotificationMessage = (message) => {
    if (message.includes('appointment') && message.includes('date has been changed')) {
      const dateMatch = message.match(/date has been changed from ([\d-]+) to ([\d-]+)/i);
      if (dateMatch) return `Hi there! Your appointment has been rescheduled from ${formatDate(dateMatch[1])} to ${formatDate(dateMatch[2])}.`;
    } else if (message.includes('appointment') && message.includes('remark')) {
      const remarkMatch = message.match(/has a new remark: (.+)/i);
      if (remarkMatch) return `Hi there! New message regarding your appointment: "${remarkMatch[1]}".`;
      else return `Hi there! New message regarding your appointment.`;
    }
    return message;
  };

  const formatDate = (dateStr) => {
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
    } catch { return dateStr; }
  };

  const ff = (key) => isFeatureEnabled(featureFlags, key);
  const normalizeQuickRoute = (route) => {
    const value = String(route || '').trim().toLowerCase();
    if (value === 'noticeboard') return 'notices';
    return value;
  };

  // Build Quick Access tiles from Supabase flag metadata.
  const dbQuickActions = Object.entries(flagsData)
    .filter(([_, data]) => data?.is_enabled && data?.route && data?.icon_url)
    .map(([key, data]) => ({
      id: key,
      route: normalizeQuickRoute(data.route),
      displayName: data.display_name || key,
      tagline: data.tagline || '',
      icon_url: data.icon_url || '',
      quick_order: data.quick_order ?? null,
    }));

  // Fallback tiles ensure Events and Noticeboard still render even before flag rows are seeded.
  const fallbackQuickActions = [
    ff('feature_noticeboard') ? {
      id: 'feature_noticeboard_fallback',
      route: 'notices',
      displayName: 'Noticeboard',
      tagline: 'Latest updates',
      icon_url: '/icons/quick-access/noticeboard.svg',
      quick_order: 80,
    } : null,
    ff('feature_events') ? {
      id: 'feature_events_fallback',
      route: 'events',
      displayName: 'Events',
      tagline: 'Upcoming activities',
      icon_url: '/icons/quick-access/events.svg',
      quick_order: 90,
    } : null,
  ].filter(Boolean);

  const enabledQuickActions = [...dbQuickActions, ...fallbackQuickActions]
    .filter((item, index, all) =>
      all.findIndex((entry) => normalizeQuickRoute(entry.route) === normalizeQuickRoute(item.route)) === index
    )
    .sort((a, b) => {
      const ao = a.quick_order ?? 9999;
      const bo = b.quick_order ?? 9999;
      if (ao !== bo) return ao - bo;
      return String(a.displayName).localeCompare(String(b.displayName));
    });

  const activeTrust =
    trustList.find((trust) => normalizeTrustId(trust.id) === normalizeTrustId(selectedTrustId)) ||
    trustInfo ||
    defaultTrust ||
    null;

  const shouldShowTrustSelector = trustList.length > 1;
  const showTrustSelector = shouldShowTrustSelector;

  return (
    <div
      ref={mainContainerRef}
      className={`flex flex-col relative ${isMenuOpen ? 'overflow-hidden max-h-screen' : 'overflow-hidden'}`}
      style={{ background: 'var(--page-bg, var(--app-page-bg))', minHeight: '100%' }}
    >
      {/* Decorative blobs (theme-aware) */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute"
        style={{
          top: '-110px',
          left: '-120px',
          width: '320px',
          height: '320px',
          borderRadius: '9999px',
          background: `radial-gradient(circle, ${theme.primary}1F 0%, transparent 70%)`,
          animation: 'homeFloat1 7s ease-in-out infinite',
        }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute"
        style={{
          bottom: '-140px',
          right: '-110px',
          width: '360px',
          height: '360px',
          borderRadius: '9999px',
          background: `radial-gradient(circle, ${theme.secondary}1F 0%, transparent 70%)`,
          animation: 'homeFloat2 9s ease-in-out infinite',
        }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute"
        style={{
          top: '35%',
          left: '55%',
          width: '220px',
          height: '220px',
          borderRadius: '9999px',
          background: `radial-gradient(circle, ${theme.primary}12 0%, transparent 70%)`,
          animation: 'homeFloat3 6s ease-in-out infinite',
        }}
      />

      {/* ══ Light Navbar (theme-aware) ══ */}
      <div
        role="navigation"
        className="theme-navbar sticky top-0 z-50 w-full"
        style={{
          background: 'var(--navbar-bg, var(--app-navbar-bg))',
          backdropFilter: 'blur(var(--navbar-blur, 12px))',
          WebkitBackdropFilter: 'blur(var(--navbar-blur, 12px))',
          boxShadow: `0 2px 16px ${theme.secondary}22`,
          borderBottom: '1px solid var(--navbar-border)',
        }}
      >
        {/* Thin top accent bar */}
        <div className="h-[3px]" style={{ background: 'var(--navbar-accent)' }} />

        {/* Top row: hamburger | logo+name | bell */}
        <div
          className="flex items-center justify-between"
          style={{
            paddingTop: 'max(24px, calc(env(safe-area-inset-top, 0px) + 24px))',
            paddingBottom: '10px',
            paddingLeft: '16px',
            paddingRight: '16px',
          }}
        >

          {/* Hamburger */}
          <button
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className="w-10 h-10 rounded-2xl flex items-center justify-center transition-all flex-shrink-0 active:scale-95"
            style={{
              background: isMenuOpen
                ? `linear-gradient(135deg, ${theme.primary}, ${theme.secondary})`
                : theme.accentBg,
              boxShadow: isMenuOpen ? `0 4px 12px ${theme.primary}40` : 'none',
            }}
          >
            {isMenuOpen
              ? <X className="h-5 w-5 text-white" />
              : <Menu className="h-[22px] w-[22px]" style={{ color: theme.secondary }} />}
          </button>

          {/* Trust logo + name */}
          <div className="flex items-center gap-2.5 flex-1 justify-center">
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 p-0.5"
              style={{
                boxShadow: `0 0 0 2px ${theme.primary}, 0 3px 10px ${theme.primary}30`,
                background: '#fff',
              }}
            >
              <img
                src={activeTrust?.icon_url || defaultTrust?.icon_url || trustInfo?.icon_url || DEFAULT_TRUST_LOGO}
                alt={activeTrust?.name || defaultTrust?.name || trustInfo?.name || DEFAULT_TRUST_NAME}
                className="w-full h-full object-contain rounded-full"
              />
            </div>
            <h1
              className="font-extrabold text-[15px] truncate max-w-[130px]"
              style={{ color: theme.secondary }}
            >
              {activeTrust?.name || defaultTrust?.name || trustInfo?.name || localStorage.getItem('selected_trust_name') || DEFAULT_TRUST_NAME}
            </h1>
          </div>

          {/* Bell / placeholder */}
          <div className="flex-shrink-0">
            {ff('feature_notifications') ? (
              <div className="relative">
                <button
                  onClick={() => setIsNotificationsOpen(!isNotificationsOpen)}
                  className="notification-button w-10 h-10 rounded-2xl flex items-center justify-center transition-all active:scale-95"
                  style={{
                    background: isNotificationsOpen
                      ? `linear-gradient(135deg, ${theme.primary}, ${theme.secondary})`
                      : theme.accentBg,
                    boxShadow: isNotificationsOpen ? `0 4px 12px ${theme.primary}40` : 'none',
                  }}
                >
                  <Bell
                    className="h-[22px] w-[22px]"
                    style={{ color: isNotificationsOpen ? '#fff' : theme.secondary }}
                  />
                  {unreadCount > 0 && (
                    <span
                      className="absolute -top-1 -right-1 text-[9px] font-bold h-[18px] w-[18px] flex items-center justify-center rounded-full border-2 border-white"
                      style={{ background: theme.primary, color: '#fff' }}
                    >
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                  )}
                </button>

                {isNotificationsOpen && (
                  <>
                    <div className="fixed inset-0 z-[90]" onClick={() => setIsNotificationsOpen(false)} />
                    <div
                      className="notification-dropdown fixed right-3 top-[72px] w-80 bg-white rounded-2xl shadow-2xl z-[100] overflow-hidden"
                      style={{ border: `1px solid ${theme.primary}1F` }}
                    >
                      <div className="p-4 flex items-center justify-between"
                        style={{ borderBottom: `1px solid ${theme.primary}14`, background: `linear-gradient(135deg,${theme.accent},#fff)` }}>
                        <h3 className="font-bold text-sm" style={{ color: theme.secondary }}>Notifications ({notifications.length})</h3>
                        <div className="flex items-center gap-3">
                          {unreadCount > 0 && (
                            <button onClick={handleMarkAllAsRead} className="text-xs font-bold" style={{ color: theme.secondary }}>Mark all read</button>
                          )}
                          {notifications.length > 0 && (
                            <button onClick={handleClearAll} className="flex items-center gap-1 text-xs font-bold" style={{ color: theme.primary }}>
                              <Trash2 className="w-3.5 h-3.5" /> Clear
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="max-h-[360px] overflow-y-auto">
                        {notifications.length > 0 ? notifications.slice(0, 4).map((notification) => (
                          <div key={notification.id}
                            className={`p-4 relative cursor-pointer transition-colors ${!notification.is_read ? 'bg-red-50/30' : 'hover:bg-gray-50'}`}
                            style={{ borderBottom: '1px solid #f1f5f9' }}
                          >
                            <div onClick={() => { handleMarkAsRead(notification.id); sessionStorage.setItem('initialNotification', JSON.stringify(notification)); setIsNotificationsOpen(false); onNavigate('notifications'); }}>
                              {!notification.is_read && <div className="absolute left-2 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full" style={{ background: theme.primary }} />}
                              <h4 className={`text-sm font-semibold text-slate-800 mb-0.5 ${!notification.is_read ? 'pl-3' : ''}`}>
                                {formatNotificationTitle(notification.title, notification.message)}
                              </h4>
                              <p className="text-xs text-slate-500 leading-relaxed mb-1">{formatNotificationMessage(notification.message)}</p>
                              <span className="text-[10px] text-slate-400 font-medium">
                                {new Date(notification.created_at).toLocaleDateString()} at {new Date(notification.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>
                            <button onClick={(e) => { e.stopPropagation(); handleDismissNotification(notification.id); }}
                              className="absolute top-2.5 right-2.5 p-1 rounded-full text-slate-400 transition-colors">
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )) : (
                          <div className="p-8 text-center">
                            <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3" style={{ background: theme.accent }}>
                              <Bell className="h-5 w-5" style={{ color: theme.primary }} />
                            </div>
                            <p className="text-sm text-slate-400 font-medium">No notifications yet</p>
                          </div>
                        )}
                      </div>
                      {notifications.length > 0 && (
                        <div className="p-3 text-center" style={{ borderTop: '1px solid #f1f5f9', background: '#fafafa' }}>
                          <button onClick={() => { setIsNotificationsOpen(false); onNavigate('notifications'); }}
                            className="text-xs font-bold" style={{ color: theme.secondary }}>
                            View all {notifications.length} →
                          </button>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            ) : <div className="w-9" />}
          </div>
        </div>

        {/* Welcome strip */}
        {userProfile?.name && (
          <div className="px-4 pb-3">
            <div
              className="flex items-center gap-2.5 rounded-2xl px-3.5 py-2"
              style={{
                background: `linear-gradient(135deg, ${theme.accent}99, ${theme.accentBg})`,
                border: `1px solid ${theme.primary}14`,
              }}
            >
              {userProfile.profilePhotoUrl ? (
                <img
                  src={userProfile.profilePhotoUrl}
                  alt={userProfile.name}
                  className="w-6 h-6 rounded-full object-cover flex-shrink-0"
                  style={{ border: `1.5px solid ${theme.primary}` }}
                />
              ) : (
                <div
                  className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold flex-shrink-0"
                  style={{ background: `linear-gradient(135deg, ${theme.primary}, ${theme.secondary})`, color: '#fff' }}
                >
                  {userProfile.name.charAt(0).toUpperCase()}
                </div>
              )}
              <p className="text-[12px] font-semibold truncate" style={{ color: theme.secondary }}>
                Welcome, <span className="font-extrabold">{userProfile.name}</span>
              </p>
            </div>
          </div>
        )}
      </div>


      <Sidebar isOpen={isMenuOpen} onClose={() => setIsMenuOpen(false)} onNavigate={onNavigate} currentPage="home" />

      {/* ── Dynamic Section Renderer (order from theme.homeLayout) ── */}
      {(() => {
        const SECTIONS = {
          trustList: showTrustSelector && trustList.length > 1 ? (
            <div className="flex gap-2 overflow-x-auto px-4 py-2" style={{ scrollbarWidth: 'none', background: theme.accent + '33', borderBottom: `1px solid ${theme.primary}14` }} key="trustList">
              {trustList.map((trust) => {
                const isActive = normalizeTrustId(trust.id) === selectedTrustId;
                return (
                  <button
                    key={trust.id || trust.name}
                    onClick={() => handleTrustSelect(trust.id)}
                    className="flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center overflow-hidden transition-all duration-200"
                    style={{
                      border: isActive ? `2.5px solid ${theme.primary}` : '2px solid #e2e8f0',
                      backgroundColor: isActive ? '#fff' : '#f8fafc',
                      transform: isActive ? 'scale(1.05)' : 'scale(1)',
                      boxShadow: isActive ? `0 4px 14px ${theme.primary}38` : 'none',
                    }}
                    title={trust.name || 'Hospital'}
                  >
                    {trust.icon_url
                      ? <img src={trust.icon_url} alt={trust.name || 'Hospital'} className="w-7 h-7 object-contain" />
                      : <Building2 className="h-4 w-4" style={{ color: theme.primary }} />}
                  </button>
                );
              })}
            </div>
          ) : null,
          marquee: ff('feature_marquee') && marqueeUpdates.length > 0 ? (
            <div className="mt-0 mb-2 w-full overflow-hidden" style={{ background: 'var(--marquee-bg)', boxShadow: `0 2px 12px ${theme.primary}4D` }} key="marquee">
              <div className="flex items-stretch">
                <div className="flex-shrink-0 px-3 flex items-center gap-2" style={{ background: 'rgba(0,0,0,0.25)' }}>
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-70" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-white" />
                  </span>
                  <span className="text-[11px] font-bold uppercase tracking-widest whitespace-nowrap" style={{ color: 'var(--marquee-text)' }}>
                    {flagsData?.feature_marquee?.display_name || 'Updates'}
                  </span>
                </div>
                <div className="w-px my-1.5" style={{ background: 'color-mix(in srgb, var(--marquee-text) 30%, transparent)' }} />
                <div className="overflow-hidden flex-1 py-2">
                  <div className="marquee-track flex">
                    {[...marqueeUpdates, ...marqueeUpdates].map((msg, i) => (
                      <span key={i} className="whitespace-nowrap text-xs font-semibold px-6" style={{ color: 'var(--marquee-text)' }}>⭐ {msg}</span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ) : null,
          gallery: ff('feature_gallery') ? (
            <div className="px-4 mt-5 mb-3" key="gallery">
              {/* Gallery card */}
              <div
                className="rounded-3xl overflow-hidden"
                style={{
                  boxShadow: `0 10px 32px ${theme.secondary}28, 0 2px 8px ${theme.primary}14`,
                  border: `1px solid ${theme.primary}18`,
                }}
              >
                <div className="h-[3px]" style={{ background: `linear-gradient(90deg, ${theme.primary}, ${theme.secondary})` }} />
                {isGalleryLoading ? (
                  <div className="w-full h-[200px] flex items-center justify-center" style={{ background: theme.accentBg }}>
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: theme.primary, borderTopColor: 'transparent' }} />
                      <p className="text-xs font-medium" style={{ color: theme.secondary }}>Loading gallery...</p>
                    </div>
                  </div>
                ) : galleryImages.length > 0 ? (
                  <ImageSlider images={galleryImages} onNavigate={onNavigate} />
                ) : (
                  <button
                    onClick={() => onNavigate('gallery')}
                    className="w-full h-[200px] bg-white flex flex-col items-center justify-center gap-3"
                  >
                    <div
                      className="w-14 h-14 rounded-2xl flex items-center justify-center"
                      style={{ background: `linear-gradient(135deg, ${theme.accent}, ${theme.accentBg})` }}
                    >
                      <Image className="h-7 w-7" style={{ color: theme.primary }} />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-center" style={{ color: theme.secondary }}>
                        {(activeTrust?.name || defaultTrust?.name || DEFAULT_TRUST_NAME)} Gallery
                      </p>
                      <p className="text-xs text-gray-400 text-center mt-0.5">{galleryError || 'Tap to open gallery'}</p>
                    </div>
                  </button>
                )}
              </div>
            </div>
          ) : null,

          quickActions: enabledQuickActions.length > 0 ? (
            <div className="px-4 mt-5 mb-4" key="quickActions">
              <div className="grid grid-cols-2 gap-3">
                {enabledQuickActions.map((action) => {
                  return (
                    <button
                      key={action.id}
                      onClick={() => onNavigate(action.route)}
                      className="rounded-2xl text-left transition-all active:scale-[0.97] duration-150"
                      style={{
                        background: '#ffffff',
                        border: `1px solid ${theme.primary}18`,
                        boxShadow: `0 4px 16px ${theme.secondary}12, 0 1px 4px ${theme.primary}0A`,
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        className="h-[4px]"
                        style={{ background: `linear-gradient(90deg, ${theme.primary} 0%, ${theme.secondary} 100%)` }}
                      />
                      <div className="p-3.5">
                        <div
                          className="w-10 h-10 rounded-xl flex items-center justify-center mb-2.5"
                          style={{
                            background: `linear-gradient(135deg, ${theme.accent}CC 0%, ${theme.accentBg} 100%)`,
                            border: `1px solid ${theme.primary}18`,
                          }}
                        >
                          <img
                            src={action.icon_url}
                            alt={action.displayName}
                            className="h-[18px] w-[18px] object-contain"
                          />
                        </div>
                        <div className="flex items-start justify-between gap-1">
                          <div className="min-w-0 flex-1">
                            <h3 className="text-[12px] font-extrabold leading-snug" style={{ color: theme.secondary }}>
                              {action.displayName}
                            </h3>
                            <p className="text-[10px] font-medium mt-0.5 leading-snug" style={{ color: '#64748b' }}>
                              {action.tagline}
                            </p>
                          </div>
                          <ChevronRight className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" style={{ color: `${theme.secondary}80` }} />
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null,

          sponsors: (
            <div className="px-4 mt-5 mb-4" key="sponsors">
              {sponsors.length > 0 ? (
              <div className="relative">
                <div className="relative overflow-hidden rounded-3xl">
                  <div
                    className="absolute inset-0 pointer-events-none"
                    style={{
                      background: `linear-gradient(135deg, ${theme.accentBg}66 0%, #ffffff 38%, ${theme.accent}66 100%)`,
                    }}
                  />
                  <div className="relative min-h-[168px]">
                  {visibleSponsors.map((sponsor, idx) => {
                    const globalIndex = sponsorChunkStart + idx;
                    const isActive = idx === activeVisibleSponsorIndex;
                    const hasContact = sponsor.phone || sponsor.whatsapp_number || sponsor.website_url || sponsor.city || sponsor.state;
                    const locationLabel = [sponsor.city, sponsor.state].filter(Boolean).join(', ');
                    return (
                      <button
                        key={sponsor.id || `sponsor-${globalIndex}`}
                        onClick={() => {
                          try { sessionStorage.setItem('selectedSponsor', JSON.stringify(sponsor)); } catch { }
                          onNavigate('sponsors');
                        }}
                        className={`absolute inset-0 w-full text-left transition-all duration-700 ease-out ${isActive ? 'opacity-100 translate-y-0 scale-100 pointer-events-auto' : 'opacity-0 translate-y-1 scale-[0.99] pointer-events-none'}`}
                        aria-hidden={!isActive}
                        tabIndex={isActive ? 0 : -1}
                      >
                        <div
                          className="relative rounded-3xl p-[1px] h-full overflow-hidden"
                          style={{
                            background: `linear-gradient(130deg, ${theme.primary}44 0%, ${theme.secondary}33 40%, ${theme.primary}2E 100%)`,
                            boxShadow: `0 12px 28px ${theme.secondary}1F`,
                          }}
                        >
                          <div
                            className="relative rounded-3xl p-4 flex items-center gap-3.5 h-full overflow-hidden"
                            style={{
                              background: 'rgba(255,255,255,0.93)',
                              backdropFilter: 'blur(8px)',
                            }}
                          >
                            <div
                              className="absolute inset-0 pointer-events-none opacity-45"
                              style={{
                                background: `repeating-linear-gradient(135deg, transparent 0 13px, ${theme.accentBg}44 13px 14px)`,
                              }}
                            />
                            <div
                              className="absolute -top-10 -right-10 h-24 w-24 rounded-full pointer-events-none"
                              style={{ background: `radial-gradient(circle, ${theme.primary}66 0%, transparent 70%)` }}
                            />
                            <div
                              className="absolute -bottom-10 -left-8 h-20 w-20 rounded-full pointer-events-none"
                              style={{ background: `radial-gradient(circle, ${theme.secondary}4A 0%, transparent 75%)` }}
                            />

                            <div className="w-16 h-16 rounded-[1.15rem] p-[2px] flex-shrink-0 z-10" style={{ background: `linear-gradient(145deg, ${theme.primary}55, ${theme.secondary}44)` }}>
                              <div
                                className="w-full h-full rounded-[1rem] flex items-center justify-center overflow-hidden"
                                style={{
                                  background: '#ffffff',
                                  boxShadow: `0 6px 16px ${theme.primary}1A`,
                                }}
                              >
                                {sponsor.photo_url
                                  ? <img src={sponsor.photo_url} alt={sponsor.name || sponsor.company_name} className="w-full h-full object-cover" />
                                  : <Star className="h-6 w-6" style={{ color: theme.primary }} />}
                              </div>
                            </div>

                            <div className="flex-1 min-w-0 z-10">
                              <div className="mb-1.5">
                                <div
                                  className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5"
                                  style={{ background: '#fff8f8', border: `1px solid ${theme.primary}30`, boxShadow: `0 1px 5px ${theme.primary}12` }}
                                >
                                  <span className="w-1.5 h-1.5 rounded-full inline-block animate-pulse" style={{ background: theme.primary }} />
                                  <span className="text-[9px] font-bold uppercase tracking-[0.2em]" style={{ color: theme.primary }}>
                                    {sponsor.badge_label || 'Official Sponsor'}
                                  </span>
                                </div>
                              </div>

                              <div className="text-[15px] font-extrabold leading-snug truncate" style={{ color: theme.secondary }}>
                                {sponsor.name || sponsor.company_name}
                              </div>
                              <div className="mt-0.5 flex items-center gap-1.5 min-w-0">
                                <Building2 className="h-3 w-3 flex-shrink-0" style={{ color: `${theme.secondary}80` }} />
                                <p className="text-[11px] font-bold truncate tracking-wide" style={{ color: '#64748b' }}>
                                  {sponsor.company_name || sponsor.position || 'Community partner'}
                                </p>
                              </div>

                              <p className="text-[10px] font-medium mt-1.5 line-clamp-2" style={{ color: '#6f7f92' }}>
                                {sponsor.about || 'Supporting our community with care and commitment.'}
                              </p>

                              {hasContact && (
                                <div className="mt-2.5 flex flex-wrap gap-1.5">
                                  {sponsor.phone && (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-semibold" style={{ background: `${theme.accentBg}`, color: theme.secondary, border: `1px solid ${theme.primary}22` }}>
                                      <Phone className="h-2.5 w-2.5" />
                                      {sponsor.phone}
                                    </span>
                                  )}
                                  {sponsor.whatsapp_number && (
                                    <span className="px-2 py-0.5 rounded-full text-[9px] font-semibold" style={{ background: `${theme.accentBg}`, color: theme.secondary, border: `1px solid ${theme.primary}22` }}>
                                      WhatsApp {sponsor.whatsapp_number}
                                    </span>
                                  )}
                                  {locationLabel && (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-semibold" style={{ background: `${theme.accentBg}`, color: theme.secondary, border: `1px solid ${theme.primary}22` }}>
                                      <MapPin className="h-2.5 w-2.5" />
                                      {locationLabel}
                                    </span>
                                  )}
                                  {sponsor.website_url && (
                                    <span className="px-2 py-0.5 rounded-full text-[9px] font-semibold" style={{ background: `${theme.accentBg}`, color: theme.secondary, border: `1px solid ${theme.primary}22` }}>
                                      Website
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>

                          </div>
                        </div>
                      </button>
                    );
                  })}
                  </div>
                </div>
                {sponsors.length > 1 && (
                  <>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSponsorIndex((prev) => (prev - 1 + sponsors.length) % sponsors.length);
                      }}
                      className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1/2 z-20 h-9 w-9 rounded-full inline-flex items-center justify-center transition-all duration-200 active:scale-95"
                      style={{ background: 'rgba(255,255,255,0.97)', color: theme.secondary, border: `1px solid ${theme.primary}2B`, boxShadow: `0 8px 20px ${theme.primary}24`, backdropFilter: 'blur(6px)' }}
                      aria-label="Previous sponsor"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSponsorIndex((prev) => (prev + 1) % sponsors.length);
                      }}
                      className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 z-20 h-9 w-9 rounded-full inline-flex items-center justify-center transition-all duration-200 active:scale-95"
                      style={{ background: `linear-gradient(145deg, ${theme.primary} 0%, ${theme.secondary} 100%)`, color: '#fff', border: `1px solid ${theme.primary}35`, boxShadow: `0 10px 22px ${theme.primary}33` }}
                      aria-label="Next sponsor"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                    <div className="flex justify-center items-center gap-1.5 mt-2">
                      {visibleSponsors.map((_, idx) => {
                        const globalIndex = sponsorChunkStart + idx;
                        const isActive = globalIndex === sponsorIndex;
                        return (
                        <button
                          key={`sponsor-indicator-${globalIndex}`}
                          onClick={() => setSponsorIndex(globalIndex)}
                          className="h-1.5 rounded-full transition-all duration-300"
                          style={{
                            width: isActive ? 16 : 6,
                            background: isActive ? `linear-gradient(90deg, ${theme.primary}, ${theme.secondary})` : `${theme.primary}35`,
                            boxShadow: isActive ? `0 1px 5px ${theme.primary}38` : 'none',
                          }}
                          aria-label={`Go to sponsor ${globalIndex + 1}`}
                        />
                      );
                      })}
                    </div>
                  </>
                )}
              </div>
              ) : (
                <div
                  className="relative overflow-hidden rounded-3xl"
                  style={{
                    boxShadow: `0 8px 24px ${theme.secondary}12`
                  }}
                >
                  <div
                    className="absolute inset-0 pointer-events-none"
                    style={{
                      background: `linear-gradient(135deg, ${theme.accentBg}66 0%, #ffffff 38%, ${theme.accent}66 100%)`,
                    }}
                  />
                  <div
                    className="relative rounded-3xl p-[1px]"
                    style={{
                      background: `linear-gradient(130deg, ${theme.primary}44 0%, ${theme.secondary}33 40%, ${theme.primary}2E 100%)`,
                    }}
                  >
                    <div
                      className="relative rounded-3xl p-4 min-h-[168px] overflow-hidden"
                      style={{
                        background: 'rgba(255,255,255,0.93)',
                        backdropFilter: 'blur(8px)',
                      }}
                    >
                      <div
                        className="absolute inset-0 pointer-events-none opacity-45"
                        style={{
                          background: `repeating-linear-gradient(135deg, transparent 0 13px, ${theme.accentBg}44 13px 14px)`,
                        }}
                      />
                      <div className="relative z-10 h-full flex items-center gap-3.5">
                        <div className="w-16 h-16 rounded-[1.15rem] bg-slate-200 animate-pulse flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="h-3 w-24 rounded-full bg-slate-200 animate-pulse mb-2" />
                          <div className="h-4 w-40 rounded-full bg-slate-200 animate-pulse mb-2" />
                          <div className="h-3 w-28 rounded-full bg-slate-200 animate-pulse mb-3" />
                          <p className="text-[12px] font-medium" style={{ color: '#64748b' }}>
                            {isSponsorSectionLoading
                              ? 'Loading sponsors...'
                              : 'No active sponsors available right now.'}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

            </div>
          ),
        };

        const baseLayout = Array.isArray(theme.homeLayout) && theme.homeLayout.length > 0
          ? theme.homeLayout
          : ['gallery', 'quickActions', 'sponsors'];
        const orderedLayout = baseLayout.filter((key) => key !== 'trustList');
        if (!orderedLayout.includes('sponsors')) orderedLayout.push('sponsors');
        if (showTrustSelector) orderedLayout.unshift('trustList');
        return orderedLayout.map((key) => SECTIONS[key] || null);
      })()}



      <style>{`
        .marquee-track {
          display: flex;
          animation: marquee-scroll 30s linear infinite;
          width: max-content;
        }
        .marquee-track:hover { animation-play-state: paused; }
        @keyframes marquee-scroll {
          0%   { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }

        /* Decorative home blobs animations */
        @keyframes homeFloat1 {
          0%, 100% { transform: translateY(0px) scale(1); }
          50% { transform: translateY(-18px) scale(1.04); }
        }
        @keyframes homeFloat2 {
          0%, 100% { transform: translateY(0px) scale(1); }
          50% { transform: translateY(14px) scale(0.97); }
        }
        @keyframes homeFloat3 {
          0%, 100% { transform: translateX(0px); }
          50% { transform: translateX(12px); }
        }

        /* Hide scrollbar on home page content */
        .home-scroll::-webkit-scrollbar { display: none; }
        .home-scroll { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>

      {/* ── Footer ── */}
      <footer
        className="mt-auto py-3 px-6"
        style={{
          borderTop: `1px solid ${theme.primary}12`,
          background: `linear-gradient(135deg, ${theme.accent}44, #fff)`,
        }}
      >
        <div className="flex items-center justify-center gap-2">
          <div className="w-8 h-px" style={{ background: `linear-gradient(to right, transparent, ${theme.primary}60)` }} />
          <button
            onClick={() => onNavigate('developers')}
            className="text-[11px] font-medium transition-colors"
            style={{ color: `${theme.secondary}70` }}
          >
            Powered by Developers
          </button>
          <div className="w-8 h-px" style={{ background: `linear-gradient(to left, transparent, ${theme.primary}60)` }} />
        </div>
      </footer>
      <TermsModal isOpen={showTermsModal} onAccept={handleAcceptTerms} />
    </div>
  );
};

export default Home;



















