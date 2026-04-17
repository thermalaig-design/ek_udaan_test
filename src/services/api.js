import axios from 'axios';
import { getCurrentNotificationContext } from './notificationAudience';

const buildNotificationContentKey = (notification) => {
  const title = String(notification?.title || '').trim().toLowerCase();
  const message = String(notification?.message || notification?.body || '').trim().toLowerCase();
  const type = String(notification?.type || '').trim().toLowerCase();
  const createdAt = String(notification?.created_at || '').trim();
  const createdAtSecond = createdAt ? createdAt.slice(0, 19) : '';
  return `${type}|${title}|${message}|${createdAtSecond}`;
};

const isMissingNotificationsColumnError = (error, columnName) => {
  const message = String(error?.message || '');
  const safeColumn = String(columnName || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`column\\s+notifications\\.${safeColumn}\\s+does not exist`, 'i');
  return pattern.test(message);
};


// Force local backend for current development flow.
const resolveDevApiBaseUrl = () => {
  return 'http://localhost:5003/api';
};

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ||
  (import.meta.env.DEV
    ? resolveDevApiBaseUrl()
    : 'https://test-mahila-mandal.vercel.app/api');


// Create axios instance
export const api = axios.create({
  baseURL: API_BASE_URL,
});

// Get all members
export const getAllMembers = async (trustId = null, trustName = null) => {
  try {
    const params = new URLSearchParams();
    if (trustId) params.append('trust_id', trustId);
    if (trustName) params.append('trust_name', trustName);
    const response = await api.get(`/members${params.toString() ? `?${params}` : ''}`);
    return response.data;
  } catch (error) {
    console.error('Error fetching all members:', error);
    throw error;
  }
};

// Get members by page
export const getMembersPage = async (page = 1, limit = 100, trustId = null, trustName = null) => {
  try {
    const params = new URLSearchParams();
    params.append('page', page);
    params.append('limit', limit);
    if (trustId) params.append('trust_id', trustId);
    if (trustName) params.append('trust_name', trustName);
    const response = await api.get(`/members?${params}`);
    return response.data;
  } catch (error) {
    console.error('Error fetching members page:', error);
    throw error;
  }
};

// Get doctors
export const getDoctors = async () => {
  try {
    const response = await api.get('/doctors');
    return response.data;
  } catch (error) {
    console.error('Error fetching doctors:', error);
    throw error;
  }
};

// Get members by type
export const getMembersByType = async (type, trustId = null, trustName = null) => {
  try {
    const params = new URLSearchParams();
    if (trustId) params.append('trust_id', trustId);
    if (trustName) params.append('trust_name', trustName);
    const response = await api.get(`/members/type/${type}${params.toString() ? `?${params}` : ''}`);
    return response.data;
  } catch (error) {
    console.error(`Error fetching members of type ${type}:`, error);
    throw error;
  }
};

// Search members
export const searchMembers = async (query, type = null, trustId = null, trustName = null) => {
  try {
    const params = new URLSearchParams();
    if (query) params.append('query', query);
    if (type) params.append('type', type);
    if (trustId) params.append('trust_id', trustId);
    if (trustName) params.append('trust_name', trustName);

    const response = await api.get(`/members/search?${params}`);
    return response.data;
  } catch (error) {
    console.error('Error searching members:', error);
    throw error;
  }
};

// Get member types
export const getMemberTypes = async (trustId = null, trustName = null) => {
  try {
    const params = new URLSearchParams();
    if (trustId) params.append('trust_id', trustId);
    if (trustName) params.append('trust_name', trustName);
    const response = await api.get(`/members/types${params.toString() ? `?${params}` : ''}`);
    return response.data;
  } catch (error) {
    console.error('Error fetching member types:', error);
    throw error;
  }
};

// Get all doctors (from reg_members where role includes doctor)
export const getAllDoctors = async (trustId = null, trustName = null) => {
  try {
    const params = new URLSearchParams();
    if (trustId) params.append('trust_id', trustId);
    if (trustName) params.append('trust_name', trustName);
    const response = await api.get(`/doctors${params.toString() ? `?${params}` : ''}`);
    return response.data;
  } catch (error) {
    console.error('Error fetching doctors:', error);
    throw error;
  }
};

