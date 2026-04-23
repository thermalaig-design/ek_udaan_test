import React, { useState, useEffect, useRef } from 'react';
import {
  User, Users, Mail, Calendar, MapPin, Briefcase, Camera, Save,
  Shield, BadgeCheck, Phone, Droplet, UserCircle,
  Home as HomeIcon, Menu, X, Award, CheckCircle, AlertCircle,
  Plus, Trash2, ChevronDown, ChevronUp
} from 'lucide-react';
import Sidebar from './components/Sidebar';
import { getAllElectedMembers, getProfile, saveProfile } from './services/api';
import { useAppTheme, useThemeToken } from './context/ThemeContext';

// Classy input field — label on top, styled bordered input
const RowField = ({ label, type = 'text', value, onChange, placeholder, disabled = false, icon: Icon }) => (
  <div className={`flex flex-col gap-1 ${disabled ? 'opacity-70' : ''}`}>
    <label className="text-[11px] font-bold uppercase tracking-widest ml-0.5 flex items-center gap-1" style={{ color: 'var(--brand-navy)' }}>
      {Icon && <Icon className="h-3 w-3" />}{label}
      {disabled && <span className="text-[9px] bg-gray-100 text-gray-400 px-1.5 py-0.5 rounded-full ml-1 font-semibold">AUTO</span>}
    </label>
    <div className={`relative rounded-2xl border-2 transition-all ${disabled
        ? 'bg-gray-50 border-gray-100'
        : 'bg-white border-gray-100'
      }`}
      style={{ boxShadow: 'none' }}
      onFocusCapture={e => { if (!disabled) e.currentTarget.style.borderColor = 'var(--brand-red)'; e.currentTarget.style.boxShadow = '0 0 0 3px color-mix(in srgb, var(--brand-red) 8%, transparent)'; }}
      onBlurCapture={e => { e.currentTarget.style.borderColor = ''; e.currentTarget.style.boxShadow = ''; }}
    >
      <input
        type={type}
        value={value || ''}
        onChange={(e) => onChange && onChange(e.target.value)}
        placeholder={placeholder || `Enter ${label.toLowerCase()}`}
        disabled={disabled}
        className="w-full px-4 py-3 text-sm font-medium text-gray-800 bg-transparent focus:outline-none placeholder:text-gray-300 disabled:cursor-not-allowed rounded-2xl"
      />
    </div>
  </div>
);

// Date field
const RowDate = ({ label, value, onChange, icon: Icon }) => (
  <div className="flex flex-col gap-1">
    <label className="text-[11px] font-bold uppercase tracking-widest ml-0.5 flex items-center gap-1" style={{ color: 'var(--brand-navy)' }}>
      {Icon && <Icon className="h-3 w-3" />}{label}
    </label>
    <div className="relative rounded-2xl border-2 border-gray-100 bg-white transition-all" style={{}} onFocusCapture={e => { e.currentTarget.style.borderColor = 'var(--brand-red)'; e.currentTarget.style.boxShadow = '0 0 0 3px color-mix(in srgb, var(--brand-red) 8%, transparent)'; }} onBlurCapture={e => { e.currentTarget.style.borderColor = ''; e.currentTarget.style.boxShadow = ''; }}>
      <input
        type="date"
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-4 py-3 text-sm font-medium text-gray-800 bg-transparent focus:outline-none rounded-2xl"
      />
    </div>
  </div>
);

// Select field
const RowSelect = ({ label, value, onChange, options, placeholder, icon: Icon }) => (
  <div className="flex flex-col gap-1">
    <label className="text-[11px] font-bold uppercase tracking-widest ml-0.5 flex items-center gap-1" style={{ color: 'var(--brand-navy)' }}>
      {Icon && <Icon className="h-3 w-3" />}{label}
    </label>
    <div className="relative rounded-2xl border-2 border-gray-100 bg-white transition-all" onFocusCapture={e => { e.currentTarget.style.borderColor = 'var(--brand-red)'; e.currentTarget.style.boxShadow = '0 0 0 3px color-mix(in srgb, var(--brand-red) 8%, transparent)'; }} onBlurCapture={e => { e.currentTarget.style.borderColor = ''; e.currentTarget.style.boxShadow = ''; }}>
      <select
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-4 py-3 text-sm font-medium text-gray-800 bg-transparent focus:outline-none appearance-none rounded-2xl pr-8"
      >
        <option value="">{placeholder || 'Select'}</option>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <div className="absolute inset-y-0 right-3 flex items-center pointer-events-none">
        <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
      </div>
    </div>
  </div>
);

// Section header with colored left pill
const SectionHeader = ({ title, color = 'bg-indigo-500' }) => (
  <div className="flex items-center gap-2.5 pt-7 pb-3">
    <div className={`w-1 h-5 rounded-full ${color}`} />
    <span className="text-xs font-extrabold text-gray-500 uppercase tracking-widest">{title}</span>
  </div>
);

