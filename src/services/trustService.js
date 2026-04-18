import { supabase } from './supabaseClient';

export const fetchMemberTrusts = async (membersId) => {
  if (!membersId) return [];

  // Fetch from both reg_members and member_trust_links
  const [regResult, linksResult] = await Promise.all([
    supabase
      .from('reg_members')
      .select('id, trust_id, "Membership number", role, joined_date, is_active, members_id')
      .eq('members_id', membersId),
    supabase
      .from('member_trust_links')
      .select('id, member_id, trust_id, membership_no, location, remark1, remark2, is_active, created_at')
      .eq('member_id', membersId)
  ]);

  if (regResult.error) {
    console.warn('Error fetching from reg_members:', regResult.error);
  }

  if (linksResult.error) {
    console.warn('Error fetching from member_trust_links:', linksResult.error);
  }

  const regMemberships = Array.isArray(regResult.data) ? regResult.data : [];
  const trustLinks = Array.isArray(linksResult.data) ? linksResult.data : [];

  // Collect all trust IDs from both sources
  const trustIds = Array.from(
    new Set([
      ...regMemberships.map((m) => m.trust_id),
      ...trustLinks.map((l) => l.trust_id)
    ].filter(Boolean))
  );

  if (trustIds.length === 0) return [];

  // Fetch trust details for all trust IDs
  const { data: trusts, error: trustError } = await supabase
    .from('Trust')
    .select('id,name,icon_url,remark')
    .in('id', trustIds);

  if (trustError) {
    console.warn('Error fetching trust details:', trustError);
  }

  const trustById = (trusts || []).reduce((acc, t) => {
    acc[t.id] = t;
    return acc;
  }, {});

  // Merge trusts from both sources, avoiding duplicates
  const trustMap = new Map();

  // Add from reg_members
  regMemberships.forEach((m) => {
    const t = trustById[m.trust_id] || {};
    if (!trustMap.has(m.trust_id)) {
      trustMap.set(m.trust_id, {
        id: m.trust_id || null,
        name: t.name || null,
        icon_url: t.icon_url || null,
        remark: t.remark || null,
        is_active: m.is_active,
        membership_number: m['Membership number'] || null,
        role: m.role || null,
        members_id: m.members_id || null,
        source: 'reg_members'
      });
    }
  });

  // Add from member_trust_links (only if not already in map)
  trustLinks.forEach((l) => {
    const t = trustById[l.trust_id] || {};
    if (!trustMap.has(l.trust_id)) {
      trustMap.set(l.trust_id, {
        id: l.trust_id || null,
        name: t.name || null,
        icon_url: t.icon_url || null,
        remark: t.remark || l.remark1 || l.remark2 || null,
        is_active: l.is_active !== false,
        membership_number: l.membership_no || null,
        role: null,
        members_id: l.member_id || null,
        source: 'member_trust_links'
      });
    } else {
      // If already exists from reg_members, update with member_trust_links data if needed
      const existing = trustMap.get(l.trust_id);
      trustMap.set(l.trust_id, {
        ...existing,
        membership_number: existing.membership_number || l.membership_no || null,
        is_active: existing.is_active || (l.is_active !== false),
        source: 'merged'
      });
    }
  });

  return Array.from(trustMap.values());
};

export const fetchAllTrusts = async () => {
  const { data, error } = await supabase
    .from('Trust')
    .select('id,name,icon_url,remark,created_at')
    .order('created_at', { ascending: false });

  if (error) {
    throw error;
  }

  return Array.isArray(data) ? data : [];
};

export const fetchDefaultTrust = async (preferredTrustId) => {
  let query = supabase
    .from('Trust')
    .select('id,name,icon_url,remark,legal_name,terms_content,privacy_content,created_at')
    .limit(1);

  if (preferredTrustId) {
    query = query.eq('id', preferredTrustId);
  } else {
    query = query.order('created_at', { ascending: false });
  }

  const { data, error } = await query;
  if (error) {
    throw error;
  }

  if (Array.isArray(data)) {
    return data[0] || null;
  }

  return data || null;
};

export const fetchTrustByName = async (name) => {
  if (!name) return null;
  const { data, error } = await supabase
    .from('Trust')
    .select('id,name,icon_url,remark,legal_name,terms_content,privacy_content,created_at')
    .eq('name', name)
    .limit(1);

  if (error) {
    throw error;
  }

  if (Array.isArray(data)) {
    return data[0] || null;
  }

  return data || null;
};

export const fetchTrustById = async (id) => {
  if (!id) return null;
  const { data, error } = await supabase
    .from('Trust')
    .select('id,name,icon_url,remark,legal_name,terms_content,privacy_content,created_at')
    .eq('id', id)
    .limit(1);

  if (error) {
    throw error;
  }

  if (Array.isArray(data)) {
    return data[0] || null;
  }

  return data || null;
};