// Get all committee members
export const getAllCommitteeMembers = async (trustId = null, trustName = null) => {
  try {
    const params = new URLSearchParams();
    if (trustId) params.append('trust_id', trustId);
    if (trustName) params.append('trust_name', trustName);
    const response = await api.get(`/committee${params.toString() ? `?${params}` : ''}`);
    return response.data;
  } catch (error) {
    console.error('Error fetching committee members:', error);
    throw error;
  }
};

// Get all hospitals
export const getAllHospitals = async (trustId = null, trustName = null) => {
  try {
    const params = new URLSearchParams();
    if (trustId) params.append('trust_id', trustId);
    if (trustName) params.append('trust_name', trustName);
    const response = await api.get(`/hospitals${params.toString() ? `?${params}` : ''}`);
    return response.data;
  } catch (error) {
    console.error('Error fetching hospitals:', error);
    throw error;
  }
};

// Get all elected members
export const getAllElectedMembers = async (trustId = null, trustName = null) => {
  try {
    const params = new URLSearchParams();
    if (trustId) params.append('trust_id', trustId);
    if (trustName) params.append('trust_name', trustName);
    const response = await api.get(`/elected-members${params.toString() ? `?${params}` : ''}`);
    return response.data;
  } catch (error) {
    console.error('Error fetching elected members:', error);
    throw error;
  }
};

// Referral API functions
export const createReferral = async (referralData) => {
  try {
    const user = localStorage.getItem('user');
    const userId = user ? JSON.parse(user).Mobile || JSON.parse(user).mobile || JSON.parse(user).id : null;

    const response = await api.post('/referrals', referralData, {
      headers: {
        'user-id': userId,
        'user': user
      }
    });
    return response.data;
  } catch (error) {
    console.error('Error creating referral:', error);
    throw error;
  }
};

export const getUserReferrals = async () => {
  try {
    const user = localStorage.getItem('user');
    const userId = user ? JSON.parse(user).Mobile || JSON.parse(user).mobile || JSON.parse(user).id : null;

    const response = await api.get('/referrals/my-referrals', {
      headers: {
        'user-id': userId
      }
    });
    return response.data;
  } catch (error) {
    console.error('Error fetching referrals:', error);
    throw error;
  }
};

export const getReferralCounts = async () => {
  try {
    const user = localStorage.getItem('user');
    const userId = user ? JSON.parse(user).Mobile || JSON.parse(user).mobile || JSON.parse(user).id : null;

    const response = await api.get('/referrals/counts', {
      headers: {
        'user-id': userId
      }
    });
    return response.data;
  } catch (error) {
    console.error('Error fetching referral counts:', error);
    throw error;
  }
};

export const updateReferral = async (referralId, referralData) => {
  try {
    const user = localStorage.getItem('user');
    const userId = user ? JSON.parse(user).Mobile || JSON.parse(user).mobile || JSON.parse(user).id : null;

    const response = await api.patch(`/referrals/${referralId}`, referralData, {
      headers: {
        'user-id': userId,
        'user': user
      }
    });
    return response.data;
  } catch (error) {
    console.error('Error updating referral:', error);
    throw error;
  }
};

export const deleteReferral = async (referralId) => {
  try {
    const user = localStorage.getItem('user');
    const userId = user ? JSON.parse(user).Mobile || JSON.parse(user).mobile || JSON.parse(user).id : null;

    const response = await api.delete(`/referrals/${referralId}`, {
      headers: {
        'user-id': userId
      }
    });
    return response.data;
  } catch (error) {
    console.error('Error deleting referral:', error);
    throw error;
  }
};

const isUuid = (value) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || '').trim());

const resolveMembersIdForProfile = async (parsedUser, profileData = {}, trustId = null) => {
  const directIds = [
    parsedUser?.members_id,
    parsedUser?.member_id,
    parsedUser?.id,
    profileData?.members_id,
    profileData?.id
  ].filter(Boolean);

  for (const id of directIds) {
    if (isUuid(id)) return String(id);
  }

  const { supabase } = await import('./supabaseClient.js');
  const mobileRaw = profileData?.mobile || parsedUser?.Mobile || parsedUser?.mobile || parsedUser?.phone || '';
  const mobileDigits = String(mobileRaw).replace(/\D/g, '');
  const mobileVariants = Array.from(new Set([mobileRaw, mobileDigits, mobileDigits.slice(-10), `+91${mobileDigits.slice(-10)}`].filter(Boolean)));

  for (const mobile of mobileVariants) {
    const { data } = await supabase
      .from('Members')
      .select('members_id')
      .eq('Mobile', mobile)
      .limit(1);
    if (data?.[0]?.members_id) return data[0].members_id;
  }

  const membershipNo = profileData?.memberId || parsedUser?.membershipNumber || parsedUser?.['Membership number'] || parsedUser?.membership_number || '';
  if (membershipNo) {
    const { data: memberByMNo } = await supabase
      .from('Members')
      .select('members_id')
      .eq('Membership number', membershipNo)
      .limit(1);
    if (memberByMNo?.[0]?.members_id) return memberByMNo[0].members_id;

    let regQuery = supabase
      .from('reg_members')
      .select('members_id')
      .eq('Membership number', membershipNo)
      .limit(1);
    if (trustId) regQuery = regQuery.eq('trust_id', trustId);
    const { data: regMember } = await regQuery;
    if (regMember?.[0]?.members_id) return regMember[0].members_id;
  }

  return null;
};

