import { supabase } from './supabaseClient';

export const fetchMemberTrusts = async (membersId) => {
  if (!membersId) return [];

  const { data: regMembershipsRaw, error: regError } = await supabase
    .from('reg_members')
    .select('id, trust_id, "Membership number", role, joined_date, is_active, members_id')
    .eq('members_id', membersId);

  if (regError) {
    console.warn('Error fetching from reg_members:', regError);
  }

  const regMemberships = Array.isArray(regMembershipsRaw) ? regMembershipsRaw : [];

  const trustIds = Array.from(new Set(regMemberships.map((m) => m.trust_id).filter(Boolean)));

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

  const mappedTrusts = regMemberships.map((m) => {
    const t = trustById[m.trust_id] || {};
    return {
      id: m.trust_id || null,
      name: t.name || null,
      icon_url: t.icon_url || null,
      remark: t.remark || null,
      is_active: m.is_active,
      membership_number: m['Membership number'] || null,
      role: m.role || null,
      members_id: m.members_id || null,
      source: 'reg_members'
    };
  });

  return mappedTrusts;
};

export const fetchAllTrusts = async () => {
  const { data, error } = await supabase
    .from('Trust')
    .select('id,name,icon_url,remark,template_id,created_at')
    .order('created_at', { ascending: false });

  if (error) {
    throw error;
  }

  return Array.isArray(data) ? data : [];
};

export const fetchDefaultTrust = async (preferredTrustId) => {
  let query = supabase
    .from('Trust')
    .select('id,name,icon_url,remark,legal_name,terms_content,privacy_content,template_id,created_at')
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
    .select('id,name,icon_url,remark,legal_name,terms_content,privacy_content,template_id,created_at')
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
    .select('id,name,icon_url,remark,legal_name,terms_content,privacy_content,template_id,created_at')
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

export const fetchTemplatesForTrust = async (trustId) => {
  if (!trustId) return [];

  const query = supabase
    .from('app_templates')
    .select('id, trust_id, name, template_key, updated_at')
    .eq('trust_id', trustId)
    .order('updated_at', { ascending: false });

  const { data, error } = await query;
  if (error) throw error;
  return Array.isArray(data) ? data : [];
};

export const updateTrustTemplateLink = async ({ trustId, templateId }) => {
  if (!trustId) throw new Error('trustId is required');
  if (!templateId) throw new Error('templateId is required');

  const { data, error } = await supabase
    .from('Trust')
    .update({ template_id: templateId })
    .eq('id', trustId)
    .select('id, name, template_id')
    .maybeSingle();

  if (error) throw error;
  return data || null;
};
