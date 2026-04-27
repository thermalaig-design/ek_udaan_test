// authService.js - Frontend auth helpers
import { supabase } from './supabaseClient';

const USE_MOCK_AUTH = import.meta.env.VITE_AUTH_MOCK === 'true';
const MOCK_OTP = '123456';
const BASE_TRUST_ID = import.meta.env.VITE_DEFAULT_TRUST_ID || 'b353d2ff-ec3b-4b90-a896-69f40662084e';

const buildMockUser = (phoneNumber) => ({
  id: phoneNumber,
  members_id: phoneNumber,
  member_ids: [phoneNumber],
  mobile: phoneNumber,
  name: 'Test User',
  type: 'Trustee',
  isRegisteredMember: false,
  vip_status: null,
  reg_member_id: null,
  hospital_memberships: []
});

const normalizePhone = (value) => String(value || '').replace(/\D/g, '');

const normalizeMemberName = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const lowered = raw.toLowerCase();
  const blockedNames = new Set([
    'aaaaa',
    'gau grass',
    'guest user',
    'test',
    'test user',
    'null',
    'undefined',
    'n/a',
    'na'
  ]);
  const compact = raw.replace(/\s+/g, '');
  const repeatedSingleChar = /^([a-zA-Z])\1{2,}$/.test(compact);
  if (blockedNames.has(lowered) || repeatedSingleChar) return '';
  return raw;
};

const pickPrimaryMembership = (memberships = [], preferredTrustId = '') => {
  const list = Array.isArray(memberships) ? memberships : [];
  if (list.length === 0) return null;
  const preferred = String(preferredTrustId || '').trim();
  if (preferred) {
    const preferredActive = list.find((m) => String(m?.trust_id || '') === preferred && m?.is_active !== false);
    if (preferredActive) return preferredActive;
    const preferredAny = list.find((m) => String(m?.trust_id || '') === preferred);
    if (preferredAny) return preferredAny;
  }
  return (
    list.find((m) => m.is_active && m.trust_id) ||
    list.find((m) => m.trust_id) ||
    list[0] ||
    null
  );
};

const hasValue = (value) => value !== undefined && value !== null && String(value).trim() !== '';

const scoreMemberCandidate = (member, membershipStats = null) => {
  let score = 0;
  if (membershipStats?.activeInPreferredTrust) score += 120;
  if (membershipStats?.anyInPreferredTrust) score += 90;
  if (membershipStats?.hasActiveMembership) score += 70;
  if (membershipStats?.hasAnyMembership) score += 50;
  if (hasValue(member?.['Name'])) score += 15;
  if (hasValue(member?.['Email'])) score += 8;
  if (hasValue(member?.contact)) score += 4;
  const serial = Number(member?.['S.No.'] || 0);
  if (Number.isFinite(serial)) score += Math.min(serial / 100000, 1);
  return score;
};

const buildTrustPayload = (membership = null) => {
  if (!membership?.trust_id) return null;
  return {
    id: membership.trust_id,
    name: membership.trust_name,
    icon_url: membership.trust_icon_url,
    remark: membership.trust_remark
  };
};

const buildMemberAccount = ({
  member,
  cleanedPhone,
  allMemberships = [],
  preferredTrustId = '',
  memberIds = [],
  isRegisteredMember = false,
  reg_member_id = null,
  vip_status = null
}) => {
  const memberId = member?.members_id ? String(member.members_id) : '';
  const linkedMemberships = memberId
    ? allMemberships.filter((m) => String(m?.members_id || '') === memberId)
    : [];
  const primaryTrust = pickPrimaryMembership(linkedMemberships, preferredTrustId);
  const trust = buildTrustPayload(primaryTrust);
  const primaryMembership = primaryTrust || linkedMemberships[0] || null;
  const sanitizedName = normalizeMemberName(member?.['Name']);
  const membershipNumber = primaryMembership?.membership_number || '';

  const account = {
    id: member?.members_id || member?.['S.No.'] || member?.['Mobile'] || cleanedPhone,
    members_id: member?.members_id || member?.['S.No.'] || null,
    member_ids: memberIds,
    'S. No.': member?.['S.No.'] || null,
    Name: sanitizedName,
    name: sanitizedName,
    Mobile: member?.['Mobile'] || cleanedPhone,
    mobile: member?.['Mobile'] || cleanedPhone,
    Email: member?.['Email'] || '',
    email: member?.['Email'] || '',
    'Membership number': membershipNumber,
    membership_number: membershipNumber,
    membershipNumber,
    type: primaryMembership?.role || 'Trustee',
    trust,
    hospital_memberships: linkedMemberships,
    isRegisteredMember: Boolean(isRegisteredMember),
    vip_status: vip_status || null,
    reg_member_id: reg_member_id || null
  };

  if (trust) {
    account.primary_trust = {
      id: trust.id,
      name: trust.name,
      icon_url: trust.icon_url,
      remark: trust.remark || null,
      is_active: primaryTrust?.is_active !== false
    };
  } else {
    account.primary_trust = null;
  }

  return account;
};