const fetchProfileDirectFromSupabase = async (parsedUser, trustId = null) => {
  const { supabase } = await import('./supabaseClient.js');
  const membersId = await resolveMembersIdForProfile(parsedUser, {}, trustId);
  if (!membersId) {
    return {
      success: true,
      profile: {
        name: parsedUser?.name || parsedUser?.Name || '',
        mobile: parsedUser?.mobile || parsedUser?.Mobile || '',
        email: parsedUser?.email || parsedUser?.Email || '',
        members_id: null
      }
    };
  }

  const { data: profile, error } = await supabase
    .from('member_profiles')
    .select('*')
    .eq('members_id', membersId)
    .maybeSingle();
  if (error) throw error;

  return {
    success: true,
    profile: {
      name: parsedUser?.name || parsedUser?.Name || '',
      mobile: parsedUser?.mobile || parsedUser?.Mobile || '',
      email: parsedUser?.email || parsedUser?.Email || '',
      members_id: membersId,
      profile_photo_url: profile?.profile_photo_url || '',
      gender: profile?.gender || '',
      dob: profile?.date_of_birth || '',
      blood_group: profile?.blood_group || '',
      marital_status: profile?.marital_status || '',
      nationality: profile?.nationality || 'Indian',
      aadhaar_id: profile?.aadhaar_id || '',
      emergency_contact_name: profile?.emergency_contact_name || '',
      emergency_contact_number: profile?.emergency_contact_number || '',
      spouse_name: profile?.spouse_name || '',
      spouse_contact_number: profile?.spouse_contact || '',
      children_count: profile?.no_of_children ?? '',
      facebook: profile?.facebook || '',
      twitter: profile?.twitter || '',
      instagram: profile?.instagram || '',
      linkedin: profile?.linkedin || '',
      whatsapp: profile?.whatsapp || ''
    }
  };
};

