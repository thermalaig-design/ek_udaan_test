const USER_STORAGE_KEY = 'user';
const LOGGED_IN_STORAGE_KEY = 'isLoggedIn';

const removeLocalStorageByPrefix = (prefixes = []) => {
  try {
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!key) continue;
      if (prefixes.some((prefix) => key.startsWith(prefix))) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach((key) => localStorage.removeItem(key));
  } catch {
    // ignore storage cleanup failures
  }
};

const compactMembership = (membership = {}) => ({
  trust_id: membership?.trust_id || null,
  trust_name: membership?.trust_name || null,
  role: membership?.role || null,
  is_active: Boolean(membership?.is_active),
  member_id: membership?.member_id || membership?.members_id || null,
  members_id: membership?.members_id || membership?.member_id || null,
  membership_number: membership?.membership_number || membership?.['Membership number'] || null,
});

export const compactUserForStorage = (user = {}) => {
  const memberships = Array.isArray(user?.hospital_memberships) ? user.hospital_memberships : [];
  const compactMemberships = memberships.slice(0, 25).map(compactMembership);

  return {
    id: user?.id || user?.members_id || null,
    members_id: user?.members_id || user?.id || null,
    member_id: user?.member_id || user?.members_id || user?.id || null,
    Name: user?.Name || user?.name || '',
    name: user?.name || user?.Name || '',
    Mobile: user?.Mobile || user?.mobile || user?.phone || '',
    mobile: user?.mobile || user?.Mobile || user?.phone || '',
    phone: user?.phone || user?.Mobile || user?.mobile || '',
    'Membership number': user?.['Membership number'] || user?.membership_number || '',
    membership_number: user?.membership_number || user?.['Membership number'] || '',
    Email: user?.Email || user?.email || '',
    email: user?.email || user?.Email || '',
    primary_trust: user?.primary_trust
      ? {
        id: user.primary_trust.id || null,
        name: user.primary_trust.name || null,
      }
      : null,
    hospital_memberships: compactMemberships,
  };
};

const setLocalStorageWithRecovery = (key, value) => {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (err) {
    const isQuotaError = err?.name === 'QuotaExceededError';
    if (!isQuotaError) return false;

    removeLocalStorageByPrefix([
      'gallery_normalized_cache_',
      'gallery_persistent_cache_',
      'sponsors_cache_',
      'sponsors_list_cache_',
      'marquee_cache_',
      'memberTrustLinks_',
      'trust_list_cache',
      'theme_cache_',
      'directory_cache_',
    ]);

    try {
      localStorage.setItem(key, value);
      return true;
    } catch {
      return false;
    }
  }
};

export const persistUserSession = (user = {}) => {
  const compactUser = compactUserForStorage(user);
  const compactPayload = JSON.stringify(compactUser);
  if (setLocalStorageWithRecovery(USER_STORAGE_KEY, compactPayload)) {
    try {
      localStorage.setItem(LOGGED_IN_STORAGE_KEY, 'true');
      return { success: true };
    } catch {
      return { success: false, message: 'Unable to persist login state' };
    }
  }

  const minimalUser = {
    id: compactUser?.id || null,
    members_id: compactUser?.members_id || null,
    Name: compactUser?.Name || compactUser?.name || '',
    name: compactUser?.name || compactUser?.Name || '',
    Mobile: compactUser?.Mobile || compactUser?.mobile || '',
    mobile: compactUser?.mobile || compactUser?.Mobile || '',
    'Membership number': compactUser?.['Membership number'] || '',
    membership_number: compactUser?.membership_number || '',
  };

  if (setLocalStorageWithRecovery(USER_STORAGE_KEY, JSON.stringify(minimalUser))) {
    try {
      localStorage.setItem(LOGGED_IN_STORAGE_KEY, 'true');
      return { success: true, degraded: true };
    } catch {
      return { success: false, message: 'Unable to persist login state' };
    }
  }

  return {
    success: false,
    message: 'Device storage is full. Please clear app/browser storage and try again.',
  };
};
