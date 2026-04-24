import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, ChevronRight, LogOut, Share2 } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { Share } from '@capacitor/share';
import { getProfile } from '../services/api';
import { fetchFeatureFlags, isFeatureEnabled } from '../services/featureFlags';
import { useAppTheme } from '../context/ThemeContext';
import { applyOpacity } from '../utils/colorUtils';

// Calculate profile completion % based on filled fields
const calcCompletion = (profile, user) => {
  const fields = [
    profile?.name || user?.Name || user?.name,
    profile?.profilePhotoUrl,
    user?.Mobile || user?.mobile,
    user?.Email || user?.email,
    user?.['Company Name'] || user?.company,
    user?.['Address Home'] || user?.address,
    user?.['Membership number'] || user?.membership_number,
  ];
  const filled = fields.filter(Boolean).length;
  return Math.round((filled / fields.length) * 100);
};

const Sidebar = ({ isOpen, onClose, onNavigate, currentPage, onLogout }) => {
  const theme = useAppTheme();
  const primary = theme.primary || 'var(--brand-red)';
  const secondary = theme.secondary || 'var(--brand-navy)';
  const accent = theme.accent || 'var(--app-accent)';
  const accentBg = theme.accentBg || 'var(--app-accent-bg)';
  const sidebarRef = useRef(null);
  const touchStartX = useRef(0);
  const touchEndX = useRef(0);
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [userData, setUserData] = useState(null);
  const [shareToast, setShareToast] = useState(false);
  const [featureFlags, setFeatureFlags] = useState({});
  const [memberTrustLinks, setMemberTrustLinks] = useState([]);
  const [loadingTrustLinks, setLoadingTrustLinks] = useState(false);

  // Load feature flags when sidebar opens
  useEffect(() => {
    if (!isOpen) return;
    const trustId = localStorage.getItem('selected_trust_id') || null;
    fetchFeatureFlags(trustId, { force: false }).then((result) => {
      if (result.success) setFeatureFlags(result.flags || {});
    });
  }, [isOpen]);

  const ff = (key) => isFeatureEnabled(featureFlags, key);

  // Load profile data when sidebar opens
  useEffect(() => {
    if (!isOpen) return;
    const load = async () => {
      try {
        const user = localStorage.getItem('user');
        const parsedUser = user ? JSON.parse(user) : null;
        setUserData(parsedUser);

        const response = await getProfile();
        if (response.success && response.profile) {
          setProfile({
            name: response.profile.name || parsedUser?.Name || parsedUser?.name || '',
            profilePhotoUrl: response.profile.profile_photo_url || '',
          });
        } else if (parsedUser) {
          const key = `userProfile_${parsedUser.Mobile || parsedUser.mobile || parsedUser.id || 'default'}`;
          const saved = localStorage.getItem(key);
          if (saved) setProfile(JSON.parse(saved));
          else setProfile({ name: parsedUser.Name || parsedUser.name || '', profilePhotoUrl: '' });
        }
      } catch {
        const user = localStorage.getItem('user');
        if (user) {
          const parsedUser = JSON.parse(user);
          setUserData(parsedUser);
          setProfile({ name: parsedUser?.Name || parsedUser?.name || '', profilePhotoUrl: '' });
        }
      }
    };
    load();
  }, [isOpen]);

  // Load member trusts when sidebar opens (reg_members based payload from login)
  useEffect(() => {
    if (!isOpen) return;
    const load = async () => {
      try {
        setLoadingTrustLinks(true);
        const user = localStorage.getItem('user');
        const parsedUser = user ? JSON.parse(user) : null;

        const hospitalMemberships = Array.isArray(parsedUser?.hospital_memberships)
          ? parsedUser.hospital_memberships
          : [];

        const trusts = hospitalMemberships.map((hm, idx) => ({
          _key: hm.trust_id || `hm-${idx}`,
          trust_id: hm.trust_id || null,
          Trust: {
            id: hm.trust_id || null,
            name: hm.trust_name || null,
            icon_url: hm.trust_icon_url || null,
          },
          source: 'reg_members',
        }));

        console.log(`[Sidebar] Loaded ${trusts.length} trusts from hospital_memberships`);
        setMemberTrustLinks(trusts);
      } catch (error) {
        console.error('[Sidebar] Error loading member trusts:', error);
        setMemberTrustLinks([]);
      } finally {
        setLoadingTrustLinks(false);
      }
    };
    load();
  }, [isOpen]);

  // No body scroll lock needed — the overlay (touchAction: none) already
  // prevents background scroll on mobile, and covers background on desktop.

  // Swipe left to close
  useEffect(() => {
    if (!isOpen) return;
    
    let isVerticalScroll = false;
    let startY = 0;
    
    const handleTouchStart = (e) => {
      touchStartX.current = e.touches[0].clientX;
      touchEndX.current = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      isVerticalScroll = false;
    };
    
    const handleTouchMove = (e) => {
      const currentX = e.touches[0].clientX;
      const currentY = e.touches[0].clientY;
      const deltaX = Math.abs(currentX - touchStartX.current);
      const deltaY = Math.abs(currentY - startY);
      
      // Detect if this is vertical scrolling (not swipe to close)
      if (deltaY > deltaX) {
        isVerticalScroll = true;
      }
      
      touchEndX.current = currentX;
    };
    
    const handleTouchEnd = () => {
      // Only trigger close if it's a clear horizontal swipe (not vertical scroll)
      if (!isVerticalScroll && touchStartX.current - touchEndX.current > 80) {
        onClose();
      }
    };
    
    const sidebar = sidebarRef.current;
    if (sidebar) {
      sidebar.addEventListener('touchstart', handleTouchStart, { passive: true });
      sidebar.addEventListener('touchmove', handleTouchMove, { passive: true });
      sidebar.addEventListener('touchend', handleTouchEnd);
    }
    return () => {
      if (sidebar) {
        sidebar.removeEventListener('touchstart', handleTouchStart);
        sidebar.removeEventListener('touchmove', handleTouchMove);
        sidebar.removeEventListener('touchend', handleTouchEnd);
      }
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const displayName = profile?.name || userData?.Name || userData?.name || 'User';
  const initials = displayName.charAt(0).toUpperCase();
  const completion = calcCompletion(profile, userData);
  const completionColor = primary;

  const menuItems = [];

  return (
    <>
      {/* Overlay — absolute within parent container */}
      <div
        className="absolute inset-0 backdrop-blur-sm z-40"
        data-sidebar-overlay="true"
        onTouchStart={onClose}
        onClick={onClose}
        style={{
          touchAction: 'none',
          background: 'color-mix(in srgb, var(--app-page-bg) 60%, var(--surface-color))'
        }}
      />

      {/* Sidebar panel — absolute, left-anchored, full height */}
      <div
        ref={sidebarRef}
        className="theme-sidebar absolute left-0 top-0 bottom-0 w-72 shadow-2xl z-50 flex flex-col"
        data-sidebar="true"
        style={{
          maxWidth: '85vw',
          touchAction: 'pan-y',
          background: 'var(--sidebar-bg)',
          backdropFilter: 'blur(var(--sidebar-blur, 12px))',
          WebkitBackdropFilter: 'blur(var(--sidebar-blur, 12px))',
          opacity: 'var(--sidebar-opacity, 1)',
          borderRight: '1px solid var(--sidebar-border)',
          overflow: 'hidden',
          WebkitOverflowScrolling: 'touch',
          willChange: 'transform',
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        {/* Brand accent at top */}
        <div style={{ height: '4px', background: 'var(--sidebar-accent)' }} />
        {/* ── Profile Card Header ── */}
        <div
          className="px-5 pt-14 pb-5 flex-shrink-0 cursor-pointer"
          style={{ borderBottom: `1px solid ${applyOpacity(primary, 0.08)}` }}
          onClick={() => { onNavigate('profile'); onClose(); }}
        >
          {/* Avatar + name row */}
          <div className="flex items-center gap-3 mb-3">
            {/* Avatar */}
            <div className="relative flex-shrink-0">
              {profile?.profilePhotoUrl ? (
                <img
                  src={profile.profilePhotoUrl}
                  alt={displayName}
                  className="h-14 w-14 rounded-2xl object-cover"
                  style={{ border: `2px solid ${accent}` }}
                  onError={(e) => { e.target.onerror = null; e.target.style.display = 'none'; }}
                />
              ) : (
                <div className="h-14 w-14 rounded-2xl flex items-center justify-center text-xl font-bold select-none"
                  style={{ background: accent, border: `2px solid ${primary}`, color: primary }}>
                  {initials}
                </div>
              )}
              {/* Online dot */}
              <div
                className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2"
                style={{
                  background: 'var(--quick-actions-icon-bg)',
                  borderColor: 'var(--surface-color)'
                }}
              />
            </div>

            {/* Name + subtitle */}
            <div className="flex-1 min-w-0">
              <p className="font-bold text-sm truncate" style={{ color: 'var(--sidebar-text)' }}>{displayName}</p>
              <p className="text-xs font-semibold mt-0.5" style={{ color: primary }}>View &amp; Edit Profile</p>
            </div>

            <ChevronRight
              className="h-4 w-4 flex-shrink-0"
              style={{ color: 'color-mix(in srgb, var(--sidebar-text) 45%, var(--surface-color))' }}
            />
          </div>

          {/* Completion bar */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span
                className="text-[11px] font-medium"
                style={{ color: 'color-mix(in srgb, var(--sidebar-text) 64%, var(--surface-color))' }}
              >
                Profile Completion
              </span>
              <span className="text-[11px] font-bold" style={{ color: completionColor }}>
                {completion}%
              </span>
            </div>
            <div
              className="h-1.5 w-full rounded-full overflow-hidden"
              style={{ background: 'color-mix(in srgb, var(--sidebar-text) 10%, var(--surface-color))' }}
            >
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${completion}%`,
                  background: completionColor
                }}
              />
            </div>
          </div>
        </div>

        {/* ── Scrollable area: nav + extras + logout ── */}
        <div 
          className="flex-1 overflow-y-auto overflow-x-hidden"
          style={{ 
            touchAction: 'pan-y', 
            WebkitOverflowScrolling: 'touch', 
            minHeight: 0,
            scrollBehavior: 'smooth',
            flex: '1 1 auto',
            overscrollBehavior: 'contain'
          }}
        >
          {/* Nav items */}
          <div className="py-3 px-3">
            <div className="space-y-1">
              {menuItems.map((item) => {
                const cp = (currentPage || '').toLowerCase();
                const aliasMap = {
                  'healthcare-directory': 'directory',
                  'healthcare-trustee-directory': 'directory',
                  'directory': 'directory',
                  'appointments': 'appointment',
                  'appointment': 'appointment',
                  'home': 'home',
                  'reports': 'reports',
                  'gallery': 'gallery',
                  'reference': 'reference',
                  'profile': 'profile'
                };
                let normalized = aliasMap[cp] || cp;
                if (!normalized) normalized = '';
                if (!aliasMap[cp] && normalized.endsWith('s')) normalized = normalized.slice(0, -1);
                const isActive = normalized === String(item.id).toLowerCase();
                return (
                  <button
                    key={item.id}
                    onClick={() => { onNavigate(item.id); onClose(); }}
                    className="w-full flex items-center gap-3 px-4 rounded-xl transition-all text-left active:scale-95 select-none"
                    style={{
                      minHeight: '52px',
                      WebkitTapHighlightColor: applyOpacity(primary, 0.06),
                      background: isActive ? accent : 'transparent',
                    }}
                  >
                    <item.icon
                      className="h-5 w-5 flex-shrink-0"
                      style={{
                        color: isActive
                          ? primary
                          : 'color-mix(in srgb, var(--sidebar-text) 72%, var(--surface-color))'
                      }}
                    />
                    <span
                      className="font-semibold flex-1"
                      style={{
                        color: isActive
                          ? primary
                          : 'var(--sidebar-text)'
                      }}
                    >
                      {item.label}
                    </span>
                    {isActive && <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: primary }} />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── More Options ── */}
          <div
            className="px-3 pt-2 pb-3 space-y-2"
            style={{ borderTop: '1px solid color-mix(in srgb, var(--sidebar-text) 10%, var(--surface-color))' }}
          >
            {/* Share Button - controlled by feature_share_app */}
            {ff('feature_share_app') && <button
              onClick={async () => {
                const APP_URL = 'https://play.google.com/store/apps/details?id=com.maharajaagarsen.app';
                const appName = localStorage.getItem('selected_trust_name') || import.meta.env.VITE_DEFAULT_TRUST_NAME || 'Ek Udaan';
                const shareText = `${appName} App - official community app. Download karo Google Play Store se:`;
                const shareData = {
                  title: appName,
                  text: shareText,
                  url: APP_URL,
                };
                try {
                  if (Capacitor.isNativePlatform()) {
                    await Share.share({
                      title: shareData.title,
                      text: `${shareText} ${APP_URL}`,
                      url: APP_URL,
                      dialogTitle: `Share ${appName} App`,
                    });
                    return;
                  }
                  if (navigator.share) { await navigator.share(shareData); return; }
                  if (navigator.clipboard?.writeText) {
                    await navigator.clipboard.writeText(`${shareText} ${APP_URL}`);
                    setShareToast(true);
                    setTimeout(() => setShareToast(false), 2500);
                  } else {
                    setShareToast(true);
                    setTimeout(() => setShareToast(false), 2500);
                  }
                } catch (err) {
                  if (err?.name === 'AbortError') return;
                  try {
                    if (navigator.clipboard?.writeText) {
                      await navigator.clipboard.writeText(`${shareText} ${APP_URL}`);
                      setShareToast(true);
                      setTimeout(() => setShareToast(false), 2500);
                    }
                  } catch { /* nothing */ }
                }
              }}
              className="w-full flex items-center gap-3 px-4 rounded-xl font-semibold active:opacity-80 transition-all active:scale-95 select-none relative"
              style={{ minHeight: '48px', background: accentBg, color: secondary, WebkitTapHighlightColor: applyOpacity(secondary, 0.08) }}
            >
              <Share2 className="h-5 w-5 flex-shrink-0" />
              <span>Share App</span>
              {shareToast && (
                <span className="absolute right-4 text-xs px-2 py-0.5 rounded-full"
                  style={{ color: 'var(--surface-color)', background: secondary }}>
                  Copied!
                </span>
              )}
            </button>}

            {/* Other Membership Details — Navigate to full page */}
            <button
              onClick={() => { navigate('/other-memberships'); onClose(); }}
              className="w-full flex items-center gap-3 px-4 rounded-xl font-semibold transition-all active:scale-95 select-none relative"
              style={{
                minHeight: '50px',
                background: `linear-gradient(135deg, ${applyOpacity(accentBg, 0.6)} 0%, ${applyOpacity(accentBg, 0.8)} 100%)`,
                color: secondary,
                border: `1.5px solid ${applyOpacity(secondary, 0.15)}`,
                WebkitTapHighlightColor: applyOpacity(secondary, 0.08),
              }}
            >
              <div
                className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ background: applyOpacity(secondary, 0.12) }}
              >
                <Users className="h-4 w-4" style={{ color: secondary }} />
              </div>
              <div className="flex-1 text-left">
                <span className="text-sm font-bold">Other Membership Details</span>
                {loadingTrustLinks && (
                  <span
                    className="ml-2 text-[10px]"
                    style={{ color: 'color-mix(in srgb, var(--sidebar-text) 50%, var(--surface-color))' }}
                  >
                    Loading...
                  </span>
                )}
                {!loadingTrustLinks && memberTrustLinks.length > 0 && (
                  <span
                    className="ml-2 text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                    style={{ background: applyOpacity(secondary, 0.12), color: secondary }}
                  >
                    {memberTrustLinks.length}
                  </span>
                )}
              </div>
              <ChevronRight className="h-4 w-4 flex-shrink-0" style={{ color: secondary }} />
            </button>

          </div>

          {/* ── Logout ── */}
          <div className="px-3 pb-8" style={{ borderTop: `1px solid ${applyOpacity(primary, 0.08)}` }}>
            <button
              onClick={() => {
                if (typeof onLogout === 'function') onLogout();
                else {
                  localStorage.removeItem('user');
                  localStorage.removeItem('isLoggedIn');
                  localStorage.removeItem('lastVisitedRoute');
                  localStorage.removeItem('selected_trust_id');
                  localStorage.removeItem('selected_trust_name');
                  sessionStorage.removeItem('selectedMember');
                  sessionStorage.removeItem('previousScreen');
                  sessionStorage.removeItem('previousScreenName');
                  sessionStorage.removeItem('trust_selected_in_session');
                  navigate('/login', { replace: true });
                }
                if (onClose) onClose();
              }}
              className="w-full flex items-center justify-between px-4 rounded-xl font-bold active:opacity-80 transition-all active:scale-95 select-none"
              style={{ minHeight: '52px', background: accent, color: primary, WebkitTapHighlightColor: applyOpacity(primary, 0.08) }}
            >
              <div className="flex items-center gap-3">
                <LogOut className="h-5 w-5 flex-shrink-0" />
                <span>Logout</span>
              </div>
              <ChevronRight className="h-4 w-4 flex-shrink-0" />
            </button>
          </div>
        </div>
      </div>
    </>
  );
};

export default Sidebar;