const saveProfileDirectToSupabase = async (profileData, parsedUser, trustId = null) => {
  const { supabase } = await import('./supabaseClient.js');
  const membersId = await resolveMembersIdForProfile(parsedUser, profileData, trustId);
  if (!membersId) {
    throw new Error('Member not found');
  }

  const upsertPayload = {
    members_id: membersId,
    profile_photo_url: profileData.profile_photo_url || null,
    gender: profileData.gender || null,
    date_of_birth: profileData.dob || null,
    blood_group: profileData.blood_group || null,
    marital_status: profileData.marital_status || null,
    nationality: profileData.nationality || 'Indian',
    aadhaar_id: profileData.aadhaar_id || null,
    emergency_contact_name: profileData.emergency_contact_name || null,
    emergency_contact_number: profileData.emergency_contact_number || null,
    spouse_name: profileData.spouse_name || null,
    spouse_contact: profileData.spouse_contact_number || null,
    no_of_children: profileData.children_count !== '' && profileData.children_count !== null
      ? Number(profileData.children_count) : 0,
    facebook: profileData.facebook || null,
    twitter: profileData.twitter || null,
    instagram: profileData.instagram || null,
    linkedin: profileData.linkedin || null,
    whatsapp: profileData.whatsapp || null,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from('member_profiles')
    .upsert(upsertPayload, { onConflict: 'members_id' });
  if (error) throw error;

  return {
    success: true,
    profile: {
      ...profileData,
      members_id: membersId
    }
  };
};

// Preload commonly used data
// Get user profile
export const getProfile = async () => {
  try {
    const user = localStorage.getItem('user');
    const parsedUser = user ? JSON.parse(user) : null;
    const userId = parsedUser ? parsedUser.Mobile || parsedUser.mobile || parsedUser.id : null;
    const membersId = parsedUser?.members_id || parsedUser?.member_id || parsedUser?.id || null;
    const trustId = localStorage.getItem('selected_trust_id') || null;

    if (!userId) {
      throw new Error('No user found in localStorage');
    }

    const response = await api.get('/profile', {
      headers: {
        'user-id': userId,
        ...(membersId ? { 'members-id': membersId } : {}),
        ...(trustId ? { 'trust-id': trustId } : {})
      }
    });
    return response.data;
  } catch (error) {
    console.error('Error fetching profile:', error);
    const status = error?.response?.status;
    if (status === 404 || status === 500) {
      const user = localStorage.getItem('user');
      const parsedUser = user ? JSON.parse(user) : null;
      if (parsedUser) {
        return await fetchProfileDirectFromSupabase(parsedUser, localStorage.getItem('selected_trust_id') || null);
      }
    }
    throw error;
  }
};

// Save user profile
export const saveProfile = async (profileData, profilePhotoFile) => {
  try {
    const user = localStorage.getItem('user');
    const parsedUser = user ? JSON.parse(user) : null;
    const userId = parsedUser ? parsedUser.Mobile || parsedUser.mobile || parsedUser.id : null;
    const membersId = parsedUser?.members_id || parsedUser?.member_id || parsedUser?.id || profileData?.members_id || null;
    const trustId = localStorage.getItem('selected_trust_id') || null;

    if (!userId) {
      throw new Error('No user found in localStorage');
    }

    const formData = new FormData();
    formData.append('profileData', JSON.stringify(profileData));
    if (profilePhotoFile) {
      formData.append('profilePhoto', profilePhotoFile);
    }

    const response = await api.post('/profile/save', formData, {
      headers: {
        'user-id': userId,
        ...(membersId ? { 'members-id': membersId } : {}),
        ...(trustId ? { 'trust-id': trustId } : {})
      }
    });
    return response.data;
  } catch (error) {
    console.error('Error saving profile:', error);
    const status = error?.response?.status;
    const serverMessage = error?.response?.data?.message || error?.response?.data?.error || error?.message || '';
    const shouldFallback =
      status === 404 ||
      /member not found/i.test(String(serverMessage)) ||
      /not found/i.test(String(serverMessage));

    if (shouldFallback) {
      const user = localStorage.getItem('user');
      const parsedUser = user ? JSON.parse(user) : null;
      if (parsedUser) {
        return await saveProfileDirectToSupabase(profileData, parsedUser, localStorage.getItem('selected_trust_id') || null);
      }
    }

    if (serverMessage) throw new Error(serverMessage);
    throw error;
  }
};
// Get marquee updates â€” direct Supabase (no backend needed)
export const getMarqueeUpdates = async (trustId = null, trustName = null) => {
  try {
    const { supabase } = await import('./supabaseClient.js');

    // Resolve trustId from trustName if needed
    let resolvedTrustId = trustId || null;
    if (!resolvedTrustId && trustName) {
      const { data: trustData } = await supabase
        .from('Trust')
        .select('id')
        .ilike('name', String(trustName).trim())
        .limit(1);
      if (trustData?.[0]?.id) resolvedTrustId = trustData[0].id;
    }

    let query = supabase
      .from('marquee_updates')
      .select('id, trust_id, message, is_active, priority')
      .eq('is_active', true)
      .order('priority', { ascending: false });

    if (resolvedTrustId) {
      query = query.eq('trust_id', resolvedTrustId);
    }

    const { data, error } = await query;
    if (error) throw error;

    return {
      success: true,
      data: (data || []).map(item => ({ message: item.message, ...item })),
    };
  } catch (error) {
    console.error('Error fetching marquee updates:', error);
    return { success: false, data: [] };
  }
};

// Get sponsor information
export const getSponsors = async (trustId = null, trustName = null) => {
  try {
    const { supabase } = await import('./supabaseClient.js');
    const getTodayLocal = () => {
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };
    const getUserMobileDigits = () => {
      if (typeof window === 'undefined') return '';
      try {
        const userStr = localStorage.getItem('user');
        if (!userStr) return '';
        const user = JSON.parse(userStr);
        const rawMobile = user?.Mobile || user?.mobile || user?.phone || '';
        return String(rawMobile).replace(/\D/g, '');
      } catch {
        return '';
      }
    };
    const isRefMatch = (refNo, userDigits) => {
      if (!refNo || !userDigits) return false;
      const refDigits = String(refNo).replace(/\D/g, '');
      if (!refDigits) return false;
      return refDigits === userDigits || refDigits.slice(-10) === userDigits.slice(-10);
    };

    let resolvedTrustId = trustId || null;
    if (!resolvedTrustId && trustName) {
      const { data: trustData, error: trustError } = await supabase
        .from('Trust')
        .select('id')
        .eq('name', trustName)
        .limit(1);
      if (!trustError && Array.isArray(trustData) && trustData[0]?.id) {
        resolvedTrustId = trustData[0].id;
      }
    }

    if (!resolvedTrustId) {
      return { success: true, data: [] };
    }

    const sponsorFieldVariants = [
      `
        id,
        name,
        position,
        about,
        photo_url,
        company_name,
        ref_no,
        created_at,
        updated_at,
        phone,
        badge_label,
        email_id,
        address,
        city,
        state,
        whatsapp_number,
        website_url,
        catalog_url
      `,
      `
        id,
        name,
        position,
        about,
        photo_url,
        company_name,
        ref_no,
        created_at,
        updated_at,
        "ContactNumber1",
        badge_label,
        email_id1,
        address,
        city,
        state,
        whatsapp_number,
        website_url,
        catalog_url
      `,
      `
        id,
        name,
        position,
        about,
        photo_url,
        company_name,
        ref_no,
        created_at,
        updated_at,
        badge_label,
        address,
        city,
        state,
        whatsapp_number,
        website_url,
        catalog_url
      `
    ];

    const flashFieldVariants = [
      `
        id,
        trust_id,
        start_date,
        end_date,
        duration_seconds,
        priority
      `,
      `
        id,
        trust_id,
        start_date,
        end_date,
        priority
      `
    ];

    const activeModes = ['is_active', 'status', 'none'];
    let data = null;
    let error = null;

    for (const sponsorFields of sponsorFieldVariants) {
      for (const flashFields of flashFieldVariants) {
        for (const activeMode of activeModes) {
          let query = supabase
            .from('sponsor_flash')
            .select(`
              ${flashFields},
              sponsors (${sponsorFields})
            `)
            .eq('trust_id', resolvedTrustId);

          if (activeMode === 'is_active') {
            query = query.eq('is_active', true);
          } else if (activeMode === 'status') {
            query = query.eq('status', 'active');
          }

          const result = await query;
          data = result.data;
          error = result.error;
          if (!error) break;
        }
        if (!error) break;
      }
      if (!error) break;
    }

    if (error) throw error;

    const today = getTodayLocal();
    const userMobileDigits = getUserMobileDigits();
    const mapped = (data || [])
      .filter((row) => {
        const sponsor = Array.isArray(row?.sponsors) ? row.sponsors[0] : row?.sponsors || null;
        if (!sponsor) return false;
        if (row.start_date && !/^\d{4}-\d{2}-\d{2}$/.test(row.start_date)) return false;
        if (row.end_date && !/^\d{4}-\d{2}-\d{2}$/.test(row.end_date)) return false;
        const startOk = !row.start_date || row.start_date <= today;
        // null end_date = no expiry (always active); otherwise must not be past
        const endOk = !row.end_date || row.end_date >= today;
        return startOk && endOk;
      })
      .map((row) => ({
        sponsor_ref: Array.isArray(row?.sponsors) ? row.sponsors[0] || null : row?.sponsors || null,
        flash_id: row.id,
        trust_id: row.trust_id,
        start_date: row.start_date,
        end_date: row.end_date,
        duration_seconds: row.duration_seconds,
        flash_priority: row.priority
      }))
      .filter((item) => item.sponsor_ref)
      .map((item) => ({
        id: item.sponsor_ref.id,
        name: item.sponsor_ref.name,
        position: item.sponsor_ref.position,
        about: item.sponsor_ref.about,
        photo_url: item.sponsor_ref.photo_url,
        company_name: item.sponsor_ref.company_name,
        ref_no: item.sponsor_ref.ref_no,
        created_at: item.sponsor_ref.created_at,
        updated_at: item.sponsor_ref.updated_at,
        phone: item.sponsor_ref.phone || item.sponsor_ref.ContactNumber1 || null,
        badge_label: item.sponsor_ref.badge_label,
        email_id: item.sponsor_ref.email_id || item.sponsor_ref.email_id1 || null,
        address: item.sponsor_ref.address,
        city: item.sponsor_ref.city,
        state: item.sponsor_ref.state,
        whatsapp_number: item.sponsor_ref.whatsapp_number,
        website_url: item.sponsor_ref.website_url,
        catalog_url: item.sponsor_ref.catalog_url,
        is_user_match: isRefMatch(item.sponsor_ref.ref_no, userMobileDigits),
        flash_id: item.flash_id,
        trust_id: item.trust_id,
        start_date: item.start_date,
        end_date: item.end_date,
        duration_seconds: item.duration_seconds,
        flash_priority: item.flash_priority
      }))
      .sort((a, b) => {
        const priorityDiff = (b.flash_priority || 0) - (a.flash_priority || 0);
        if (priorityDiff !== 0) return priorityDiff;
        if (a.is_user_match !== b.is_user_match) return a.is_user_match ? -1 : 1;
        const refDiff = (b.ref_no || 0) - (a.ref_no || 0);
        if (refDiff !== 0) return refDiff;
        return String(a.company_name || '').localeCompare(String(b.company_name || ''));
      });

    return { success: true, data: mapped };
  } catch (error) {
    console.error('Error fetching sponsors:', error);
    throw error;
  }
};

// Get specific sponsor by ID
export const getSponsorById = async (id) => {
  try {
    const { supabase } = await import('./supabaseClient.js');
    const sponsorFieldVariants = [
      `
        id,
        name,
        position,
        about,
        photo_url,
        company_name,
        ref_no,
        created_at,
        updated_at,
        phone,
        badge_label,
        email_id,
        address,
        city,
        state,
        whatsapp_number,
        website_url,
        catalog_url
      `,
      `
        id,
        name,
        position,
        about,
        photo_url,
        company_name,
        ref_no,
        created_at,
        updated_at,
        "ContactNumber1",
        badge_label,
        email_id1,
        address,
        city,
        state,
        whatsapp_number,
        website_url,
        catalog_url
      `,
      `
        id,
        name,
        position,
        about,
        photo_url,
        company_name,
        ref_no,
        created_at,
        updated_at,
        badge_label,
        address,
        city,
        state,
        whatsapp_number,
        website_url,
        catalog_url
      `
    ];

    let data = null;
    let error = null;
    for (const fields of sponsorFieldVariants) {
      const result = await supabase
        .from('sponsors')
        .select(fields)
        .eq('id', id)
        .limit(1);
      data = result.data;
      error = result.error;
      if (!error) break;
    }

    if (error) throw error;
    const rawSponsor = Array.isArray(data) ? data[0] : data;
    const sponsor = rawSponsor
      ? {
        ...rawSponsor,
        phone: rawSponsor.phone || rawSponsor.ContactNumber1 || null,
        email_id: rawSponsor.email_id || rawSponsor.email_id1 || null
      }
      : null;
    return { success: true, data: sponsor ? [sponsor] : [] };
  } catch (error) {
    console.error('Error fetching sponsor:', error);
    throw error;
  }
};

// Get user reports
export const getUserReports = async () => {
  try {
    const user = localStorage.getItem('user');
    const userId = user ? JSON.parse(user).Mobile || JSON.parse(user).mobile || JSON.parse(user).id : null;

    if (!userId) {
      throw new Error('No user found in localStorage');
    }

    const response = await api.get('/reports', {
      headers: {
        'user-id': userId
      }
    });
    return response.data;
  } catch (error) {
    console.error('Error fetching reports:', error);
    throw error;
  }
};

// Get user notifications â€” directly from Supabase
export const getUserNotifications = async () => {
  try {
    const { supabase } = await import('./supabaseClient.js');
    const { userId, userIdVariants, audienceVariants } = getCurrentNotificationContext();

    if (!userId) {
      throw new Error('No user found in localStorage');
    }

    // Fallback mapping:
    // Notifications can be stored with user_id = patient_phone, patient_name, membership_number, or user_id.
    // We query appointments by patient_phone variants to find all possible user_ids used in notifications.
    const { data: linkedAppointments } = await supabase
      .from('appointments')
      .select('patient_name, membership_number, user_id, patient_phone')
      .in('patient_phone', userIdVariants)
      .limit(500);

    const fallbackUserIds = new Set();
    (linkedAppointments || []).forEach((row) => {
      const patientName = String(row?.patient_name || '').trim();
      const membershipNumber = String(row?.membership_number || '').trim();
      const appointmentUserId = String(row?.user_id || '').trim();
      // âœ… patient_phone explicitly â€” this is what the Supabase trigger stores as user_id
      const patientPhone = String(row?.patient_phone || '').trim();

      if (patientName) fallbackUserIds.add(patientName);
      if (membershipNumber) fallbackUserIds.add(membershipNumber);
      if (appointmentUserId) fallbackUserIds.add(appointmentUserId);

      // Add patient_phone and its variants (e.g. 9911334455, 919911334455, +919911334455)
      if (patientPhone) {
        fallbackUserIds.add(patientPhone);
        const digitsOnly = patientPhone.replace(/\D/g, '');
        if (digitsOnly) {
          fallbackUserIds.add(digitsOnly);
          if (digitsOnly.length >= 10) fallbackUserIds.add(digitsOnly.slice(-10));
          if (!digitsOnly.startsWith('91') && digitsOnly.length === 10) {
            fallbackUserIds.add(`91${digitsOnly}`);
          }
          if (digitsOnly.length === 10) fallbackUserIds.add(`+91${digitsOnly}`);
          fallbackUserIds.add(`+${digitsOnly}`);
        }
      }
    });

    const notificationUserIds = [...new Set([...userIdVariants, ...fallbackUserIds])];

    let userNotifications = [];
    const { data: directNotifications, error: userNotifError } = await supabase
      .from('notifications')
      .select('*')
      .in('user_id', notificationUserIds)
      .order('created_at', { ascending: false });

    if (userNotifError) {
      if (isMissingNotificationsColumnError(userNotifError, 'user_id')) {
        console.warn('[Notifications] notifications.user_id column missing; returning audience notifications only.');
      } else {
        throw userNotifError;
      }
    } else {
      userNotifications = directNotifications || [];
    }

    const { data: audienceNotifications, error: audienceError } = await supabase
      .from('notifications')
      .select('*')
      .in('target_audience', audienceVariants)
      .order('created_at', { ascending: false });

    if (audienceError) throw audienceError;

    const merged = [...(userNotifications || []), ...(audienceNotifications || [])];
    const uniqueById = [...new Map(merged.map((item) => [item.id, item])).values()];
    uniqueById.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    const seenContent = new Set();
    const deduped = [];
    for (const notification of uniqueById) {
      const key = buildNotificationContentKey(notification);
      if (seenContent.has(key)) continue;
      seenContent.add(key);
      deduped.push(notification);
    }

    return { success: true, data: deduped };
  } catch (error) {
    console.error('Error fetching notifications:', error);
    return { success: false, message: error.message, data: [] };
  }
};

// Mark notification as read â€” directly via Supabase
export const markNotificationAsRead = async (id) => {
  try {
    const { supabase } = await import('./supabaseClient.js');
    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('id', id);

    if (error) throw error;
    return { success: true };
  } catch (error) {
    console.error('Error marking notification as read:', error);
    throw error;
  }
};

// Mark all notifications as read â€” directly via Supabase
export const markAllNotificationsAsRead = async () => {
  try {
    const { supabase } = await import('./supabaseClient.js');
    const { userId, userIdVariants, audienceVariants } = getCurrentNotificationContext();

    if (!userId) {
      throw new Error('No user found in localStorage');
    }

    const { data: linkedAppointments } = await supabase
      .from('appointments')
      .select('patient_name, membership_number, user_id, patient_phone')
      .in('patient_phone', userIdVariants)
      .limit(500);

    const fallbackUserIds = new Set();
    (linkedAppointments || []).forEach((row) => {
      const patientName = String(row?.patient_name || '').trim();
      const membershipNumber = String(row?.membership_number || '').trim();
      const appointmentUserId = String(row?.user_id || '').trim();
      const patientPhone = String(row?.patient_phone || '').trim();

      if (patientName) fallbackUserIds.add(patientName);
      if (membershipNumber) fallbackUserIds.add(membershipNumber);
      if (appointmentUserId) fallbackUserIds.add(appointmentUserId);

      // âœ… patient_phone variants â€” matches notifications stored by trigger using patient_phone
      if (patientPhone) {
        fallbackUserIds.add(patientPhone);
        const digitsOnly = patientPhone.replace(/\D/g, '');
        if (digitsOnly) {
          fallbackUserIds.add(digitsOnly);
          if (digitsOnly.length >= 10) fallbackUserIds.add(digitsOnly.slice(-10));
          if (!digitsOnly.startsWith('91') && digitsOnly.length === 10) {
            fallbackUserIds.add(`91${digitsOnly}`);
          }
          if (digitsOnly.length === 10) fallbackUserIds.add(`+91${digitsOnly}`);
          fallbackUserIds.add(`+${digitsOnly}`);
        }
      }
    });

    const notificationUserIds = [...new Set([...userIdVariants, ...fallbackUserIds])];

    const { error: userError } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('is_read', false)
      .in('user_id', notificationUserIds);

    if (userError && !isMissingNotificationsColumnError(userError, 'user_id')) {
      throw userError;
    }
    if (userError && isMissingNotificationsColumnError(userError, 'user_id')) {
      console.warn('[Notifications] notifications.user_id column missing; skipping direct user mark-as-read update.');
    }

    const { error: audienceError } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('is_read', false)
      .in('target_audience', audienceVariants);

    if (audienceError) throw audienceError;
    return { success: true };
  } catch (error) {
    console.error('Error marking all notifications as read:', error);
    throw error;
  }
};

// Get member trust links â€” direct Supabase query (no backend needed)
export const getMemberTrustLinks = async (memberId) => {
  try {
    if (!memberId) {
      throw new Error('memberId is required');
    }
    const { supabase } = await import('./supabaseClient.js');
    const { data: links, error } = await supabase
      .from('member_trust_links')
      .select(`
        id,
        member_id,
        trust_id,
        membership_no,
        location,
        remark1,
        remark2,
        is_active,
        created_at,
        Trust:trust_id (
          id,
          name,
          icon_url
        )
      `)
      .eq('member_id', memberId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching member trust links from Supabase:', error);
      throw error;
    }

    return { success: true, data: links || [], count: (links || []).length };
  } catch (error) {
    console.error(`Error fetching trust links for member ${memberId}:`, error);
    return { success: false, data: [], message: error.message };
  }
};

// Delete/dismiss a specific notification â€” uses Supabase directly (no backend needed)
export const deleteNotification = async (id) => {
  try {
    const { supabase } = await import('./supabaseClient.js');
    const { error } = await supabase
      .from('notifications')
      .delete()
      .eq('id', id);

    if (error) throw error;
    return { success: true };
  } catch (error) {
    console.error('Error deleting notification:', error);
    throw error;
  }
};

// Upload user report
export const uploadUserReport = async (reportData, reportFile) => {
  try {
    const user = localStorage.getItem('user');
    const userId = user ? JSON.parse(user).Mobile || JSON.parse(user).mobile || JSON.parse(user).id : null;

    if (!userId) {
      throw new Error('No user found in localStorage');
    }

    // Prepare form data
    const formData = new FormData();
    formData.append('reportName', reportData.reportName);
    formData.append('reportType', reportData.reportType);
    formData.append('testDate', reportData.testDate);
    if (reportFile) {
      formData.append('reportFile', reportFile);
    }

    const response = await api.post('/reports/upload', formData, {
      headers: {
        'user-id': userId
      }
    });
    return response.data;
  } catch (error) {
    console.error('Error uploading report:', error);
    throw error;
  }
};


// Get profile photos for multiple members
export const getProfilePhotos = async (memberIds) => {
  try {
    const response = await api.post('/profile/photos', { memberIds });
    return response.data;
  } catch (error) {
    console.error('Error fetching profile photos:', error);
    throw error;
  }
};

export const preloadCommonData = async () => {
  try {
    const trustId = localStorage.getItem('selected_trust_id') || null;
    const trustName = localStorage.getItem('selected_trust_name') || null;
    // Load small amounts of data in parallel for quick initial load
    const [membersPreview, memberTypes, hospitals] = await Promise.allSettled([
      getMembersPage(1, 50, trustId, trustName),  // Get a small preview
      getMemberTypes(trustId, trustName),
      getAllHospitals(trustId, trustName)       // Hospitals are typically small dataset
    ]);

    const result = {
      membersPreview: membersPreview.status === 'fulfilled' ? membersPreview.value : null,
      memberTypes: memberTypes.status === 'fulfilled' ? memberTypes.value : null,
      hospitals: hospitals.status === 'fulfilled' ? hospitals.value : null
    };

    console.log('âœ… Preloaded common data for faster directory loading');
    return result;
  } catch (error) {
    console.error('Error preloading common data:', error);
    return {};
  }
};

