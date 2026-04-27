import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Home as HomeIcon,
  Menu,
  Plus,
  Save,
  Trash2,
  Users,
  X
} from 'lucide-react';
import Sidebar from './components/Sidebar';
import { createFamilyMember, deleteFamilyMember, getFamilyMembers, updateFamilyMember } from './services/api';
import { useAppTheme } from './context/ThemeContext';
import { getNavbarThemeStyles } from './utils/themeUtils';

const RELATION_OPTIONS = ['Spouse', 'Father', 'Mother', 'Son', 'Daughter', 'Brother', 'Sister', 'Grandfather', 'Grandmother', 'Uncle', 'Aunt', 'Other'];
const GENDER_OPTIONS = ['Male', 'Female', 'Other'];
const BLOOD_GROUP_OPTIONS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

const createDraftMember = () => ({
  id: null,
  _localKey: `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  name: '',
  relation: '',
  gender: '',
  age: '',
  blood_group: '',
  contact_no: '',
  email: '',
  address: ''
});

const memberKey = (member, index) => String(member?.id || member?._localKey || index);

const MyFamily = ({ onNavigate }) => {
  const theme = useAppTheme();
  const navbarTheme = getNavbarThemeStyles(theme);
  const navbarTextColor = navbarTheme?.textColor || 'var(--navbar-text)';
  const mainContainerRef = useRef(null);

  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [members, setMembers] = useState([]);
  const [expandedKey, setExpandedKey] = useState(null);
  const [loading, setLoading] = useState(true);
  const [savingKeys, setSavingKeys] = useState({});
  const [deletingKeys, setDeletingKeys] = useState({});
  const [message, setMessage] = useState({ type: '', text: '' });

  const savingAny = useMemo(() => Object.values(savingKeys).some(Boolean), [savingKeys]);

  // Scroll lock when sidebar opens
  useEffect(() => {
    if (isMenuOpen) {
      const y = window.scrollY;
      Object.assign(document.body.style, { overflow: 'hidden', position: 'fixed', width: '100%', top: `-${y}px` });
    } else {
      const y = parseInt(document.body.style.top || '0', 10) * -1;
      Object.assign(document.body.style, { overflow: '', position: '', width: '', top: '' });
      window.scrollTo(0, Number.isFinite(y) ? y : 0);
    }
    return () => Object.assign(document.body.style, { overflow: '', position: '', width: '', top: '' });
  }, [isMenuOpen]);

  // Outside click closes sidebar
  useEffect(() => {
    if (!isMenuOpen) return undefined;
    const handleOutside = (event) => {
      if (!event.target.closest('[data-sidebar="true"]') && !event.target.closest('[data-sidebar-overlay="true"]')) {
        setIsMenuOpen(false);
      }
    };
    document.addEventListener('click', handleOutside, true);
    return () => document.removeEventListener('click', handleOutside, true);
  }, [isMenuOpen]);

  useEffect(() => {
    let active = true;
    const loadMembers = async () => {
      setLoading(true);
      setMessage({ type: '', text: '' });
      try {
        const response = await getFamilyMembers();
        if (!active) return;
        const loadedMembers = Array.isArray(response?.members) ? response.members : [];
        setMembers(loadedMembers);
      } catch (error) {
        if (!active) return;
        setMembers([]);
        setMessage({ type: 'error', text: error?.message || 'Unable to load family members.' });
      } finally {
        if (active) setLoading(false);
      }
    };

    loadMembers();
    return () => {
      active = false;
    };
  }, []);

  const setMemberField = (key, field, value) => {
    setMembers((prev) =>
      prev.map((item, idx) =>
        memberKey(item, idx) === key
          ? { ...item, [field]: value }
          : item
      )
    );
  };

  const addMember = () => {
    const draft = createDraftMember();
    const draftKey = memberKey(draft, members.length);
    setMembers((prev) => [...prev, draft]);
    setExpandedKey(draftKey);
    setMessage({ type: '', text: '' });
  };

  const validateMember = (member) => {
    if (!String(member?.name || '').trim()) return 'Member name is required.';
    if (!String(member?.relation || '').trim()) return 'Relation is required.';
    if (member?.gender && !GENDER_OPTIONS.includes(member.gender)) return 'Invalid gender selected.';
    if (member?.blood_group && !BLOOD_GROUP_OPTIONS.includes(member.blood_group)) return 'Invalid blood group selected.';

    const ageText = String(member?.age ?? '').trim();
    if (ageText) {
      const parsedAge = Number(ageText);
      if (!Number.isInteger(parsedAge) || parsedAge < 0 || parsedAge > 120) {
        return 'Age must be between 0 and 120.';
      }
    }

    return '';
  };

  const buildPayload = (member) => {
    const ageText = String(member?.age ?? '').trim();
    return {
      name: String(member?.name || '').trim(),
      relation: String(member?.relation || '').trim(),
      gender: String(member?.gender || '').trim() || null,
      age: ageText === '' ? null : Number(ageText),
      blood_group: String(member?.blood_group || '').trim() || null,
      contact_no: String(member?.contact_no || '').trim() || null,
      email: String(member?.email || '').trim() || null,
      address: String(member?.address || '').trim() || null
    };
  };

  const saveMember = async (key) => {
    const index = members.findIndex((item, idx) => memberKey(item, idx) === key);
    if (index < 0) return;
    const target = members[index];
    const validationError = validateMember(target);
    if (validationError) {
      setMessage({ type: 'error', text: validationError });
      return;
    }

    setSavingKeys((prev) => ({ ...prev, [key]: true }));
    setMessage({ type: '', text: '' });
    try {
      const payload = buildPayload(target);
      const response = target.id
        ? await updateFamilyMember(target.id, payload)
        : await createFamilyMember(payload);

      const saved = response?.member;
      if (!saved?.id) throw new Error('Failed to save family member.');

      setMembers((prev) =>
        prev.map((item, idx) => {
          if (memberKey(item, idx) !== key) return item;
          return { ...saved, _localKey: item._localKey || null };
        })
      );
      setExpandedKey(String(saved.id));
      setMessage({ type: 'success', text: 'Family member saved successfully.' });
    } catch (error) {
      setMessage({ type: 'error', text: error?.message || 'Failed to save family member.' });
    } finally {
      setSavingKeys((prev) => ({ ...prev, [key]: false }));
    }
  };

  const removeMember = async (key) => {
    const index = members.findIndex((item, idx) => memberKey(item, idx) === key);
    if (index < 0) return;
    const target = members[index];

    const okToDelete = window.confirm('Remove this family member?');
    if (!okToDelete) return;

    if (!target.id) {
      setMembers((prev) => prev.filter((item, idx) => memberKey(item, idx) !== key));
      if (expandedKey === key) setExpandedKey(null);
      setMessage({ type: 'success', text: 'Family member removed.' });
      return;
    }

    setDeletingKeys((prev) => ({ ...prev, [key]: true }));
    setMessage({ type: '', text: '' });
    try {
      await deleteFamilyMember(target.id, target.members_id || null);
      setMembers((prev) => prev.filter((item, idx) => memberKey(item, idx) !== key));
      if (expandedKey === key) setExpandedKey(null);
      setMessage({ type: 'success', text: 'Family member removed.' });
    } catch (error) {
      setMessage({ type: 'error', text: error?.message || 'Failed to remove family member.' });
    } finally {
      setDeletingKeys((prev) => ({ ...prev, [key]: false }));
    }
  };

  return (
    <div
      ref={mainContainerRef}
      className="min-h-screen font-sans"
      style={{ background: 'linear-gradient(135deg, color-mix(in srgb, var(--surface-color) 88%, var(--app-accent-bg)) 0%, var(--surface-color) 45%, color-mix(in srgb, var(--brand-navy-light) 55%, var(--surface-color)) 100%)' }}
    >
      <div
        className="px-4 py-4 flex items-center justify-between sticky top-0 z-50 shadow-md"
        style={{
          background: navbarTheme?.backgroundStyle || 'var(--navbar-bg, var(--app-navbar-bg))',
          backdropFilter: `blur(${navbarTheme?.blurPx || '12px'})`,
          WebkitBackdropFilter: `blur(${navbarTheme?.blurPx || '12px'})`,
          borderBottom: '1px solid var(--navbar-border)',
          paddingTop: 'max(env(safe-area-inset-top, 0px), 16px)',
          color: navbarTextColor
        }}
      >
        <button onClick={() => setIsMenuOpen((prev) => !prev)} className="p-2 rounded-xl transition-colors" style={{ color: navbarTextColor, background: 'transparent' }}>
          {isMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
        <h1 className="text-base font-bold tracking-wide" style={{ color: navbarTextColor }}>My Family</h1>
        <button onClick={() => onNavigate('home')} className="p-2 rounded-xl transition-colors" style={{ color: navbarTextColor, background: 'transparent' }}>
          <HomeIcon className="h-5 w-5" />
        </button>
      </div>

      <Sidebar isOpen={isMenuOpen} onClose={() => setIsMenuOpen(false)} onNavigate={onNavigate} currentPage="my-family" />

      {message.text ? (
        <div
          className="mx-4 mt-3 rounded-xl p-3 flex items-center gap-2"
          style={
            message.type === 'error'
              ? { background: 'var(--brand-red-light)', border: '1px solid color-mix(in srgb, var(--brand-red) 20%, transparent)' }
              : { background: 'color-mix(in srgb, var(--brand-navy-light) 68%, var(--surface-color))', border: '1px solid color-mix(in srgb, var(--brand-navy) 16%, transparent)' }
          }
        >
          {message.type === 'error'
            ? <AlertCircle className="h-4 w-4 flex-shrink-0" style={{ color: 'var(--brand-red)' }} />
            : <CheckCircle2 className="h-4 w-4 flex-shrink-0" style={{ color: 'var(--brand-navy)' }} />}
          <p className="text-sm" style={{ color: message.type === 'error' ? 'var(--brand-red-dark)' : 'var(--brand-navy)' }}>{message.text}</p>
        </div>
      ) : null}

      <div className="px-4 pt-5 pb-24">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="text-base font-bold" style={{ color: 'var(--heading-color)' }}>Family Members</p>
            <p className="text-xs" style={{ color: 'color-mix(in srgb, var(--body-text-color) 55%, var(--surface-color))' }}>
              Add, update and manage members linked with your profile
            </p>
          </div>
          <button
            type="button"
            onClick={addMember}
            disabled={savingAny}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-semibold active:scale-95 transition-all disabled:opacity-70"
            style={{ color: 'var(--surface-color)', background: 'linear-gradient(135deg, var(--brand-red) 0%, var(--brand-red-dark) 40%, var(--brand-navy) 100%)' }}
          >
            <Plus className="h-4 w-4" /> Add Member
          </button>
        </div>

        {loading ? (
          <div className="py-20 text-center">
            <div className="inline-block w-10 h-10 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: 'var(--brand-red)', borderTopColor: 'transparent' }} />
            <p className="mt-3 text-sm font-medium" style={{ color: 'color-mix(in srgb, var(--body-text-color) 65%, var(--surface-color))' }}>Loading family members...</p>
          </div>
        ) : members.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-center rounded-2xl border" style={{ borderColor: 'color-mix(in srgb, var(--brand-navy) 10%, transparent)', background: 'color-mix(in srgb, var(--surface-color) 82%, var(--app-accent-bg))' }}>
            <Users className="h-12 w-12" style={{ color: 'color-mix(in srgb, var(--body-text-color) 35%, var(--surface-color))' }} />
            <p className="font-semibold" style={{ color: 'var(--heading-color)' }}>No family members yet</p>
            <p className="text-sm px-8" style={{ color: 'color-mix(in srgb, var(--body-text-color) 55%, var(--surface-color))' }}>Tap Add Member to create the first family profile.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {members.map((member, idx) => {
              const key = memberKey(member, idx);
              const isOpen = expandedKey === key;
              const isSaving = Boolean(savingKeys[key]);
              const isDeleting = Boolean(deletingKeys[key]);
              const initials = (member?.name || '?').charAt(0).toUpperCase();
              return (
                <div key={key} className="border rounded-2xl overflow-hidden" style={{ borderColor: 'color-mix(in srgb, var(--brand-navy) 12%, transparent)', background: 'var(--surface-color)' }}>
                  <div className="flex items-center gap-3 px-4 py-3.5 cursor-pointer" onClick={() => setExpandedKey(isOpen ? null : key)}>
                    <div className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-base flex-shrink-0" style={{ background: 'color-mix(in srgb, var(--surface-color) 76%, var(--app-accent-bg))', color: 'var(--brand-navy)' }}>
                      {initials}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm truncate" style={{ color: 'var(--heading-color)' }}>{member.name || 'New Member'}</p>
                      <p className="text-xs truncate" style={{ color: 'color-mix(in srgb, var(--body-text-color) 55%, var(--surface-color))' }}>
                        {[member.relation, member.gender, member.age ? `Age ${member.age}` : ''].filter(Boolean).join(' · ') || 'Tap to fill details'}
                      </p>
                    </div>
                    {isOpen ? <ChevronUp className="h-4 w-4" style={{ color: 'color-mix(in srgb, var(--body-text-color) 45%, var(--surface-color))' }} /> : <ChevronDown className="h-4 w-4" style={{ color: 'color-mix(in srgb, var(--body-text-color) 45%, var(--surface-color))' }} />}
                  </div>

                  {isOpen ? (
                    <div className="border-t px-4 pb-4 pt-3 space-y-3" style={{ borderColor: 'color-mix(in srgb, var(--brand-navy) 10%, transparent)', background: 'color-mix(in srgb, var(--surface-color) 82%, var(--app-accent-bg))' }}>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="flex flex-col gap-1">
                          <label className="text-[11px] font-bold uppercase tracking-widest ml-0.5" style={{ color: 'var(--brand-red)' }}>Name *</label>
                          <input type="text" value={member.name || ''} onChange={(e) => setMemberField(key, 'name', e.target.value)} className="w-full px-3 py-2.5 text-sm font-medium rounded-2xl border-2 bg-transparent focus:outline-none" style={{ color: 'var(--body-text-color)', borderColor: 'color-mix(in srgb, var(--brand-navy) 10%, transparent)', background: 'var(--surface-color)' }} />
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="text-[11px] font-bold uppercase tracking-widest ml-0.5" style={{ color: 'var(--brand-red)' }}>Relation *</label>
                          <select value={member.relation || ''} onChange={(e) => setMemberField(key, 'relation', e.target.value)} className="w-full px-3 py-2.5 text-sm font-medium rounded-2xl border-2 bg-transparent focus:outline-none" style={{ color: 'var(--body-text-color)', borderColor: 'color-mix(in srgb, var(--brand-navy) 10%, transparent)', background: 'var(--surface-color)' }}>
                            <option value="">Select</option>
                            {RELATION_OPTIONS.map((relation) => <option key={relation} value={relation}>{relation}</option>)}
                          </select>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="flex flex-col gap-1">
                          <label className="text-[11px] font-bold uppercase tracking-widest ml-0.5" style={{ color: 'var(--brand-red)' }}>Gender</label>
                          <select value={member.gender || ''} onChange={(e) => setMemberField(key, 'gender', e.target.value)} className="w-full px-3 py-2.5 text-sm font-medium rounded-2xl border-2 bg-transparent focus:outline-none" style={{ color: 'var(--body-text-color)', borderColor: 'color-mix(in srgb, var(--brand-navy) 10%, transparent)', background: 'var(--surface-color)' }}>
                            <option value="">Select</option>
                            {GENDER_OPTIONS.map((gender) => <option key={gender} value={gender}>{gender}</option>)}
                          </select>
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="text-[11px] font-bold uppercase tracking-widest ml-0.5" style={{ color: 'var(--brand-red)' }}>Age</label>
                          <input type="number" min="0" max="120" value={member.age ?? ''} onChange={(e) => setMemberField(key, 'age', e.target.value)} className="w-full px-3 py-2.5 text-sm font-medium rounded-2xl border-2 bg-transparent focus:outline-none" style={{ color: 'var(--body-text-color)', borderColor: 'color-mix(in srgb, var(--brand-navy) 10%, transparent)', background: 'var(--surface-color)' }} />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="flex flex-col gap-1">
                          <label className="text-[11px] font-bold uppercase tracking-widest ml-0.5" style={{ color: 'var(--brand-red)' }}>Blood Group</label>
                          <select value={member.blood_group || ''} onChange={(e) => setMemberField(key, 'blood_group', e.target.value)} className="w-full px-3 py-2.5 text-sm font-medium rounded-2xl border-2 bg-transparent focus:outline-none" style={{ color: 'var(--body-text-color)', borderColor: 'color-mix(in srgb, var(--brand-navy) 10%, transparent)', background: 'var(--surface-color)' }}>
                            <option value="">Select</option>
                            {BLOOD_GROUP_OPTIONS.map((bloodGroup) => <option key={bloodGroup} value={bloodGroup}>{bloodGroup}</option>)}
                          </select>
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="text-[11px] font-bold uppercase tracking-widest ml-0.5" style={{ color: 'var(--brand-red)' }}>Contact No</label>
                          <input type="tel" value={member.contact_no || ''} onChange={(e) => setMemberField(key, 'contact_no', e.target.value)} className="w-full px-3 py-2.5 text-sm font-medium rounded-2xl border-2 bg-transparent focus:outline-none" style={{ color: 'var(--body-text-color)', borderColor: 'color-mix(in srgb, var(--brand-navy) 10%, transparent)', background: 'var(--surface-color)' }} />
                        </div>
                      </div>

                      <div className="flex flex-col gap-1">
                        <label className="text-[11px] font-bold uppercase tracking-widest ml-0.5" style={{ color: 'var(--brand-red)' }}>Email</label>
                        <input type="email" value={member.email || ''} onChange={(e) => setMemberField(key, 'email', e.target.value)} className="w-full px-3 py-2.5 text-sm font-medium rounded-2xl border-2 bg-transparent focus:outline-none" style={{ color: 'var(--body-text-color)', borderColor: 'color-mix(in srgb, var(--brand-navy) 10%, transparent)', background: 'var(--surface-color)' }} />
                      </div>

                      <div className="flex flex-col gap-1">
                        <label className="text-[11px] font-bold uppercase tracking-widest ml-0.5" style={{ color: 'var(--brand-red)' }}>Address</label>
                        <input type="text" value={member.address || ''} onChange={(e) => setMemberField(key, 'address', e.target.value)} className="w-full px-3 py-2.5 text-sm font-medium rounded-2xl border-2 bg-transparent focus:outline-none" style={{ color: 'var(--body-text-color)', borderColor: 'color-mix(in srgb, var(--brand-navy) 10%, transparent)', background: 'var(--surface-color)' }} />
                      </div>

                      <div className="grid grid-cols-2 gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => saveMember(key)}
                          disabled={isSaving || isDeleting}
                          className="w-full py-2.5 rounded-xl text-sm font-semibold active:scale-95 transition-all disabled:opacity-60 flex items-center justify-center gap-1.5"
                          style={{ color: 'var(--surface-color)', background: 'linear-gradient(135deg, var(--brand-red) 0%, var(--brand-red-dark) 45%, var(--brand-navy) 100%)' }}
                        >
                          <Save className="h-4 w-4" />
                          {isSaving ? 'Saving...' : 'Save'}
                        </button>
                        <button
                          type="button"
                          onClick={() => removeMember(key)}
                          disabled={isSaving || isDeleting}
                          className="w-full py-2.5 rounded-xl text-sm font-semibold active:scale-95 transition-all disabled:opacity-60 flex items-center justify-center gap-1.5 border"
                          style={{ color: 'var(--brand-red)', borderColor: 'color-mix(in srgb, var(--brand-red) 20%, transparent)', background: 'color-mix(in srgb, var(--brand-red-light) 72%, var(--surface-color))' }}
                        >
                          <Trash2 className="h-4 w-4" />
                          {isDeleting ? 'Removing...' : 'Remove'}
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default MyFamily;