const Profile = ({ onNavigate, onProfileUpdate }) => {
  const theme = useAppTheme();
  const navbarTextColor = useThemeToken('navbar.text_color', '#f7f7f7');
  // Check if user is a registered member
  const isRegisteredMember = (() => {
    try {
      const user = JSON.parse(localStorage.getItem('user') || '{}');
      return !!user?.isRegisteredMember;
    } catch { return false; }
  })();

  const TABS = isRegisteredMember ? ['Details', 'Family Members'] : ['Details'];

  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const mainContainerRef = useRef(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [showSuccessPopup, setShowSuccessPopup] = useState(false);
  const [showUnderReviewPopup, setShowUnderReviewPopup] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [showNavWarning, setShowNavWarning] = useState(false);
  const [navTarget, setNavTarget] = useState(null);
  const [originalData, setOriginalData] = useState(null);
  const [activeTab, setActiveTab] = useState('Details');
  const [expandedMember, setExpandedMember] = useState(null);
  const [selectedTrustId, setSelectedTrustId] = useState(() => localStorage.getItem('selected_trust_id') || '');

  const [profileData, setProfileData] = useState({
    name: '', role: '', memberId: '', mobile: '', email: '',
    members_id: '',
    address_home: '', address_office: '', company_name: '',
    resident_landline: '', office_landline: '',
    gender: '', marital_status: '', nationality: '', aadhaar_id: '',
    blood_group: '', dob: '',
    emergency_contact_name: '', emergency_contact_number: '',
    profile_photo_url: '',
    spouse_name: '', spouse_contact_number: '', children_count: '',
    facebook: '', twitter: '', instagram: '', linkedin: '', whatsapp: '',
    family_members: [],
    position: '', location: '', isElectedMember: false
  });

  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);

  const set = (field) => (val) => setProfileData(prev => ({ ...prev, [field]: val }));

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    console.log('[NavbarText][Profile]', {
      selectedTrustId: localStorage.getItem('selected_trust_id') || null,
      templateId: theme?.templateId || null,
      resolvedNavbarTextColor: navbarTextColor,
      finalAppliedNavbarTextColor: navbarTextColor,
      source: theme?.themeLoadSource || 'unknown',
      previouslyHardcodedOverridesRemoved: ['Menu text-white', 'Title text-white', 'Home icon text-white']
    });
  }, [navbarTextColor, theme?.templateId, theme?.themeLoadSource]);

  // Detect unsaved changes
  useEffect(() => {
    if (!loading && profileData.name) setOriginalData(JSON.parse(JSON.stringify(profileData)));
  }, [loading]);

  useEffect(() => {
    if (originalData) setHasUnsavedChanges(JSON.stringify(profileData) !== JSON.stringify(originalData) || photoFile !== null);
  }, [profileData, photoFile, originalData]);

  // Scroll lock
  useEffect(() => {
    if (isMenuOpen) {
      const y = window.scrollY;
      Object.assign(document.body.style, { overflow: 'hidden', position: 'fixed', width: '100%', top: `-${y}px` });
    } else {
      const y = parseInt(document.body.style.top || '0') * -1;
      Object.assign(document.body.style, { overflow: '', position: '', width: '', top: '' });
      window.scrollTo(0, y);
    }
    return () => Object.assign(document.body.style, { overflow: '', position: '', width: '', top: '' });
  }, [isMenuOpen]);

  // Outside click close sidebar
  useEffect(() => {
    if (!isMenuOpen) return;
    const h = (e) => { if (!e.target.closest('[data-sidebar="true"]') && !e.target.closest('[data-sidebar-overlay="true"]')) setIsMenuOpen(false); };
    document.addEventListener('click', h, true);
    return () => document.removeEventListener('click', h, true);
  }, [isMenuOpen]);

  useEffect(() => {
    // Deep-link: if another page asked to open a specific tab, honour it once
    const requestedTab = localStorage.getItem('openProfileTab');
    if (requestedTab) {
      setActiveTab(requestedTab);
      localStorage.removeItem('openProfileTab');
    }
  }, []);

  useEffect(() => {
    const syncTrustId = () => {
      const next = localStorage.getItem('selected_trust_id') || '';
      setSelectedTrustId((prev) => (prev === next ? prev : next));
    };
    const onTrustChanged = (event) => {
      const next = event?.detail?.trustId || localStorage.getItem('selected_trust_id') || '';
      setSelectedTrustId((prev) => (prev === next ? prev : next));
    };
    syncTrustId();
    window.addEventListener('trust-changed', onTrustChanged);
    window.addEventListener('focus', syncTrustId);
    window.addEventListener('storage', syncTrustId);
    document.addEventListener('visibilitychange', syncTrustId);
    return () => {
      window.removeEventListener('trust-changed', onTrustChanged);
      window.removeEventListener('focus', syncTrustId);
      window.removeEventListener('storage', syncTrustId);
      document.removeEventListener('visibilitychange', syncTrustId);
    };
  }, []);

  useEffect(() => {
    loadProfile();
  }, [selectedTrustId]);

  const getSelectedMembershipFromUser = (user) => {
    const memberships = Array.isArray(user?.hospital_memberships) ? user.hospital_memberships : [];
    if (!memberships.length) return null;
    if (selectedTrustId) {
      const forSelectedTrust = memberships.find((m) => String(m?.trust_id || '') === String(selectedTrustId));
      if (forSelectedTrust) return forSelectedTrust;
    }
    return memberships.find((m) => m?.is_active) || memberships[0] || null;
  };

  const loadProfile = async () => {
    setLoading(true);
    try {
      const response = await getProfile();
      const p = response?.profile;
      const user = JSON.parse(localStorage.getItem('user') || '{}');
      const selectedMembership = getSelectedMembershipFromUser(user);
      if (response?.success && p) {
        setProfileData({
          name: p.name || user.name || user.Name || '',
          role: p.role || selectedMembership?.role || user.type || '',
          memberId: p.memberId || p.member_id || selectedMembership?.membership_number || user.membershipNumber || user['Membership number'] || '',
          members_id: p.members_id || user.members_id || user.member_id || user.id || '',
          mobile: p.mobile || user.mobile || user.Mobile || '', email: p.email || user.email || user.Email || '',
          address_home: p.address_home || '', address_office: p.address_office || '',
          company_name: p.company_name || '', resident_landline: p.resident_landline || '',
          office_landline: p.office_landline || '', gender: p.gender || '',
          marital_status: p.marital_status || '', nationality: p.nationality || '',
          aadhaar_id: p.aadhaar_id || '', blood_group: p.blood_group || '',
          dob: p.dob || '', emergency_contact_name: p.emergency_contact_name || '',
          emergency_contact_number: p.emergency_contact_number || '',
          profile_photo_url: p.profile_photo_url || '',
          spouse_name: p.spouse_name || '', spouse_contact_number: p.spouse_contact_number || '',
          children_count: p.children_count ?? '',
          facebook: p.facebook || '', twitter: p.twitter || '', instagram: p.instagram || '',
          linkedin: p.linkedin || '', whatsapp: p.whatsapp || '',
          family_members: Array.isArray(p.family_members) ? p.family_members : [],
          position: p.position || '', location: p.location || '',
          isElectedMember: p.isElectedMember || false
        });
        if (p.profile_photo_url) setPhotoPreview(p.profile_photo_url);
      } else {
        loadFromLS();
      }
    } catch { loadFromLS(); }
    finally { setLoading(false); }
  };


  const loadFromLS = () => {
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    const selectedMembership = getSelectedMembershipFromUser(user);
    const key = `userProfile_${user.Mobile || user.mobile || user.id || 'default'}`;
    const saved = localStorage.getItem(key);
    if (saved) {
      const p = JSON.parse(saved);
      setProfileData(prev => ({
        ...prev,
        ...p,
        role: selectedMembership?.role || p?.role || prev.role || '',
        memberId: selectedMembership?.membership_number || p?.memberId || p?.member_id || prev.memberId || ''
      }));
      if (p.profile_photo_url) setPhotoPreview(p.profile_photo_url);
    } else {
      setProfileData(prev => ({
        ...prev,
        name: user.name || user['Name'] || '',
        role: selectedMembership?.role || user.type || '',
        memberId: selectedMembership?.membership_number || user.membershipNumber || user['Membership number'] || user.membership_number || '',
        members_id: user.members_id || user.member_id || user.id || '',
        mobile: user.Mobile || user.mobile || '', email: user.Email || user.email || '',
        address_home: user['Address Home'] || '', address_office: user['Address Office'] || '',
        company_name: user['Company Name'] || '',
        resident_landline: user['Resident Landline'] || '', office_landline: user['Office Landline'] || '',
      }));
    }
  };

  useEffect(() => {
    if (!profileData.memberId) return;
    const fetch = async () => {
      try {
        const res = await getAllElectedMembers();
        const found = res.data?.find(e => String(e.membership_number || e['Membership number'] || '').trim().toLowerCase() === String(profileData.memberId).trim().toLowerCase());
        if (found) setProfileData(prev => ({ ...prev, position: found.position || prev.position, location: found.location || prev.location, isElectedMember: true }));
      } catch { }
    };
    fetch();
  }, [profileData.memberId]);

  const handlePhotoChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { setMessage({ type: 'error', text: 'Please select an image file' }); return; }
    if (file.size > 5 * 1024 * 1024) { setMessage({ type: 'error', text: 'Image must be under 5MB' }); return; }
    setPhotoFile(file);
    const reader = new FileReader();
    reader.onloadend = () => setPhotoPreview(reader.result);
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    if (!profileData.name) { setMessage({ type: 'error', text: 'Please enter your name' }); return; }
    setSaving(true); setMessage({ type: '', text: '' });
    try {
      const response = await saveProfile(profileData, photoFile);
      if (!response?.success) throw new Error(response?.message || 'Failed to save');

      // Also save to localStorage backup
      const user = JSON.parse(localStorage.getItem('user') || '{}');
      const userId = user['Mobile'] || user.mobile || user.id || user['Membership number'] || '';
      const key = `userProfile_${userId || 'default'}`;
      localStorage.setItem(key, JSON.stringify(profileData));
      setOriginalData(JSON.parse(JSON.stringify(profileData)));
      setHasUnsavedChanges(false); setPhotoFile(null);
      if (response?.profile?.profile_photo_url) {
        setPhotoPreview(response.profile.profile_photo_url);
      }
      if (onProfileUpdate) onProfileUpdate(profileData);
      if (!isRegisteredMember) {
        // Non-member: show "under review" message
        setShowUnderReviewPopup(true);
      } else {
        setShowSuccessPopup(true);
        setTimeout(() => {
          setShowSuccessPopup(false);
          const returnFlag = localStorage.getItem('returnToAppointments');
          if (returnFlag) {
            localStorage.removeItem('returnToAppointments');
            onNavigate('appointments');
          }
        }, 1500);
      }
    } catch (err) {
      console.error('Profile save error:', err);
      setMessage({ type: 'error', text: err?.message || 'Failed to save. Please try again.' });
    }
    finally { setSaving(false); }
  };

  const handleNavigate = (target) => {
    if (hasUnsavedChanges) { setNavTarget(target); setShowNavWarning(true); }
    else { onNavigate(target); }
  };

  const updateMember = (idx, field, value) => {
    const updated = [...profileData.family_members];
    updated[idx] = { ...updated[idx], [field]: value };
    setProfileData(prev => ({ ...prev, family_members: updated }));
  };

  const addMember = () => {
    const newMember = { id: Date.now(), name: '', relation: '', gender: '', age: '', dob: '', blood_group: '', contact_no: '', email: '', address: '' };
    const idx = profileData.family_members.length;
    setProfileData(prev => ({ ...prev, family_members: [...prev.family_members, newMember] }));
    setExpandedMember(idx);
  };

  const removeMember = (idx) => {
    setProfileData(prev => ({ ...prev, family_members: prev.family_members.filter((_, i) => i !== idx) }));
    if (expandedMember === idx) setExpandedMember(null);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-4 border-gray-300 border-t-gray-700 mx-auto" />
          <p className="text-gray-500 mt-4 text-sm">Loading profile...</p>
        </div>
      </div>
    );
  }

  return (
    <div ref={mainContainerRef} className="min-h-screen font-sans" style={{ background: 'linear-gradient(135deg, var(--surface-color)5f5 0%, var(--surface-color) 40%, #f0f1fb 100%)' }}>

      {/* Navbar - Brand */}
      <div
        className="px-4 py-4 flex items-center justify-between sticky top-0 z-50 shadow-md"
        style={{
          background: `linear-gradient(135deg, var(--brand-red) 0%, var(--brand-red-dark) 35%, var(--brand-navy) 100%)`,
          paddingTop: 'max(env(safe-area-inset-top, 0px), 16px)',
          color: navbarTextColor
        }}
      >
        <button onClick={() => setIsMenuOpen(!isMenuOpen)} className="p-2 rounded-xl hover:bg-white/10 transition-colors" style={{ color: navbarTextColor }}>
          {isMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
        <h1 className="text-base font-bold tracking-wide" style={{ color: navbarTextColor }}>Profile</h1>
        <button onClick={() => handleNavigate('home')} className="p-2 rounded-xl hover:bg-white/10 transition-colors" style={{ color: navbarTextColor }}>
          <HomeIcon className="h-5 w-5" />
        </button>
      </div>

      <Sidebar isOpen={isMenuOpen} onClose={() => setIsMenuOpen(false)} onNavigate={handleNavigate} currentPage="profile" />

      {/* Error/success banner */}
      {message.text && (
        <div className={`mx-4 mt-3 rounded-xl p-3 flex items-center gap-2 ${message.type === 'error' ? 'bg-red-50 border border-red-200' : 'bg-green-50 border border-green-200'}`}>
          {message.type === 'error' ? <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0" /> : <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />}
          <p className={`text-sm ${message.type === 'error' ? 'text-red-700' : 'text-green-700'}`}>{message.text}</p>
        </div>
      )}

      {/* Profile Header */}
      <div className="px-5 pt-6 pb-4 flex items-center gap-4 border-b border-gray-100">
        {/* Avatar */}
        <div className="relative flex-shrink-0">
          <div className="w-20 h-20 rounded-full border-2 border-gray-200 overflow-hidden bg-gray-100">
            {photoPreview ? (
              <img src={photoPreview} alt="Profile" className="w-full h-full object-cover"
                onError={(e) => { e.target.src = `https://ui-avatars.com/api/?name=${profileData.name || 'U'}&background=e5e7eb&color=374151&size=80`; }} />
            ) : profileData.name ? (
              <div className="w-full h-full flex items-center justify-center text-2xl font-bold text-gray-600">
                {profileData.name.charAt(0).toUpperCase()}
              </div>
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <UserCircle className="h-12 w-12 text-gray-400" />
              </div>
            )}
          </div>
          <button onClick={() => document.getElementById('photo-upload').click()}
            className="absolute -bottom-1 -right-1 bg-white border border-gray-300 p-1.5 rounded-full shadow-sm active:scale-95 transition-all">
            <Camera className="h-3.5 w-3.5 text-gray-600" />
          </button>
          <input id="photo-upload" type="file" accept="image/*" className="hidden" onChange={handlePhotoChange} />
        </div>

        {/* Name + role */}
        {(() => {
          const roleRaw = (profileData.role || '').trim();
          const roleLower = roleRaw.toLowerCase();
          const role =
            profileData.memberId
              ? (roleRaw || 'Member')
              : (!roleRaw || roleLower === 'trustee' || roleLower === 'member')
                ? 'Guest'
                : roleRaw;
          return (
        <div className="flex-1 min-w-0">
          <h2 className="text-xl font-bold text-gray-900 leading-tight">{profileData.name || 'Your Name'}</h2>
          <p className="text-sm text-gray-500 mt-0.5">{role}</p>
          {profileData.memberId && <p className="text-xs text-gray-400 mt-0.5">ID: {profileData.memberId}</p>}
        </div>
          );
        })()}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-100 bg-white sticky top-[64px] z-40">
        {TABS.map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className="flex-1 py-4 text-sm font-bold transition-all border-b-2"
            style={activeTab === tab
              ? { borderColor: 'var(--brand-red)', color: 'var(--brand-red)' }
              : { borderColor: 'transparent', color: '#94a3b8' }}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* ─── Tab: Details ─────────────────────────────── */}
      {activeTab === 'Details' && (
        <div className="px-4 pb-32">
          {/* Basic — locked fields */}
          <SectionHeader title="Basic Info" color="bg-gray-400" />
          <div className="space-y-3">
            <RowField label="Name" value={profileData.name} onChange={set('name')} disabled />
            <RowField label="Contact Number" value={profileData.mobile} onChange={set('mobile')} disabled />
            <RowField label="Member ID" value={profileData.memberId} onChange={set('memberId')} disabled />
          </div>

          {/* Personal */}
          <SectionHeader title="Personal" color="bg-indigo-500" />
          <div className="space-y-3">
            <RowField label="Email Address" type="email" value={profileData.email} onChange={set('email')} placeholder="Add your email" />
            <RowSelect label="Gender" value={profileData.gender} onChange={set('gender')} placeholder="Select gender"
              options={[{ value: 'Male', label: 'Male' }, { value: 'Female', label: 'Female' }, { value: 'Other', label: 'Other' }]} />
            <RowDate label="Date of Birth" value={profileData.dob} onChange={set('dob')} />
            <RowSelect label="Blood Group" value={profileData.blood_group} onChange={set('blood_group')} placeholder="Select blood group"
              options={['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'].map(v => ({ value: v, label: v }))} />
            <RowSelect label="Marital Status" value={profileData.marital_status} onChange={set('marital_status')} placeholder="Select status"
              options={[{ value: 'Single', label: 'Single' }, { value: 'Married', label: 'Married' }, { value: 'Divorced', label: 'Divorced' }, { value: 'Widowed', label: 'Widowed' }]} />
            <RowField label="Nationality" value={profileData.nationality} onChange={set('nationality')} placeholder="E.g. Indian" />
          </div>

          {/* Address */}
          <SectionHeader title="Address" color="bg-emerald-500" />
          <div className="space-y-3">
            <RowField label="Home Address" value={profileData.address_home} onChange={set('address_home')} placeholder="Enter home address" />
            <RowField label="Office Address" value={profileData.address_office} onChange={set('address_office')} placeholder="Enter office address" />
          </div>

          {/* Work */}
          <SectionHeader title="Work" color="bg-amber-500" />
          <div className="space-y-3">
            <RowField label="Company Name" value={profileData.company_name} onChange={set('company_name')} placeholder="Enter company name" />
            <RowField label="Resident Landline" value={profileData.resident_landline} onChange={set('resident_landline')} placeholder="Enter landline" />
            <RowField label="Office Landline" value={profileData.office_landline} onChange={set('office_landline')} placeholder="Enter office landline" />
          </div>

          {/* Identity */}
          <SectionHeader title="Identity" color="bg-violet-500" />
          <div className="space-y-3">
            <RowField label="Aadhaar ID" value={profileData.aadhaar_id} onChange={(val) => {
              const d = val.replace(/\D/g, '').slice(0, 16);
              set('aadhaar_id')(d.replace(/(\d{4})(?=\d)/g, '$1 '));
            }} placeholder="0000 0000 0000 0000" />
          </div>

          {/* Emergency */}
          <SectionHeader title="Emergency Contact" color="bg-red-500" />
          <div className="space-y-3">
            <RowField label="Contact Name" value={profileData.emergency_contact_name} onChange={set('emergency_contact_name')} placeholder="Full name" />
            <RowField label="Contact Number" value={profileData.emergency_contact_number} onChange={set('emergency_contact_number')} placeholder="Phone number" />
          </div>

          {/* Spouse */}
          <SectionHeader title="Spouse & Family" color="bg-pink-500" />
          <div className="space-y-3">
            <RowField label="Spouse Name" value={profileData.spouse_name} onChange={set('spouse_name')} placeholder="Enter spouse name" />
            <RowField label="Spouse Contact" value={profileData.spouse_contact_number} onChange={set('spouse_contact_number')} placeholder="Enter contact number" />
            <RowField label="No. of Children" type="number" value={profileData.children_count} onChange={set('children_count')} placeholder="0" />
          </div>

          {/* Social */}
          <SectionHeader title="Social Media" color="bg-sky-500" />
          <div className="space-y-3">
            <RowField label="Facebook" value={profileData.facebook} onChange={set('facebook')} placeholder="Facebook URL or username" />
            <RowField label="Twitter / X" value={profileData.twitter} onChange={set('twitter')} placeholder="Twitter handle" />
            <RowField label="Instagram" value={profileData.instagram} onChange={set('instagram')} placeholder="Instagram handle" />
            <RowField label="LinkedIn" value={profileData.linkedin} onChange={set('linkedin')} placeholder="LinkedIn URL" />
            <RowField label="WhatsApp" value={profileData.whatsapp} onChange={set('whatsapp')} placeholder="WhatsApp number" />
          </div>

          {/* Elected position (show only if applicable) */}
          {(profileData.position || profileData.location || profileData.isElectedMember) && (
            <>
              <SectionHeader title="Elected Position" color="bg-teal-500" />
              <div className="space-y-3">
                <RowField label="Position" value={profileData.position} onChange={set('position')} placeholder="Enter position" />
                <RowField label="Location" value={profileData.location} onChange={set('location')} placeholder="Enter location" />
              </div>
            </>
          )}
        </div>
      )}

      {/* ─── Tab: Family Members ───────────────────────── */}
      {activeTab === 'Family Members' && (
        <div className="px-5 pb-32 pt-5">
          {/* Add member button */}
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-base font-bold text-gray-900">Members</p>
              <p className="text-xs text-gray-400">Add to book appointments for them</p>
            </div>
            <button onClick={addMember}
              className="flex items-center gap-1.5 text-white px-4 py-2.5 rounded-xl text-sm font-semibold active:scale-95 transition-all"
              style={{ background: 'linear-gradient(135deg, var(--brand-red) 0%, var(--brand-red-dark) 40%, var(--brand-navy) 100%)' }}>
              <Plus className="h-4 w-4" /> Add Member
            </button>
          </div>

          {profileData.family_members.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
              <Users className="h-12 w-12 text-gray-300" />
              <p className="text-gray-600 font-semibold">No family members yet</p>
              <p className="text-gray-400 text-sm px-8">Add members so you can book appointments for them</p>
              <button onClick={addMember}
                className="mt-2 px-6 py-3 text-white rounded-xl text-sm font-semibold flex items-center gap-2 active:scale-95 transition-all"
                style={{ background: 'linear-gradient(135deg, var(--brand-red) 0%, var(--brand-red-dark) 40%, var(--brand-navy) 100%)' }}>
                <Plus className="h-4 w-4" /> Add First Member
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {profileData.family_members.map((member, idx) => {
                const isOpen = expandedMember === idx;
                const initials = (member.name || '?').charAt(0).toUpperCase();
                return (
                  <div key={member.id || idx} className="border border-gray-200 rounded-2xl overflow-hidden">
                    {/* Member row header */}
                    <div className="flex items-center gap-3 px-4 py-3.5 cursor-pointer" onClick={() => setExpandedMember(isOpen ? null : idx)}>
                      <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-gray-700 font-bold text-base flex-shrink-0">
                        {initials}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-gray-900 text-sm">{member.name || 'New Member'}</p>
                        <p className="text-xs text-gray-400">{[member.relation, member.gender, member.age ? `Age ${member.age}` : ''].filter(Boolean).join(' · ') || 'Tap to fill details'}</p>
                      </div>
                      {isOpen ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
                    </div>

                    {/* Expanded form */}
                    {isOpen && (
                      <div className="border-t border-gray-100 px-4 pb-4 pt-3 space-y-3 bg-gray-50/50">
                        {/* Name & Relation */}
                        <div className="grid grid-cols-2 gap-3">
                          <div className="flex flex-col gap-1">
                            <label className="text-[11px] font-bold text-indigo-500 uppercase tracking-widest ml-0.5">Name *</label>
                            <div className="rounded-2xl border-2 border-gray-100 bg-white focus-within:border-indigo-400 focus-within:shadow-[0_0_0_3px_rgba(99,102,241,0.08)] transition-all">
                              <input type="text" value={member.name} onChange={e => updateMember(idx, 'name', e.target.value)}
                                placeholder="Full name"
                                className="w-full px-3 py-2.5 text-sm font-medium text-gray-900 bg-transparent focus:outline-none rounded-2xl" />
                            </div>
                          </div>
                          <div className="flex flex-col gap-1">
                            <label className="text-[11px] font-bold text-indigo-500 uppercase tracking-widest ml-0.5">Relation *</label>
                            <div className="relative rounded-2xl border-2 border-gray-100 bg-white focus-within:border-indigo-400 focus-within:shadow-[0_0_0_3px_rgba(99,102,241,0.08)] transition-all">
                              <select value={member.relation} onChange={e => updateMember(idx, 'relation', e.target.value)}
                                className="w-full px-3 py-2.5 text-sm font-medium text-gray-900 bg-transparent focus:outline-none appearance-none rounded-2xl pr-7">
                                <option value="">Select</option>
                                {['Spouse', 'Father', 'Mother', 'Son', 'Daughter', 'Brother', 'Sister', 'Grandfather', 'Grandmother', 'Uncle', 'Aunt', 'Other'].map(r => <option key={r} value={r}>{r}</option>)}
                              </select>
                              <div className="absolute inset-y-0 right-2 flex items-center pointer-events-none">
                                <svg className="h-3.5 w-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Gender chips */}
                        <div>
                          <label className="text-[11px] font-bold text-indigo-500 uppercase tracking-widest ml-0.5 block mb-2">Gender</label>
                          <div className="flex gap-2">
                            {['Male', 'Female', 'Other'].map(g => (
                              <button key={g} type="button" onClick={() => updateMember(idx, 'gender', g)}
                                className={`flex-1 py-2.5 rounded-2xl text-sm font-semibold border-2 transition-all ${member.gender === g ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm' : 'bg-white text-gray-500 border-gray-100 hover:border-indigo-300'}`}>
                                {g}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Age & Blood Group */}
                        <div className="grid grid-cols-2 gap-3">
                          <div className="flex flex-col gap-1">
                            <label className="text-[11px] font-bold text-indigo-500 uppercase tracking-widest ml-0.5">Age</label>
                            <div className="rounded-2xl border-2 border-gray-100 bg-white focus-within:border-indigo-400 focus-within:shadow-[0_0_0_3px_rgba(99,102,241,0.08)] transition-all">
                              <input type="number" value={member.age} min="0" max="120" onChange={e => updateMember(idx, 'age', e.target.value)}
                                placeholder="Years"
                                className="w-full px-3 py-2.5 text-sm font-medium text-gray-900 bg-transparent focus:outline-none rounded-2xl" />
                            </div>
                          </div>
                          <div className="flex flex-col gap-1">
                            <label className="text-[11px] font-bold text-indigo-500 uppercase tracking-widest ml-0.5">Blood Group</label>
                            <div className="relative rounded-2xl border-2 border-gray-100 bg-white focus-within:border-indigo-400 transition-all">
                              <select value={member.blood_group} onChange={e => updateMember(idx, 'blood_group', e.target.value)}
                                className="w-full px-3 py-2.5 text-sm font-medium text-gray-900 bg-transparent focus:outline-none appearance-none rounded-2xl pr-7">
                                <option value="">Select</option>
                                {['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'].map(bg => <option key={bg} value={bg}>{bg}</option>)}
                              </select>
                              <div className="absolute inset-y-0 right-2 flex items-center pointer-events-none">
                                <svg className="h-3.5 w-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Contact No */}
                        <div className="flex flex-col gap-1">
                          <label className="text-[11px] font-bold text-indigo-500 uppercase tracking-widest ml-0.5">Contact No</label>
                          <div className="rounded-2xl border-2 border-gray-100 bg-white focus-within:border-indigo-400 focus-within:shadow-[0_0_0_3px_rgba(99,102,241,0.08)] transition-all">
                            <input type="tel" value={member.contact_no} onChange={e => updateMember(idx, 'contact_no', e.target.value)}
                              placeholder="Optional"
                              className="w-full px-3 py-2.5 text-sm font-medium text-gray-900 bg-transparent focus:outline-none rounded-2xl" />
                          </div>
                        </div>

                        {/* Email */}
                        <div className="flex flex-col gap-1">
                          <label className="text-[11px] font-bold text-indigo-500 uppercase tracking-widest ml-0.5">Email</label>
                          <div className="rounded-2xl border-2 border-gray-100 bg-white focus-within:border-indigo-400 focus-within:shadow-[0_0_0_3px_rgba(99,102,241,0.08)] transition-all">
                            <input type="email" value={member.email} onChange={e => updateMember(idx, 'email', e.target.value)}
                              placeholder="email@example.com"
                              className="w-full px-3 py-2.5 text-sm font-medium text-gray-900 bg-transparent focus:outline-none rounded-2xl" />
                          </div>
                        </div>

                        {/* Address */}
                        <div className="flex flex-col gap-1">
                          <label className="text-[11px] font-bold text-indigo-500 uppercase tracking-widest ml-0.5">Address</label>
                          <div className="rounded-2xl border-2 border-gray-100 bg-white focus-within:border-indigo-400 focus-within:shadow-[0_0_0_3px_rgba(99,102,241,0.08)] transition-all">
                            <input type="text" value={member.address} onChange={e => updateMember(idx, 'address', e.target.value)}
                              placeholder="Full address"
                              className="w-full px-3 py-2.5 text-sm font-medium text-gray-900 bg-transparent focus:outline-none rounded-2xl" />
                          </div>
                        </div>

                        {/* Remove */}
                        <button type="button" onClick={() => removeMember(idx)}
                          className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl border-2 border-red-100 text-red-500 text-sm font-semibold bg-red-50/60 active:scale-95 transition-all">
                          <Trash2 className="h-4 w-4" /> Remove Member
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Sticky Save Button */}
      <div className="fixed bottom-0 left-0 right-0 z-40 px-4 pb-5 pt-4 bg-gradient-to-t from-white via-white to-transparent max-w-full md:max-w-[430px] md:mx-auto pointer-events-none">
        <button onClick={handleSave} disabled={saving}
          className="pointer-events-auto w-full py-4 text-white rounded-2xl font-bold text-base active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-50"
          style={{ background: 'linear-gradient(135deg, var(--brand-red) 0%, var(--brand-red-dark) 40%, var(--brand-navy) 100%)', boxShadow: '0 8px 24px color-mix(in srgb, var(--brand-red) 30%, transparent)' }}>
          {saving ? <><div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent" /> Saving...</> : <><Save className="h-5 w-5" /> Save Profile</>}
        </button>
      </div>

      {/* Success Popup */}
      {showSuccessPopup && (
        <div className="fixed inset-0 bg-black/40 z-[999] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl p-8 max-w-sm w-full text-center">
            <div className="bg-green-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="h-10 w-10 text-green-600" />
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-1">Saved!</h2>
            <p className="text-gray-500 text-sm mb-6">Profile saved successfully.</p>
            <button onClick={() => setShowSuccessPopup(false)} className="w-full text-white py-3 rounded-xl font-semibold active:scale-95 transition-all" style={{ background: 'linear-gradient(135deg, var(--brand-red) 0%, var(--brand-navy) 100%)' }}>Done</button>
          </div>
        </div>
      )}

      {/* Under Review Popup — for non-registered members */}
      {showUnderReviewPopup && (
        <div className="fixed inset-0 bg-black/50 z-[999] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl p-8 max-w-sm w-full text-center">
            <div className="bg-amber-100 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-5">
              <Shield className="h-10 w-10 text-amber-500" />
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">Profile Submitted!</h2>
            <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 mb-5">
              <p className="text-amber-800 text-sm font-semibold">⏳ Your profile is under review</p>
              <p className="text-amber-600 text-xs mt-1">Our team will verify your details and activate your membership. You'll be notified once approved.</p>
            </div>
            <button
              onClick={() => setShowUnderReviewPopup(false)}
              className="w-full text-white py-3 rounded-xl font-semibold active:scale-95 transition-all"
              style={{ background: 'linear-gradient(135deg, var(--brand-red) 0%, var(--brand-navy) 100%)' }}
            >
              OK, Got It
            </button>
          </div>
        </div>
      )}

      {/* Unsaved Changes Warning */}
      {showNavWarning && (
        <div className="fixed inset-0 bg-black/40 z-[999] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl p-8 max-w-sm w-full">
            <div className="bg-amber-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="h-10 w-10 text-amber-500" />
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-1 text-center">Unsaved Changes</h2>
            <p className="text-gray-500 text-sm text-center mb-6">Your changes will be lost if you leave now.</p>
            <div className="flex gap-3">
              <button onClick={() => { setShowNavWarning(false); setNavTarget(null); if (navTarget) onNavigate(navTarget); }}
                className="flex-1 bg-gray-100 text-gray-700 py-3 rounded-xl font-semibold active:scale-95 transition-all">Discard</button>
              <button onClick={async () => { await handleSave(); setShowNavWarning(false); if (navTarget) onNavigate(navTarget); }}
                disabled={saving}
                className="flex-1 text-white py-3 rounded-xl font-semibold active:scale-95 transition-all disabled:opacity-50"
                style={{ background: 'linear-gradient(135deg, var(--brand-red) 0%, var(--brand-navy) 100%)' }}>
                {saving ? 'Saving...' : 'Save & Go'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Profile;