/**
 * Check phone number and send OTP
 * Membership source: reg_members
 */
export const checkPhoneNumber = async (phoneNumber) => {
  try {
    if (USE_MOCK_AUTH) {
      const mockUser = buildMockUser(phoneNumber);
      return {
        success: true,
        message: 'Mocked: phone verified',
        data: {
          user: mockUser,
          accounts: [mockUser]
        }
      };
    }

    const cleanedPhone = normalizePhone(phoneNumber);
    if (!cleanedPhone || cleanedPhone.length < 10) {
      return { success: false, message: 'Please enter a valid 10-digit mobile number.' };
    }

    // 1) Find member by mobile in "Members" table
    const { data: members, error: memberError } = await supabase
      .from('Members')
      .select('"S.No.", "Name", "Mobile", "Email", members_id')
      .eq('Mobile', cleanedPhone)
      .order('"S.No."', { ascending: false });

    if (memberError) {
      console.error('Supabase member lookup error:', memberError);
      return { success: false, message: 'Unable to verify number. Please try again.' };
    }

    if (!members || members.length === 0) {
      // Auto-register new member with just the mobile number.
      const { data: newMember, error: insertError } = await supabase
        .from('Members')
        .insert({ Mobile: cleanedPhone })
        .select('"S.No.", "Name", "Mobile", "Email", members_id')
        .single();

      if (insertError) {
        console.error('Supabase member insert error:', insertError);
        return { success: false, message: 'Unable to register number. Please try again.' };
      }

      const fallbackUser = {
        id: newMember?.members_id || newMember?.['S.No.'] || cleanedPhone,
        members_id: newMember?.members_id || newMember?.['S.No.'] || cleanedPhone,
        member_ids: [newMember?.members_id || newMember?.['S.No.'] || cleanedPhone],
        name: normalizeMemberName(newMember?.['Name']),
        mobile: newMember?.['Mobile'] || cleanedPhone,
        email: newMember?.['Email'] || '',
        type: 'Guest',
        membershipNumber: '',
        trust: null,
        primary_trust: null,
        hospital_memberships: [],
        isRegisteredMember: false,
        vip_status: null,
        reg_member_id: null
      };

      return {
        success: true,
        message: 'Mobile verified',
        data: {
          user: fallbackUser,
          accounts: [fallbackUser]
        }
      };
    }

    const membersIds = members.map((m) => m.members_id).filter(Boolean).map(String);

    // 2) Membership lookup from reg_members
    let hospitalMemberships = [];
    let regMemberships = [];
    let vipRows = [];

    if (membersIds.length > 0) {
      const regResult = await supabase
        .from('reg_members')
        .select('id, trust_id, "Membership number", role, is_active, members_id, joined_date')
        .in('members_id', membersIds);

      if (regResult.error) {
        console.error('Supabase membership lookup error:', regResult.error);
        return { success: false, message: 'Unable to verify membership. Please try again.' };
      }

      regMemberships = (Array.isArray(regResult.data) ? regResult.data : []).filter(
        (m) => m?.trust_id && membersIds.includes(String(m.members_id))
      );

      const trustIds = Array.from(new Set(regMemberships.map((m) => m.trust_id).filter(Boolean)));

      let trustsById = {};
      if (trustIds.length > 0) {
        const { data: trustRows, error: trustError } = await supabase
          .from('Trust')
          .select('id, name, icon_url, remark')
          .in('id', trustIds);

        if (!trustError && Array.isArray(trustRows)) {
          trustsById = trustRows.reduce((acc, row) => {
            acc[row.id] = row;
            return acc;
          }, {});
        }
      }

      hospitalMemberships = regMemberships.map((m) => {
        const t = trustsById[m.trust_id] || null;
        return {
          id: m.id || null,
          trust_id: m.trust_id || null,
          trust_name: t?.name || null,
          trust_icon_url: t?.icon_url || null,
          trust_remark: t?.remark || null,
          is_active: m.is_active,
          membership_number: m['Membership number'] || null,
          role: m.role || null,
          members_id: m.members_id || null,
          source: 'reg_members'
        };
      });

      hospitalMemberships.sort((a, b) => {
        const activeScore = Number(Boolean(b?.is_active)) - Number(Boolean(a?.is_active));
        if (activeScore !== 0) return activeScore;
        return String(a?.trust_name || '').localeCompare(String(b?.trust_name || ''));
      });

      const regIds = regMemberships.map((m) => m.id).filter(Boolean);
      if (regIds.length > 0) {
        const { data: vipData, error: vipError } = await supabase
          .from('vip_entry')
          .select('id, trust_id, reg_id, type, is_active')
          .in('reg_id', regIds)
          .eq('is_active', true)
          .limit(50);

        if (!vipError && Array.isArray(vipData)) {
          vipRows = vipData;
        }
      }
    }

    const preferredTrustId = String(BASE_TRUST_ID || '').trim();
    const governanceRoles = [
      'trustee', 'patron',
      'founder', 'president', 'maha mantri', 'chairman', 'vice-chairman',
      'secretary', 'treasurer', 'chief patron', 'patron-in-chief',
      'advisor', 'board member', 'governing body member'
    ];
    const isGovernanceRole = (role) => {
      if (!role) return false;
      const normalized = String(role).trim().toLowerCase();
      return governanceRoles.includes(normalized);
    };

    const membershipStatsByMemberId = (Array.isArray(membersIds) ? membersIds : []).reduce((acc, memberId) => {
      const linkedMemberships = hospitalMemberships.filter((hm) => String(hm?.members_id || '') === String(memberId));
      const hasAnyMembership = linkedMemberships.length > 0;
      const hasActiveMembership = linkedMemberships.some((hm) => hm?.is_active);
      const anyInPreferredTrust = preferredTrustId
        ? linkedMemberships.some((hm) => String(hm?.trust_id || '') === preferredTrustId)
        : false;
      const activeInPreferredTrust = preferredTrustId
        ? linkedMemberships.some((hm) => String(hm?.trust_id || '') === preferredTrustId && hm?.is_active)
        : false;
      acc[String(memberId)] = {
        hasAnyMembership,
        hasActiveMembership,
        anyInPreferredTrust,
        activeInPreferredTrust
      };
      return acc;
    }, {});

    const vipStatusByRegId = new Map();
    vipRows.forEach((row) => {
      if (!row?.reg_id) return;
      const regId = String(row.reg_id);
      const current = vipStatusByRegId.get(regId);
      const next = String(row.type || '').toUpperCase() === 'VVIP' ? 'VVIP' : (row.type || null);
      if (!current || String(next || '').toUpperCase() === 'VVIP') {
        vipStatusByRegId.set(regId, next);
      }
    });

    const accounts = [...members]
      .map((memberRow) => {
        const memberId = memberRow?.members_id ? String(memberRow.members_id) : '';
        const memberMemberships = memberId
          ? regMemberships.filter((m) => String(m?.members_id || '') === memberId)
          : [];
        const governanceMembership = memberMemberships.find((m) => isGovernanceRole(m?.role));
        const vipStatuses = memberMemberships
          .map((membership) => vipStatusByRegId.get(String(membership?.id || '')))
          .filter(Boolean);
        const vvip = vipStatuses.find((type) => String(type || '').toUpperCase() === 'VVIP');
        const vipStatus = vvip || vipStatuses[0] || null;

        return buildMemberAccount({
          member: memberRow,
          cleanedPhone,
          allMemberships: hospitalMemberships,
          preferredTrustId,
          memberIds: membersIds,
          isRegisteredMember: Boolean(governanceMembership),
          reg_member_id: governanceMembership?.id || null,
          vip_status: vipStatus
        });
      })
      .sort((a, b) => {
        const aStats = membershipStatsByMemberId[String(a?.members_id)] || null;
        const bStats = membershipStatsByMemberId[String(b?.members_id)] || null;
        return scoreMemberCandidate(b, bStats) - scoreMemberCandidate(a, aStats);
      });

    const user = accounts[0] || null;
    if (!user) {
      return { success: false, message: 'Unable to resolve account details. Please try again.' };
    }

    console.log(
      `User check complete: accounts=${accounts.length}, trusts=${hospitalMemberships.length}, selectedMember=${user?.members_id || user?.id}`
    );

    return {
      success: true,
      message: 'Mobile verified',
      data: {
        user,
        accounts
      }
    };
  } catch (error) {
    console.error('Error checking phone:', error);
    throw error;
  }
};

/**
 * Verify OTP
 */
export const verifyOTP = async (phoneNumber, otp) => {
  try {
    // Static OTP for now (no live OTP)
    if (otp === MOCK_OTP) {
      return { success: true, message: 'OTP verified' };
    }
    return { success: false, message: 'Invalid OTP. Use 123456.' };
  } catch (error) {
    console.error('Error verifying OTP:', error);
    throw error;
  }
};

/**
 * Special login for phone number 9911334455
 */
export const specialLogin = async (phoneNumber, passcode) => {
  try {
    // Static passcode for now (no live special login)
    if (passcode === MOCK_OTP) {
      return { success: true, message: 'Passcode verified' };
    }
    return { success: false, message: 'Invalid passcode. Use 123456.' };
  } catch (error) {
    console.error('Error in special login:', error);
    throw error;
  }
};
