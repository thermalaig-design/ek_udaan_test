import { supabase } from './supabaseClient';

const EVENT_TYPES = new Set(['login', 'logout', 'autologout']);

const normalize = (value) => String(value || '').trim();

const resolvePlatform = () => {
  const ua = typeof navigator !== 'undefined' ? String(navigator.userAgent || '').toLowerCase() : '';
  if (ua.includes('android')) return 'android';
  if (ua.includes('iphone') || ua.includes('ipad') || ua.includes('ios')) return 'ios';
  return 'web';
};

const buildPayload = (user = {}, actionType = 'login', extra = {}) => {
  const memberId = normalize(user?.members_id || user?.member_id || user?.id);
  const memberName = normalize(user?.name || user?.Name);
  const mobile = normalize(user?.mobile || user?.Mobile || user?.phone);

  return {
    members_id: memberId || null,
    member_name: memberName || null,
    mobile: mobile || null,
    action_type: EVENT_TYPES.has(actionType) ? actionType : 'login',
    app_platform: resolvePlatform(),
    metadata: {
      trust_id: user?.trust?.id || user?.primary_trust?.id || null,
      trust_name: user?.trust?.name || user?.primary_trust?.name || null,
      ...extra
    }
  };
};

export const logUserSessionEvent = async ({ user, actionType, extra = {} }) => {
  try {
    const payload = buildPayload(user, actionType, extra);
    const { error } = await supabase.from('member_session').insert(payload);
    if (error) {
      console.warn('[SessionAudit] insert failed:', error.message || error);
      return { success: false, error };
    }
    return { success: true };
  } catch (error) {
    console.warn('[SessionAudit] unexpected error:', error?.message || error);
    return { success: false, error };
  }
};
