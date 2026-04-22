import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Users, RefreshCw, Plus, X, CheckCircle,
  AlertCircle, Building2, Hash, Tag, FileText, Loader2, Save
} from 'lucide-react';
import { getMemberTrustLinks } from './services/api';
import { useAppTheme } from './context/ThemeContext';

// ─── Supabase helpers ──────────────────────────────────────────────────────

const getSupabase = async () => {
  const { supabase } = await import('./services/supabaseClient.js');
  return supabase;
};

// Fetch existing other_memberships for a member
const fetchOtherMemberships = async (memberId) => {
  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from('other_memberships')
    .select(`
      id,
      member_id,
      member_name,
      member_phone,
      trust_id,
      organisation_name,
      membership_no,
      membership_type,
      is_active,
      remark,
      created_at,
      Trust:trust_id ( id, name, icon_url )
    `)
    .eq('member_id', memberId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
};



// Insert a new other_membership record
const addOtherMembership = async (payload) => {
  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from('other_memberships')
    .insert([payload])
    .select('*, Trust:trust_id ( id, name, icon_url )')
    .single();
  if (error) throw error;
  return data;
};

// Delete an other_membership record
const deleteOtherMembership = async (id) => {
  const supabase = await getSupabase();
  const { error } = await supabase
    .from('other_memberships')
    .delete()
    .eq('id', id);
  if (error) throw error;
};

// ─── Styles — use CSS variables so theme updates automatically ────────────
const colors = {
  primary:   'var(--brand-red)',
  secondary: 'var(--brand-navy)',
  accent:    'var(--app-accent)',
  bg:        'var(--app-page-bg)',
  card: 'color-mix(in srgb, #ffffff 92%, var(--app-accent-bg))',
  border: 'color-mix(in srgb, var(--brand-navy) 14%, transparent)',
  muted: 'var(--body-text-color, #64748b)',
  success: 'color-mix(in srgb, var(--brand-red) 35%, #16a34a)',
  successBg: 'color-mix(in srgb, var(--app-accent-bg) 65%, #DCFCE7)',
  error: 'var(--brand-red-dark, #EF4444)',
  errorBg: 'var(--brand-red-light, #FEF2F2)',
};

// ─── Small reusable components ─────────────────────────────────────────────

const Label = ({ children }) => (
  <p style={{
    fontSize: '11px', fontWeight: 700, color: colors.muted,
    textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 5px'
  }}>{children}</p>
);

const inputStyle = {
  width: '100%',
  padding: '11px 14px',
  border: `1.5px solid ${colors.border}`,
  borderRadius: '12px',
  fontSize: '14px',
  fontFamily: "var(--font-family, 'Inter', sans-serif)",
  color: 'var(--body-text-color, #1e293b)',
  background: 'color-mix(in srgb, var(--app-accent-bg) 72%, #ffffff)',
  outline: 'none',
  boxSizing: 'border-box',
  transition: 'border-color 0.2s',
};

// ─── Main Component ────────────────────────────────────────────────────────

const EMPTY_FORM = {
  trust_id: '',
  organisation_name: '',
  membership_no: '',
  membership_type: '',
  remark: '',
};



const OtherMemberships = ({ onNavigate }) => {
  const navigate = useNavigate();
  useAppTheme();

  // ── state ──
  const [trustLinks, setTrustLinks] = useState([]);     // from member_trust_links
  const [otherMems, setOtherMems] = useState([]);        // from other_memberships table
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [memberId, setMemberId] = useState('');
  const [memberName, setMemberName] = useState('');
  const [memberPhone, setMemberPhone] = useState('');

  // Add-form state
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [submitSuccess, setSubmitSuccess] = useState('');

  // Delete state
  const [deletingId, setDeletingId] = useState(null);

  // ── derived ──
  const user = (() => {
    try { return JSON.parse(localStorage.getItem('user') || '{}'); } catch { return {}; }
  })();

  // ── fetch data ──
  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const userStr = localStorage.getItem('user');
      const parsedUser = userStr ? JSON.parse(userStr) : null;
      const id = parsedUser?.members_id || parsedUser?.id;
      const name = parsedUser?.Name || parsedUser?.name || parsedUser?.full_name || '';
      const phone = parsedUser?.Mobile || parsedUser?.mobile || parsedUser?.phone || parsedUser?.Phone || '';
      setMemberId(String(id || ''));
      setMemberName(name);
      setMemberPhone(phone);

      // ── Source 1: hospital_memberships from localStorage (authoritative — has ALL trusts) ──
      const hospitalMemberships = Array.isArray(parsedUser?.hospital_memberships)
        ? parsedUser.hospital_memberships
        : [];

      // ── Source 2: member_trust_links from Supabase (may have extra details) ──
      let trustLinksMap = {}; // keyed by trust_id
      if (id) {
        try {
          const res = await getMemberTrustLinks(id);
          if (res.success && Array.isArray(res.data)) {
            res.data.forEach((l) => {
              if (l.trust_id) trustLinksMap[l.trust_id] = l;
            });
          }
        } catch { /* non-fatal */ }
      }

      // ── Merge: start from hospitalMemberships (all shown), enrich with trustLinksMap ──
      const merged = hospitalMemberships.map((hm, idx) => {
        const extra = hm.trust_id ? trustLinksMap[hm.trust_id] : null;
        return {
          _key: hm.trust_id || `hm-${idx}`,
          trust_id: hm.trust_id || null,
          Trust: extra?.Trust || {
            id: hm.trust_id,
            name: hm.trust_name,
            icon_url: hm.trust_icon_url,
          },
          membership_no: extra?.membership_no || hm.membership_number || '—',
          location: extra?.location || null,
          remark1: extra?.remark1 || hm.trust_remark || null,
          remark2: extra?.remark2 || null,
          is_active: extra != null ? extra.is_active : hm.is_active !== false,
          role: hm.role || null,
        };
      });

      // Also add member_trust_links entries NOT in hospitalMemberships
      const existingTrustIds = new Set(hospitalMemberships.map((hm) => hm.trust_id).filter(Boolean));
      Object.values(trustLinksMap).forEach((l) => {
        if (!existingTrustIds.has(l.trust_id)) {
          merged.push({
            _key: l.id || l.trust_id,
            trust_id: l.trust_id,
            Trust: l.Trust || { id: l.trust_id, name: null, icon_url: null },
            membership_no: l.membership_no || '—',
            location: l.location || null,
            remark1: l.remark1 || null,
            remark2: l.remark2 || null,
            is_active: l.is_active !== false,
            role: null,
          });
        }
      });

      setTrustLinks(merged);

      // ── other_memberships table ──
      if (id) {
        try {
          const otherMemsData = await fetchOtherMemberships(id);
          setOtherMems(otherMemsData || []);
        } catch (e) {
          console.warn('other_memberships fetch failed:', e);
        }
      }

      if (merged.length === 0 && !id) setError('Member ID not found. Please re-login.');
    } catch (err) {
      console.error('OtherMemberships load error:', err);
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Scroll unlock on mount
  useEffect(() => {
    const unlock = () => {
      document.documentElement.style.overflow = 'auto';
      document.documentElement.style.position = '';
      document.body.style.overflow = 'auto';
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.touchAction = 'auto';
    };
    unlock();
    const t = setInterval(unlock, 120);
    return () => { clearInterval(t); unlock(); };
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // ── handlers ──
  const handleBack = () => {
    if (window.history.length > 1) navigate(-1);
    else if (onNavigate) onNavigate('home');
    else navigate('/');
  };

  const handleFormChange = (field, value) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitError('');
    setSubmitSuccess('');

    if (!form.membership_no.trim()) {
      setSubmitError('Membership number is required.');
      return;
    }
    if (!form.organisation_name.trim()) {
      setSubmitError('Please enter the Trust / Organisation name.');
      return;
    }

    setSubmitting(true);
    try {
      const id = user?.members_id || user?.id;
      const payload = {
        member_id: id || null,
        member_name: memberName || null,
        member_phone: memberPhone || null,
        trust_id: null,
        organisation_name: form.organisation_name.trim() || null,
        membership_no: form.membership_no.trim(),
        membership_type: form.membership_type.trim() || null,
        remark: form.remark.trim() || null,
        is_active: true,
      };
      const newRecord = await addOtherMembership(payload);
      setOtherMems(prev => [newRecord, ...prev]);
      setForm(EMPTY_FORM);
      setShowForm(false);
      setSubmitSuccess('Membership added successfully!');
      setTimeout(() => setSubmitSuccess(''), 4000);
    } catch (err) {
      console.error('Add other membership error:', err);
      setSubmitError(err?.message || 'Failed to add membership. Try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Remove this membership record?')) return;
    setDeletingId(id);
    try {
      await deleteOtherMembership(id);
      setOtherMems(prev => prev.filter(m => m.id !== id));
    } catch (err) {
      alert('Failed to delete: ' + (err?.message || 'Unknown error'));
    } finally {
      setDeletingId(null);
    }
  };

  // ── render helpers ──
  const TrustAvatar = ({ trust, size = 44 }) => {
    const name = (typeof trust === 'string' ? trust : trust?.name) || 'T';
    const iconUrl = typeof trust === 'object' ? trust?.icon_url : null;
    return iconUrl ? (
      <img src={iconUrl} alt={name}
        style={{ width: size, height: size, borderRadius: size * 0.3, objectFit: 'contain', border: `2px solid ${colors.border}`, background: '#F8F9FF', flexShrink: 0 }}
        onError={e => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex'; }}
      />
    ) : (
      <div style={{ width: size, height: size, borderRadius: size * 0.3, background: `linear-gradient(135deg, ${colors.primary}, ${colors.secondary})`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.42, fontWeight: 800, color: '#fff', flexShrink: 0 }}>
        {name.charAt(0).toUpperCase()}
      </div>
    );
  };

  const MembershipCard = ({ m, index }) => {
    const trustName = m.Trust?.name || m.organisation_name || '—';
    return (
      <div key={m.id} style={{ background: colors.card, borderRadius: '20px', border: `1.5px solid ${colors.border}`, boxShadow: '0 4px 16px rgba(43,47,126,0.07)', overflow: 'hidden', animation: `fadeUp 0.35s ease-out ${index * 0.07}s both` }}>
        <div style={{ height: '3px', background: `linear-gradient(90deg, ${colors.primary}, ${colors.accent})` }} />
        <div style={{ padding: '16px' }}>
          {/* Header row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '14px' }}>
            <TrustAvatar trust={m.Trust || { name: trustName, icon_url: null }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <h3 style={{ fontSize: '15px', fontWeight: 800, color: '#1e293b', margin: '0 0 5px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {trustName}
              </h3>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                {m.is_active && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '10px', fontWeight: 700, color: colors.success, background: colors.successBg, padding: '2px 8px', borderRadius: '20px' }}>
                    <span style={{ width: 5, height: 5, borderRadius: '50%', background: colors.success, display: 'inline-block' }} /> Active
                  </span>
                )}
                {m.membership_type && (
                  <span style={{ fontSize: '10px', fontWeight: 700, color: colors.primary, background: '#EEF1FF', padding: '2px 8px', borderRadius: '20px' }}>
                    {m.membership_type}
                  </span>
                )}
              </div>
            </div>
            {/* Delete button */}
            <button
              onClick={() => handleDelete(m.id)}
              disabled={deletingId === m.id}
              style={{ width: 32, height: 32, borderRadius: '10px', border: 'none', background: '#FEF2F2', color: colors.error, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}
              title="Remove"
            >
              {deletingId === m.id ? <Loader2 size={14} style={{ animation: 'spin 0.8s linear infinite' }} /> : <X size={14} />}
            </button>
          </div>

          {/* Details grid */}
          <div style={{ background: '#F8F9FF', borderRadius: '12px', padding: '12px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <div style={{ gridColumn: '1/-1' }}>
              <Label>Membership No.</Label>
              <p style={{ fontSize: '15px', fontWeight: 800, color: colors.primary, margin: 0, letterSpacing: '0.05em' }}>{m.membership_no}</p>
            </div>
            {m.organisation_name && m.organisation_name !== trustName && (
              <div style={{ gridColumn: '1/-1' }}>
                <Label>Organisation</Label>
                <p style={{ fontSize: '13px', fontWeight: 600, color: '#1e293b', margin: 0 }}>{m.organisation_name}</p>
              </div>
            )}
            {m.remark && (
              <div style={{ gridColumn: '1/-1', background: '#FFFBEB', borderRadius: '10px', padding: '10px 12px', border: '1px solid #FDE68A', marginTop: 2 }}>
                <Label>Remark</Label>
                <p style={{ fontSize: '12px', color: '#92400e', margin: 0, lineHeight: 1.5, fontWeight: 500 }}>{m.remark}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  // ── render ──
  return (
    <div style={{ minHeight: '100vh', background: colors.bg, fontFamily: "'Inter', sans-serif" }}>
      {/* ── Header ── */}
      <div style={{ background: `linear-gradient(135deg, ${colors.primary} 0%, ${colors.secondary} 100%)`, paddingTop: 'max(52px, calc(env(safe-area-inset-top, 0px) + 52px))', paddingBottom: '20px', paddingLeft: '16px', paddingRight: '16px', position: 'sticky', top: 0, zIndex: 50, boxShadow: '0 4px 24px rgba(43,47,126,0.25)' }}>
        <div style={{ maxWidth: '430px', margin: '0 auto' }}>
          <div style={{ height: '3px', background: `linear-gradient(90deg, ${colors.accent}, #fff4, ${colors.accent})`, borderRadius: '2px', marginBottom: '16px' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button onClick={handleBack} style={{ width: 40, height: 40, borderRadius: '12px', border: 'none', background: 'rgba(255,255,255,0.15)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0, backdropFilter: 'blur(8px)' }}>
              <ArrowLeft size={20} />
            </button>
            <div style={{ flex: 1 }}>
              <h1 style={{ color: '#fff', fontSize: '18px', fontWeight: 800, margin: 0, letterSpacing: '-0.3px' }}>Other Memberships</h1>
              <p style={{ color: 'rgba(255,255,255,0.65)', fontSize: '12px', margin: '2px 0 0' }}>Manage your trust memberships</p>
            </div>
            <button onClick={loadData} style={{ width: 36, height: 36, borderRadius: '10px', border: 'none', background: 'rgba(255,255,255,0.15)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
              <RefreshCw size={16} style={loading ? { animation: 'spin 0.8s linear infinite' } : {}} />
            </button>
          </div>
        </div>
      </div>

      {/* ── Content ── */}
      <div style={{ maxWidth: '430px', margin: '0 auto', padding: '20px 16px 40px' }}>

        {/* Success banner */}
        {submitSuccess && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: colors.successBg, border: `1.5px solid #BBF7D0`, borderRadius: '14px', padding: '12px 16px', marginBottom: '16px', animation: 'fadeUp 0.3s ease-out' }}>
            <CheckCircle size={18} color={colors.success} />
            <p style={{ fontSize: '13px', fontWeight: 600, color: '#15803d', margin: 0 }}>{submitSuccess}</p>
          </div>
        )}

        {/* Loading spinner */}
        {loading && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '60px 0' }}>
            <div style={{ width: 48, height: 48, border: `3px solid #E0E7FF`, borderTop: `3px solid ${colors.primary}`, borderRadius: '50%', animation: 'spin 0.8s linear infinite', marginBottom: '16px' }} />
            <p style={{ fontSize: '14px', color: colors.muted, fontWeight: 500 }}>Loading memberships...</p>
          </div>
        )}

        {/* Error state */}
        {!loading && error && (
          <div style={{ background: colors.errorBg, border: `1.5px solid #FECACA`, borderRadius: '16px', padding: '20px', textAlign: 'center', marginBottom: '16px' }}>
            <AlertCircle size={24} color={colors.error} style={{ margin: '0 auto 8px', display: 'block' }} />
            <p style={{ color: colors.error, fontSize: '14px', fontWeight: 600, margin: '0 0 12px' }}>{error}</p>
            <button onClick={loadData} style={{ padding: '8px 20px', background: colors.primary, color: '#fff', border: 'none', borderRadius: '10px', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}>Retry</button>
          </div>
        )}

        {!loading && !error && (
          <>
            {/* ── ADD MEMBERSHIP BUTTON ── */}
            {!showForm && (
              <button
                onClick={() => { setShowForm(true); setSubmitError(''); setSubmitSuccess(''); }}
                style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', padding: '14px 20px', background: `linear-gradient(135deg, ${colors.primary}, ${colors.secondary})`, color: '#fff', border: 'none', borderRadius: '16px', fontSize: '15px', fontWeight: 700, cursor: 'pointer', marginBottom: '20px', boxShadow: `0 4px 16px ${colors.primary}40`, letterSpacing: '-0.2px', animation: 'fadeUp 0.3s ease-out' }}
              >
                <Plus size={20} />
                Add New Membership
              </button>
            )}

            {/* ── ADD MEMBERSHIP FORM ── */}
            {showForm && (
              <div style={{ background: '#fff', borderRadius: '20px', border: `2px solid ${colors.primary}20`, boxShadow: `0 8px 32px ${colors.primary}15`, marginBottom: '24px', overflow: 'hidden', animation: 'fadeUp 0.35s ease-out' }}>
                <div style={{ background: `linear-gradient(135deg, ${colors.primary}, ${colors.secondary})`, padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{ width: 36, height: 36, borderRadius: '10px', background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Plus size={18} color="#fff" />
                    </div>
                    <div>
                      <h2 style={{ color: '#fff', fontSize: '15px', fontWeight: 800, margin: 0 }}>Add New Membership</h2>
                      <p style={{ color: 'rgba(255,255,255,0.65)', fontSize: '11px', margin: 0 }}>Fill in the trust membership details</p>
                    </div>
                  </div>
                  <button onClick={() => { setShowForm(false); setSubmitError(''); setForm(EMPTY_FORM); }}
                    style={{ width: 32, height: 32, borderRadius: '10px', border: 'none', background: 'rgba(255,255,255,0.15)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                    <X size={16} />
                  </button>
                </div>

                <form onSubmit={handleSubmit} style={{ padding: '20px' }}>

                  {/* Trust / Organisation — plain text input */}
                  <div style={{ marginBottom: '16px' }}>
                    <Label><Building2 size={10} style={{ display: 'inline', marginRight: 5 }} />Trust / Organisation *</Label>
                    <input
                      type="text"
                      placeholder="Enter trust or organisation name"
                      value={form.organisation_name}
                      onChange={e => handleFormChange('organisation_name', e.target.value)}
                      style={inputStyle}
                    />
                  </div>

                  {/* Membership Number */}
                  <div style={{ marginBottom: '16px' }}>
                    <Label><Hash size={10} style={{ display: 'inline', marginRight: 5 }} />Membership Number *</Label>
                    <input
                      type="text"
                      placeholder="e.g. MBR-2024-001"
                      value={form.membership_no}
                      onChange={e => handleFormChange('membership_no', e.target.value)}
                      required
                      style={inputStyle}
                    />
                  </div>

                  {/* Membership Type — free text, optional */}
                  <div style={{ marginBottom: '16px' }}>
                    <Label><Tag size={10} style={{ display: 'inline', marginRight: 5 }} />Membership Type (optional)</Label>
                    <input
                      type="text"
                      placeholder="e.g. Life Member, Annual Member..."
                      value={form.membership_type}
                      onChange={e => handleFormChange('membership_type', e.target.value)}
                      style={inputStyle}
                    />
                  </div>

                  {/* Remark */}
                  <div style={{ marginBottom: '20px' }}>
                    <Label><FileText size={10} style={{ display: 'inline', marginRight: 5 }} />Remark (optional)</Label>
                    <textarea
                      placeholder="Any notes or remarks..."
                      value={form.remark}
                      onChange={e => handleFormChange('remark', e.target.value)}
                      rows={3}
                      style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.5 }}
                    />
                  </div>

                  {/* Submit error */}
                  {submitError && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: colors.errorBg, border: `1px solid #FECACA`, borderRadius: '10px', padding: '10px 14px', marginBottom: '14px' }}>
                      <AlertCircle size={16} color={colors.error} />
                      <p style={{ fontSize: '13px', color: colors.error, margin: 0, fontWeight: 600 }}>{submitError}</p>
                    </div>
                  )}

                  {/* Submit buttons */}
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button type="button"
                      onClick={() => { setShowForm(false); setSubmitError(''); setForm(EMPTY_FORM); }}
                      style={{ flex: 1, padding: '12px', background: '#F1F5F9', color: '#475569', border: 'none', borderRadius: '12px', fontSize: '14px', fontWeight: 700, cursor: 'pointer' }}>
                      Cancel
                    </button>
                    <button type="submit" disabled={submitting}
                      style={{ flex: 2, padding: '12px', background: submitting ? '#94a3b8' : `linear-gradient(135deg, ${colors.primary}, ${colors.secondary})`, color: '#fff', border: 'none', borderRadius: '12px', fontSize: '14px', fontWeight: 700, cursor: submitting ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', boxShadow: submitting ? 'none' : `0 4px 14px ${colors.primary}35` }}>
                      {submitting
                        ? <><Loader2 size={16} style={{ animation: 'spin 0.8s linear infinite' }} /> Saving…</>
                        : <><Save size={16} /> Save Membership</>}
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* ── SECTION: Other Memberships (from other_memberships table) ── */}
            {otherMems.length > 0 && (
              <div style={{ marginBottom: '28px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
                  <div style={{ width: 28, height: 28, borderRadius: '8px', background: `linear-gradient(135deg, ${colors.accent}, #e05c53)`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Building2 size={14} color="#fff" />
                  </div>
                  <span style={{ fontSize: '13px', fontWeight: 700, color: colors.accent }}>
                    {otherMems.length} Added Membership{otherMems.length !== 1 ? 's' : ''}
                  </span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {otherMems.map((m, idx) => (
                    <MembershipCard key={m.id} m={m} index={idx} />
                  ))}
                </div>
              </div>
            )}

            {/* ── SECTION: Trust Links (from member_trust_links) ── */}
            {trustLinks.length > 0 && (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
                  <div style={{ width: 28, height: 28, borderRadius: '8px', background: `linear-gradient(135deg, ${colors.primary}, ${colors.secondary})`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Users size={14} color="#fff" />
                  </div>
                  <span style={{ fontSize: '13px', fontWeight: 700, color: colors.primary }}>
                    {trustLinks.length} Trust{trustLinks.length !== 1 ? 's' : ''} Linked
                  </span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {trustLinks.map((link, index) => (
                    <div key={link.id || index} style={{ background: colors.card, borderRadius: '20px', border: `1.5px solid ${colors.border}`, boxShadow: '0 4px 16px rgba(43,47,126,0.07)', overflow: 'hidden', animation: `fadeUp 0.35s ease-out ${index * 0.07}s both` }}>
                      <div style={{ height: '3px', background: `linear-gradient(90deg, ${colors.primary}, ${colors.secondary})` }} />
                      <div style={{ padding: '16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                          <TrustAvatar trust={link.Trust || { name: 'Trust', icon_url: null }} />
                          <div style={{ flex: 1 }}>
                            <h3 style={{ fontSize: '15px', fontWeight: 800, color: '#1e293b', margin: '0 0 5px', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                              {link.Trust?.name || 'Trust'}
                            </h3>
                            {link.is_active && (
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '10px', fontWeight: 700, color: colors.success, background: colors.successBg, padding: '2px 8px', borderRadius: '20px' }}>
                                <span style={{ width: 5, height: 5, borderRadius: '50%', background: colors.success, display: 'inline-block' }} /> Active
                              </span>
                            )}
                          </div>
                        </div>
                        <div style={{ background: '#F8F9FF', borderRadius: '12px', padding: '12px' }}>
                          <Label>Membership No.</Label>
                          <p style={{ fontSize: '15px', fontWeight: 800, color: colors.primary, margin: 0, letterSpacing: '0.05em' }}>
                            {link.membership_no || '—'}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Empty state */}
            {otherMems.length === 0 && trustLinks.length === 0 && (
              <div style={{ textAlign: 'center', padding: '60px 24px', background: '#fff', borderRadius: '20px', border: `1.5px solid ${colors.border}`, boxShadow: '0 2px 16px rgba(43,47,126,0.06)' }}>
                <div style={{ width: 72, height: 72, borderRadius: '20px', background: 'linear-gradient(135deg, #EEF1FF, #E0E7FF)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                  <Building2 size={32} color={colors.primary} />
                </div>
                <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#1e293b', margin: '0 0 8px' }}>No Memberships Yet</h3>
                <p style={{ fontSize: '13px', color: colors.muted, margin: 0, lineHeight: 1.5 }}>
                  Tap <strong>"Add New Membership"</strong> to add your first trust membership.
                </p>
              </div>
            )}
          </>
        )}
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(16px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
};

export default OtherMemberships;
