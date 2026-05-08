import React, { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, FileText, UserRound, ShieldCheck, Plus, Save, X } from 'lucide-react';
import { useAppTheme } from './context/ThemeContext';
import { applyOpacity } from './utils/colorUtils';
import { createFamilyMember, getFamilyMembers, updateFamilyMember } from './services/api';
import { supabase } from './services/supabaseClient';

const resolveInitialMemberships = () => {
  try {
    const raw = localStorage.getItem('user');
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed?.hospital_memberships) ? parsed.hospital_memberships : [];
  } catch {
    return [];
  }
};

const normalizeId = (value) => String(value || '').trim();
const RELATION_OPTIONS = ['Spouse', 'Father', 'Mother', 'Son', 'Daughter', 'Brother', 'Sister', 'Grandfather', 'Grandmother', 'Uncle', 'Aunt', 'Other'];
const GENDER_OPTIONS = ['Male', 'Female', 'Other'];
const BLOOD_GROUP_OPTIONS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
const createDraftMember = () => ({
  id: null,
  name: '',
  relation: '',
  gender: '',
  age: '',
  blood_group: '',
  contact_no: '',
  email: '',
  address: ''
});

const NominationDetails = ({ onNavigateBack }) => {
  const theme = useAppTheme();
  const [memberships, setMemberships] = useState(() => resolveInitialMemberships());
  const [selectedTrustId, setSelectedTrustId] = useState(() => normalizeId(localStorage.getItem('selected_trust_id')));
  const [familyMembers, setFamilyMembers] = useState([]);
  const [nominations, setNominations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState('');
  const [memberSaving, setMemberSaving] = useState(false);
  const [showMemberForm, setShowMemberForm] = useState(false);
  const [formState, setFormState] = useState(createDraftMember());
  const [nominationForm, setNominationForm] = useState({ family_member_id: '', nominee_type: 'primary' });
  const [message, setMessage] = useState({ type: '', text: '' });
  const [contextIds, setContextIds] = useState({ memberId: '', regId: '' });

  const trustOptions = useMemo(() => {
    const seen = new Set();
    return memberships
      .filter((item) => item?.trust_id)
      .filter((item) => {
        const key = normalizeId(item.trust_id);
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map((item) => ({
        trust_id: normalizeId(item.trust_id),
        trust_name: item.trust_name || item.trust_id,
      }));
  }, [memberships]);

  const nominationByFamily = useMemo(() => {
    const map = new Map();
    nominations.forEach((row) => {
      const fid = normalizeId(row?.family_member_id);
      if (!fid) return;
      const list = map.get(fid) || [];
      list.push(row);
      map.set(fid, list);
    });
    return map;
  }, [nominations]);

  const resolveMemberContext = async (trustId, membershipRows = memberships) => {
    let memberId = '';
    let regId = '';

    try {
      const raw = localStorage.getItem('user');
      const parsed = raw ? JSON.parse(raw) : null;
      const memberFromUser = normalizeId(parsed?.members_id || parsed?.member_id || parsed?.id);
      const match = (membershipRows || []).find((item) => normalizeId(item?.trust_id) === trustId);

      memberId = normalizeId(match?.members_id || memberFromUser);
      regId = normalizeId(match?.id || '');

      if (!regId && trustId && memberId) {
        const { data } = await supabase
          .from('reg_members')
          .select('id')
          .eq('trust_id', trustId)
          .eq('members_id', memberId)
          .limit(1);
        regId = normalizeId(data?.[0]?.id || '');
      }
    } catch {
      memberId = '';
      regId = '';
    }

    return { memberId, regId };
  };

  const loadAll = async (trustId) => {
    const normalizedTrustId = normalizeId(trustId);
    setLoading(true);
    setMessage({ type: '', text: '' });
    try {
      const nextMemberships = resolveInitialMemberships();
      setMemberships(nextMemberships);

      const [{ members }, ids] = await Promise.all([
        getFamilyMembers(),
        resolveMemberContext(normalizedTrustId, nextMemberships),
      ]);

      setContextIds(ids);
      const family = Array.isArray(members) ? members : [];
      setFamilyMembers(family);

      if (!normalizedTrustId || !ids.memberId) {
        setNominations([]);
        return;
      }

      const { data, error } = await supabase
        .from('member_nominations')
        .select('id, family_member_id, nominee_type, status, trust_id, member_id, reg_id')
        .eq('trust_id', normalizedTrustId)
        .eq('member_id', ids.memberId)
        .in('status', ['active', 'pending']);

      if (error) throw error;
      setNominations(Array.isArray(data) ? data : []);
    } catch (error) {
      setNominations([]);
      setFamilyMembers([]);
      setMessage({ type: 'error', text: error?.message || 'Unable to load nomination details.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!selectedTrustId && trustOptions[0]?.trust_id) {
      setSelectedTrustId(trustOptions[0].trust_id);
      return;
    }
    if (!selectedTrustId) return;
    loadAll(selectedTrustId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTrustId]);

  const refreshNominations = async () => {
    if (!selectedTrustId || !contextIds.memberId) return;
    const { data, error } = await supabase
      .from('member_nominations')
      .select('id, family_member_id, nominee_type, status, trust_id, member_id, reg_id')
      .eq('trust_id', selectedTrustId)
      .eq('member_id', contextIds.memberId)
      .in('status', ['active', 'pending']);
    if (error) throw error;
    setNominations(Array.isArray(data) ? data : []);
  };

  const setNomineeType = async (familyMemberId, nomineeType) => {
    if (!selectedTrustId || !contextIds.memberId || !contextIds.regId) {
      setMessage({ type: 'error', text: 'Member context missing for selected trust.' });
      return;
    }
    const lockKey = `${familyMemberId}:${nomineeType}`;
    setSavingKey(lockKey);
    setMessage({ type: '', text: '' });
    try {
      const payload = {
        trust_id: selectedTrustId,
        member_id: contextIds.memberId,
        reg_id: contextIds.regId,
        family_member_id: familyMemberId,
        nominee_type: nomineeType,
        status: 'active',
        updated_at: new Date().toISOString(),
      };
      const { error } = await supabase
        .from('member_nominations')
        .upsert(payload, { onConflict: 'trust_id,member_id,family_member_id,nominee_type' });
      if (error) throw error;
      await refreshNominations();
      setMessage({ type: 'success', text: `${nomineeType === 'primary' ? 'Primary' : 'Secondary'} nominee updated.` });
    } catch (error) {
      setMessage({ type: 'error', text: error?.message || 'Unable to update nominee.' });
    } finally {
      setSavingKey('');
    }
  };

  const revokeNominee = async (familyMemberId) => {
    if (!selectedTrustId || !contextIds.memberId) return;
    const lockKey = `${familyMemberId}:revoke`;
    setSavingKey(lockKey);
    setMessage({ type: '', text: '' });
    try {
      const { error } = await supabase
        .from('member_nominations')
        .update({ status: 'revoked', updated_at: new Date().toISOString() })
        .eq('trust_id', selectedTrustId)
        .eq('member_id', contextIds.memberId)
        .eq('family_member_id', familyMemberId)
        .in('status', ['active', 'pending']);
      if (error) throw error;
      await refreshNominations();
      setMessage({ type: 'success', text: 'Nomination removed.' });
    } catch (error) {
      setMessage({ type: 'error', text: error?.message || 'Unable to remove nomination.' });
    } finally {
      setSavingKey('');
    }
  };

  const openAddMember = () => {
    setFormState(createDraftMember());
    setShowMemberForm(true);
  };

  const openEditMember = (member) => {
    setFormState({
      id: member?.id || null,
      name: String(member?.name || ''),
      relation: String(member?.relation || ''),
      gender: String(member?.gender || ''),
      age: member?.age === null || member?.age === undefined ? '' : String(member?.age),
      blood_group: String(member?.blood_group || ''),
      contact_no: String(member?.contact_no || ''),
      email: String(member?.email || ''),
      address: String(member?.address || ''),
    });
    setShowMemberForm(true);
  };

  const saveMember = async () => {
    const name = String(formState?.name || '').trim();
    const relation = String(formState?.relation || '').trim();
    if (!name) {
      setMessage({ type: 'error', text: 'Member name is required.' });
      return;
    }
    if (!relation) {
      setMessage({ type: 'error', text: 'Relation is required.' });
      return;
    }

    const ageText = String(formState?.age || '').trim();
    const payload = {
      name,
      relation,
      gender: String(formState?.gender || '').trim() || null,
      age: ageText === '' ? null : Number(ageText),
      blood_group: String(formState?.blood_group || '').trim() || null,
      contact_no: String(formState?.contact_no || '').trim() || null,
      email: String(formState?.email || '').trim() || null,
      address: String(formState?.address || '').trim() || null,
    };

    setMemberSaving(true);
    setMessage({ type: '', text: '' });
    try {
      const isCreate = !formState?.id;
      const response = isCreate
        ? await createFamilyMember(payload)
        : await updateFamilyMember(formState.id, payload);
      const saved = response?.member;
      if (!saved?.id) throw new Error('Failed to save family member.');

      setFamilyMembers((prev) => {
        if (isCreate) return [saved, ...prev];
        return prev.map((item) => (normalizeId(item?.id) === normalizeId(saved?.id) ? saved : item));
      });
      setShowMemberForm(false);
      setFormState(createDraftMember());
      setMessage({ type: 'success', text: isCreate ? 'Family member added.' : 'Family member updated.' });
    } catch (error) {
      setMessage({ type: 'error', text: error?.message || 'Unable to save family member.' });
    } finally {
      setMemberSaving(false);
    }
  };

  const submitNominationForm = async () => {
    const familyId = normalizeId(nominationForm.family_member_id);
    const nomineeType = nominationForm.nominee_type === 'secondary' ? 'secondary' : 'primary';
    if (!familyId) {
      setMessage({ type: 'error', text: 'Please select a family member for nomination.' });
      return;
    }
    await setNomineeType(familyId, nomineeType);
  };

  const removeFromNominationForm = async () => {
    const familyId = normalizeId(nominationForm.family_member_id);
    if (!familyId) {
      setMessage({ type: 'error', text: 'Please select a family member to remove nomination.' });
      return;
    }
    await revokeNominee(familyId);
  };

  return (
    <div
      className="min-h-screen pb-8"
      style={{
        background: 'var(--page-bg, var(--app-page-bg))',
        color: 'var(--body-text-color)',
      }}
    >
      <div
        className="theme-navbar border-b px-6 py-5 flex items-center sticky top-0 z-40 shadow-sm"
        style={{ paddingTop: 'max(env(safe-area-inset-top, 0px), 20px)' }}
      >
        <div className="flex items-center gap-3">
          <button
            onClick={onNavigateBack}
            className="w-10 h-10 rounded-2xl flex items-center justify-center active:scale-95 transition-all"
            style={{ background: `linear-gradient(135deg, ${applyOpacity(theme.accent, 0.65)}, ${theme.accentBg})` }}
          >
            <ChevronLeft className="h-5 w-5" style={{ color: theme.primary }} />
          </button>
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.24em]" style={{ color: theme.primary }}>
              Nomination
            </p>
            <h1 className="text-lg font-extrabold truncate" style={{ color: 'var(--navbar-text)' }}>
              Nomination Details
            </h1>
          </div>
        </div>
      </div>

      <div className="px-6 py-5 space-y-4">
        <div
          className="rounded-2xl p-4"
          style={{
            background: 'color-mix(in srgb, var(--surface-color) 88%, var(--app-page-bg))',
            border: `1px solid ${applyOpacity(theme.primary, 0.08)}`,
          }}
        >
          <label className="block text-[11px] font-bold uppercase tracking-[0.2em] mb-2" style={{ color: theme.primary }}>
            Select Trust
          </label>
          <select
            value={selectedTrustId}
            onChange={(e) => {
              const next = normalizeId(e.target.value);
              setSelectedTrustId(next);
              localStorage.setItem('selected_trust_id', next);
            }}
            className="w-full px-3 py-2.5 rounded-xl border-2 bg-transparent focus:outline-none"
            style={{
              borderColor: applyOpacity(theme.primary, 0.18),
              color: 'var(--body-text-color)',
              background: 'var(--surface-color)',
            }}
          >
            {trustOptions.map((trust) => (
              <option key={trust.trust_id} value={trust.trust_id}>{trust.trust_name}</option>
            ))}
          </select>
        </div>

        <button
          type="button"
          onClick={openAddMember}
          className="w-full h-11 rounded-xl text-sm font-bold active:scale-95 transition-all inline-flex items-center justify-center gap-2"
          style={{ color: 'var(--surface-color)', background: 'linear-gradient(135deg, var(--brand-red) 0%, var(--brand-red-dark) 45%, var(--brand-navy) 100%)' }}
        >
          <Plus className="h-4 w-4" />
          {showMemberForm ? 'Family Form Open' : 'Add Family Member'}
        </button>

        {showMemberForm ? (
          <div
            className="rounded-2xl p-4"
            style={{ background: 'var(--surface-color)', border: `1px solid ${applyOpacity(theme.primary, 0.15)}` }}
          >
            <div className="flex items-center justify-between mb-3">
              <p className="text-base font-extrabold" style={{ color: 'var(--heading-color)' }}>
                {formState?.id ? 'Edit Family Member' : 'Add Family Member'}
              </p>
              <button
                type="button"
                onClick={() => {
                  setShowMemberForm(false);
                  setFormState(createDraftMember());
                }}
                className="w-8 h-8 rounded-lg inline-flex items-center justify-center"
                style={{ background: 'color-mix(in srgb, var(--body-text-color) 8%, var(--surface-color))' }}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <input value={formState.name} onChange={(e) => setFormState((p) => ({ ...p, name: e.target.value }))} placeholder="Name *" className="sm:col-span-2 h-10 rounded-xl px-3 border bg-transparent min-w-0" style={{ borderColor: applyOpacity(theme.primary, 0.16) }} />
              <select value={formState.relation} onChange={(e) => setFormState((p) => ({ ...p, relation: e.target.value }))} className="h-10 rounded-xl px-3 border bg-transparent min-w-0" style={{ borderColor: applyOpacity(theme.primary, 0.16) }}>
                <option value="">Relation *</option>
                {RELATION_OPTIONS.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
              <select value={formState.gender} onChange={(e) => setFormState((p) => ({ ...p, gender: e.target.value }))} className="h-10 rounded-xl px-3 border bg-transparent min-w-0" style={{ borderColor: applyOpacity(theme.primary, 0.16) }}>
                <option value="">Gender</option>
                {GENDER_OPTIONS.map((g) => <option key={g} value={g}>{g}</option>)}
              </select>
              <input value={formState.age} onChange={(e) => setFormState((p) => ({ ...p, age: e.target.value }))} type="number" min="0" max="120" placeholder="Age" className="h-10 rounded-xl px-3 border bg-transparent min-w-0" style={{ borderColor: applyOpacity(theme.primary, 0.16) }} />
              <select value={formState.blood_group} onChange={(e) => setFormState((p) => ({ ...p, blood_group: e.target.value }))} className="h-10 rounded-xl px-3 border bg-transparent min-w-0" style={{ borderColor: applyOpacity(theme.primary, 0.16) }}>
                <option value="">Blood Group</option>
                {BLOOD_GROUP_OPTIONS.map((b) => <option key={b} value={b}>{b}</option>)}
              </select>
              <input value={formState.contact_no} onChange={(e) => setFormState((p) => ({ ...p, contact_no: e.target.value }))} placeholder="Contact No" className="sm:col-span-2 h-10 rounded-xl px-3 border bg-transparent min-w-0" style={{ borderColor: applyOpacity(theme.primary, 0.16) }} />
              <input value={formState.email} onChange={(e) => setFormState((p) => ({ ...p, email: e.target.value }))} placeholder="Email" className="sm:col-span-2 h-10 rounded-xl px-3 border bg-transparent min-w-0" style={{ borderColor: applyOpacity(theme.primary, 0.16) }} />
              <input value={formState.address} onChange={(e) => setFormState((p) => ({ ...p, address: e.target.value }))} placeholder="Address" className="sm:col-span-2 h-10 rounded-xl px-3 border bg-transparent min-w-0" style={{ borderColor: applyOpacity(theme.primary, 0.16) }} />
            </div>

            <button
              type="button"
              disabled={memberSaving}
              onClick={saveMember}
              className="mt-3 w-full h-10 rounded-xl text-sm font-bold inline-flex items-center justify-center gap-2 disabled:opacity-60"
              style={{ color: 'var(--surface-color)', background: 'linear-gradient(135deg, var(--brand-red) 0%, var(--brand-red-dark) 45%, var(--brand-navy) 100%)' }}
            >
              <Save className="h-4 w-4" />
              {memberSaving ? 'Saving...' : 'Save Family Member'}
            </button>
          </div>
        ) : null}

        <div
          className="rounded-2xl p-4 space-y-3"
          style={{
            background: 'color-mix(in srgb, var(--surface-color) 90%, var(--app-page-bg))',
            border: `1px solid ${applyOpacity(theme.primary, 0.1)}`,
          }}
        >
          <p className="text-sm font-extrabold tracking-wide" style={{ color: 'var(--heading-color)' }}>
            Assign Nominee
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <select
              value={nominationForm.family_member_id}
              onChange={(e) => setNominationForm((prev) => ({ ...prev, family_member_id: normalizeId(e.target.value) }))}
              className="h-10 rounded-xl px-3 border bg-transparent min-w-0"
              style={{ borderColor: applyOpacity(theme.primary, 0.16) }}
            >
              <option value="">Select Family Member</option>
              {familyMembers.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name || 'Unnamed Member'}
                </option>
              ))}
            </select>
            <select
              value={nominationForm.nominee_type}
              onChange={(e) => setNominationForm((prev) => ({ ...prev, nominee_type: e.target.value === 'secondary' ? 'secondary' : 'primary' }))}
              className="h-10 rounded-xl px-3 border bg-transparent min-w-0"
              style={{ borderColor: applyOpacity(theme.primary, 0.16) }}
            >
              <option value="primary">Primary Nominee</option>
              <option value="secondary">Secondary Nominee</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={Boolean(savingKey)}
              onClick={submitNominationForm}
              className="h-10 rounded-xl text-sm font-bold active:scale-95 transition-all disabled:opacity-60"
              style={{ color: 'var(--surface-color)', background: 'linear-gradient(135deg, var(--brand-red) 0%, var(--brand-red-dark) 45%, var(--brand-navy) 100%)' }}
            >
              Save Nominee
            </button>
            <button
              type="button"
              disabled={Boolean(savingKey)}
              onClick={removeFromNominationForm}
              className="h-10 rounded-xl text-sm font-bold active:scale-95 transition-all disabled:opacity-60"
              style={{
                color: 'color-mix(in srgb, var(--body-text-color) 78%, var(--surface-color))',
                background: 'color-mix(in srgb, var(--body-text-color) 8%, var(--surface-color))',
              }}
            >
              Remove Nominee
            </button>
          </div>
        </div>

        {message.text ? (
          <div
            className="rounded-xl px-3 py-2 text-sm font-medium"
            style={{
              background: message.type === 'error'
                ? 'color-mix(in srgb, var(--brand-red) 14%, var(--surface-color))'
                : 'color-mix(in srgb, var(--brand-navy) 16%, var(--surface-color))',
              color: message.type === 'error' ? 'var(--brand-red-dark)' : 'var(--brand-navy)',
            }}
          >
            {message.text}
          </div>
        ) : null}

        {loading ? (
          <div className="py-16 text-center">
            <div
              className="w-10 h-10 mx-auto rounded-full border-2 border-t-transparent animate-spin"
              style={{ borderColor: theme.primary, borderTopColor: 'transparent' }}
            />
            <p className="mt-3 text-sm font-semibold">Loading nominations...</p>
          </div>
        ) : familyMembers.length === 0 ? (
          <div
            className="rounded-2xl p-8 text-center"
            style={{
              background: 'color-mix(in srgb, var(--surface-color) 90%, var(--app-page-bg))',
              border: `1px solid ${applyOpacity(theme.primary, 0.1)}`,
            }}
          >
            <FileText className="h-8 w-8 mx-auto mb-2" style={{ color: theme.primary }} />
            <p className="font-semibold">No family members found.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {familyMembers.map((member) => {
              const familyId = normalizeId(member?.id);
              const rows = nominationByFamily.get(familyId) || [];
              const hasPrimary = rows.some((row) => row?.nominee_type === 'primary');
              const hasSecondary = rows.some((row) => row?.nominee_type === 'secondary');

              return (
                <div
                  key={familyId}
                  className="rounded-2xl p-4"
                  style={{
                    background: 'var(--surface-color)',
                    border: `1px solid ${applyOpacity(theme.primary, 0.1)}`,
                  }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-base truncate" style={{ color: 'var(--heading-color)' }}>
                        {member?.name || 'Unnamed Member'}
                      </p>
                      <p className="text-sm mt-0.5" style={{ color: 'color-mix(in srgb, var(--body-text-color) 60%, var(--surface-color))' }}>
                        {[member?.relation, member?.gender].filter(Boolean).join(' | ') || 'Family Member'}
                      </p>
                      <p className="text-xs mt-1" style={{ color: 'color-mix(in srgb, var(--body-text-color) 58%, var(--surface-color))' }}>
                        {[member?.age ? `Age ${member.age}` : '', member?.blood_group ? `Blood ${member.blood_group}` : ''].filter(Boolean).join(' | ')}
                      </p>
                      <p className="text-xs mt-1 break-words" style={{ color: 'color-mix(in srgb, var(--body-text-color) 58%, var(--surface-color))' }}>
                        {[member?.contact_no || '', member?.email || '', member?.address || ''].filter(Boolean).join(' | ')}
                      </p>
                    </div>
                    {(hasPrimary || hasSecondary) ? (
                      <div className="flex items-center gap-1.5 flex-wrap justify-end">
                        {hasPrimary ? (
                          <span
                            className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-1 rounded-full"
                            style={{ color: 'var(--brand-navy)', background: applyOpacity(theme.primary, 0.12) }}
                          >
                            <ShieldCheck className="h-3.5 w-3.5" />
                            Primary
                          </span>
                        ) : null}
                        {hasSecondary ? (
                          <span
                            className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-1 rounded-full"
                            style={{ color: 'var(--brand-red-dark)', background: 'color-mix(in srgb, var(--brand-red) 14%, var(--surface-color))' }}
                          >
                            <UserRound className="h-3.5 w-3.5" />
                            Secondary
                          </span>
                        ) : null}
                      </div>
                    ) : null}
                  </div>

                  <button
                    type="button"
                    onClick={() => openEditMember(member)}
                    className="mt-3 w-full h-9 rounded-xl text-xs font-semibold active:scale-95 transition-all"
                    style={{
                      color: 'var(--brand-navy)',
                      background: 'color-mix(in srgb, var(--brand-navy) 10%, var(--surface-color))',
                    }}
                  >
                    Edit Family Details
                  </button>
                </div>
              );
            })}
          </div>
        )}

      </div>
    </div>
  );
};

export default NominationDetails;
