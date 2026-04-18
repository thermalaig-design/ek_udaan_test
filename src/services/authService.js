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

/**
 * Check phone number and send OTP
 * Membership source: reg_members + member_trust_links
 */
export const checkPhoneNumber = async (phoneNumber) => {
  try {
    if (USE_MOCK_AUTH) {
      return {
        success: true,
        message: 'Mocked: phone verified',
        data: { user: buildMockUser(phoneNumber) }
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
        name: newMember?.['Name'] || 'Guest User',
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
        data: { user: fallbackUser }
      };
    }

    const member = members[0];
    const membersIds = members.map((m) => m.members_id).filter(Boolean).map(String);

    // 2) Membership lookup from both sources
    let hospitalMemberships = [];
    let isRegisteredMember = false;
    let reg_member_id = null;
    let vip_status = null;

    if (membersIds.length > 0) {
      const [regResult, linksResult] = await Promise.all([
        supabase
          .from('reg_members')
          .select('id, trust_id, "Membership number", role, is_active, members_id, joined_date')
          .in('members_id', membersIds),
        supabase
          .from('member_trust_links')
          .select('id, member_id, trust_id, membership_no, location, remark1, remark2, is_active, created_at')
          .in('member_id', membersIds)
      ]);

      if (regResult.error) {
        console.error('Supabase membership lookup error:', regResult.error);
        return { success: false, message: 'Unable to verify membership. Please try again.' };
      }

      if (linksResult.error) {
        console.error('Supabase member_trust_links lookup error:', linksResult.error);
        return { success: false, message: 'Unable to verify membership links. Please try again.' };
      }

      const regMemberships = (Array.isArray(regResult.data) ? regResult.data : []).filter(
        (m) => m?.trust_id && membersIds.includes(String(m.members_id))
      );
      const trustLinks = (Array.isArray(linksResult.data) ? linksResult.data : []).filter(
        (l) => l?.trust_id && membersIds.includes(String(l.member_id))
      );

      const trustIds = Array.from(
        new Set([
          ...regMemberships.map((m) => m.trust_id),
          ...trustLinks.map((l) => l.trust_id)
        ].filter(Boolean))
      );

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

      const membershipByTrust = {};

      regMemberships.forEach((m) => {
        const t = trustsById[m.trust_id] || null;
        membershipByTrust[m.trust_id] = {
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

      trustLinks.forEach((l) => {
        const t = trustsById[l.trust_id] || null;
        const existing = membershipByTrust[l.trust_id];

        if (existing) {
          membershipByTrust[l.trust_id] = {
            ...existing,
            trust_name: existing.trust_name || t?.name || null,
            trust_icon_url: existing.trust_icon_url || t?.icon_url || null,
            trust_remark: existing.trust_remark || t?.remark || l.remark1 || l.remark2 || null,
            is_active: existing.is_active !== false && l.is_active !== false,
            membership_number: existing.membership_number || l.membership_no || null,
            members_id: existing.members_id || l.member_id || null,
            source: 'merged'
          };
          return;
        }

        membershipByTrust[l.trust_id] = {
          id: l.id || null,
          trust_id: l.trust_id || null,
          trust_name: t?.name || null,
          trust_icon_url: t?.icon_url || null,
          trust_remark: t?.remark || l.remark1 || l.remark2 || null,
          is_active: l.is_active !== false,
          membership_number: l.membership_no || null,
          role: null,
          members_id: l.member_id || null,
          source: 'member_trust_links'
        };
      });

      hospitalMemberships = Object.values(membershipByTrust).sort((a, b) => {
        const activeScore = Number(Boolean(b?.is_active)) - Number(Boolean(a?.is_active));
        if (activeScore !== 0) return activeScore;
        return String(a?.trust_name || '').localeCompare(String(b?.trust_name || ''));
      });

      // Check registered member status using reg_members roles
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

      const qualifiedMembership = regMemberships.find(
        (m) => m.trust_id && m.members_id && isGovernanceRole(m.role)
      );

      if (qualifiedMembership) {
        isRegisteredMember = true;
        reg_member_id = qualifiedMembership.id;

        const regIds = regMemberships.map((m) => m.id).filter(Boolean);
        if (regIds.length > 0) {
          const { data: vipRows, error: vipError } = await supabase
            .from('vip_entry')
            .select('id, trust_id, reg_id, type, is_active')
            .in('reg_id', regIds)
            .eq('is_active', true)
            .limit(5);

          if (!vipError && Array.isArray(vipRows) && vipRows.length > 0) {
            const vvip = vipRows.find((v) => String(v.type || '').toUpperCase() === 'VVIP');
            vip_status = vvip ? 'VVIP' : vipRows[0].type;
            console.log('VIP status found:', vip_status);
          }
        }
      }
    }

    const primaryTrust = pickPrimaryMembership(hospitalMemberships, BASE_TRUST_ID);
    const trust = primaryTrust?.trust_id
      ? {
        id: primaryTrust.trust_id,
        name: primaryTrust.trust_name,
        icon_url: primaryTrust.trust_icon_url,
        remark: primaryTrust.trust_remark
      }
      : null;

    const primaryMembership = primaryTrust || hospitalMemberships[0] || null;
    const user = {
      id: member.members_id || member['S.No.'],
      members_id: member.members_id || member['S.No.'],
      member_ids: membersIds,
      name: member['Name'] || '',
      mobile: member['Mobile'] || cleanedPhone,
      email: member['Email'] || '',
      type: primaryMembership?.role || 'Trustee',
      membershipNumber: primaryMembership?.membership_number || '',
      trust,
      isRegisteredMember,
      vip_status,
      reg_member_id
    };

    if (trust) {
      user.primary_trust = {
        id: trust.id,
        name: trust.name,
        icon_url: trust.icon_url,
        remark: trust.remark || null,
        is_active: primaryTrust?.is_active !== false
      };
    }

    user.hospital_memberships = hospitalMemberships;

    console.log(`User check complete: trusts=${hospitalMemberships.length}, isRegisteredMember=${isRegisteredMember}, vip_status=${vip_status}`);

    return {
      success: true,
      message: 'Mobile verified',
      data: { user }
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
