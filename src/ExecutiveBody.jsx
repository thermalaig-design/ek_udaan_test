import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Mail, Phone, Search, Users } from 'lucide-react';
import { useAppTheme } from './context/ThemeContext';
import { getExecutiveBodyMembers } from './services/supabaseService';

const TAB_OPTIONS = [
  { id: 'all', label: 'All' },
  { id: 'committee', label: 'Committee' },
  { id: 'elected', label: 'Elected' },
];

const ExecutiveBody = ({ onNavigate }) => {
  const navigate = useNavigate();
  const theme = useAppTheme();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('all');
  const [query, setQuery] = useState('');
  const [data, setData] = useState({ all: [], committee: [], elected: [] });

  useEffect(() => {
    let mounted = true;
    const trustId = localStorage.getItem('selected_trust_id') || null;
    const trustName = localStorage.getItem('selected_trust_name') || null;

    const load = async () => {
      try {
        setLoading(true);
        setError('');
        const response = await getExecutiveBodyMembers(trustId, trustName);
        if (!mounted) return;
        if (!response?.success) {
          setData({ all: [], committee: [], elected: [] });
          setError(response?.error || 'Unable to load executive body members.');
          return;
        }
        setData({
          all: response?.data?.all || [],
          committee: response?.data?.committee || [],
          elected: response?.data?.elected || [],
        });
      } catch (err) {
        if (!mounted) return;
        setData({ all: [], committee: [], elected: [] });
        setError(err?.message || 'Unable to load executive body members.');
      } finally {
        if (mounted) setLoading(false);
      }
    };

    load();
    return () => {
      mounted = false;
    };
  }, []);

  const activeMembers = useMemo(() => {
    const source = tab === 'all' ? data.all : (data[tab] || []);
    const normalizedQuery = String(query || '').trim().toLowerCase();
    if (!normalizedQuery) return source;
    return source.filter((item) => {
      const haystack = [
        item?.Name,
        item?.member_name_english,
        item?.member_role,
        item?.title,
        item?.subtitle,
        item?.position,
        item?.location,
        item?.Mobile,
        item?.Email,
        item?.['Membership number'],
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(normalizedQuery);
    });
  }, [data, query, tab]);

  const totalByTab = useMemo(
    () => ({
      all: data.all.length,
      committee: data.committee.length,
      elected: data.elected.length,
    }),
    [data]
  );

  const visibleTabs = useMemo(
    () => TAB_OPTIONS.filter((item) => item.id === 'all' || (totalByTab[item.id] || 0) > 0),
    [totalByTab]
  );

  useEffect(() => {
    if (!visibleTabs.some((item) => item.id === tab)) {
      setTab('all');
    }
  }, [tab, visibleTabs]);

  const openMemberDetails = (item) => {
    const memberData = {
      'S. No.': item?.['S. No.'] || item?.original_id || item?.id || 'N/A',
      Name: item?.Name || item?.member_name_english || 'N/A',
      Mobile: item?.Mobile || 'N/A',
      Email: item?.Email || 'N/A',
      type: item?.type || 'N/A',
      role: item?.role || 'N/A',
      member_role: item?.member_role || item?.title || 'N/A',
      title: item?.title || 'N/A',
      subtitle: item?.subtitle || 'N/A',
      'Membership number': item?.['Membership number'] || 'N/A',
      'Company Name': item?.['Company Name'] || 'N/A',
      'Address Home': item?.['Address Home'] || 'N/A',
      'Address Office': item?.['Address Office'] || 'N/A',
      'Resident Landline': item?.['Resident Landline'] || 'N/A',
      'Office Landline': item?.['Office Landline'] || 'N/A',
      committee_name_english: item?.committee_name_english || item?.title || 'N/A',
      committee_name_hindi: item?.committee_name_hindi || item?.subtitle || 'N/A',
      position: item?.position || item?.title || 'N/A',
      location: item?.location || item?.subtitle || 'N/A',
      isCommitteeMember: item?.role_type === 'committee',
      isElectedMember: item?.role_type === 'elected',
      previousScreenName: 'executive-body',
    };

    if (typeof onNavigate === 'function') {
      onNavigate('executive-member-details', memberData);
      return;
    }
    navigate('/executive_members_details', { state: { memberData } });
  };

  return (
    <div className="min-h-screen" style={{ background: 'var(--app-page-bg)' }}>
      <div className="sticky top-0 z-20 px-4 pt-5 pb-4" style={{ background: 'var(--app-page-bg)', borderBottom: `1px solid color-mix(in srgb, ${theme.primary || 'var(--brand-red)'} 16%, transparent)` }}>
        <button
          type="button"
          onClick={() => navigate('/')}
          className="inline-flex items-center gap-2 text-sm font-bold mb-3"
          style={{ color: theme.primary || 'var(--brand-red)' }}
        >
          <ArrowLeft className="h-4 w-4" />
          Home
        </button>
        <h1 className="text-xl font-extrabold" style={{ color: 'var(--heading-color)' }}>Executive Body</h1>
        <p className="text-xs mt-1" style={{ color: 'var(--body-text-color)' }}>
          Member roles based listing
        </p>
      </div>

      <div className="px-4 pt-4">
        <div className="rounded-2xl p-3 flex items-center gap-2" style={{ background: 'var(--surface-color)', border: '1px solid color-mix(in srgb, var(--brand-navy) 12%, transparent)' }}>
          <Search className="h-4 w-4" style={{ color: 'var(--body-text-color)' }} />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, role, membership, mobile"
            className="w-full bg-transparent outline-none text-sm"
            style={{ color: 'var(--heading-color)' }}
          />
        </div>
      </div>

      <div className="px-4 mt-4 flex gap-2 overflow-x-auto">
        {visibleTabs.map((item) => {
          const isActive = tab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className="px-3 py-2 rounded-xl text-xs font-bold whitespace-nowrap"
              style={isActive
                ? { background: `linear-gradient(135deg, ${theme.primary || 'var(--brand-red)'}, ${theme.secondary || 'var(--brand-navy)'})`, color: '#fff' }
                : { background: 'var(--surface-color)', color: 'var(--brand-navy)', border: '1px solid color-mix(in srgb, var(--brand-navy) 14%, transparent)' }}
            >
              {item.label} ({totalByTab[item.id] || 0})
            </button>
          );
        })}
      </div>

      <div className="px-4 py-4 space-y-3">
        {loading ? (
          <div className="rounded-2xl p-8 text-center" style={{ background: 'var(--surface-color)' }}>
            <p className="text-sm font-semibold" style={{ color: 'var(--body-text-color)' }}>Loading members...</p>
          </div>
        ) : error ? (
          <div className="rounded-2xl p-6 text-center" style={{ background: 'var(--surface-color)', border: '1px solid color-mix(in srgb, var(--brand-red) 20%, transparent)' }}>
            <p className="text-sm font-semibold" style={{ color: 'var(--brand-red-dark)' }}>{error}</p>
          </div>
        ) : activeMembers.length === 0 ? (
          <div className="rounded-2xl p-8 text-center" style={{ background: 'var(--surface-color)' }}>
            <Users className="h-8 w-8 mx-auto mb-2" style={{ color: 'var(--body-text-color)' }} />
            <p className="text-sm font-semibold" style={{ color: 'var(--body-text-color)' }}>No members found</p>
          </div>
        ) : (
          activeMembers.map((item) => (
            <button
              type="button"
              key={item?.id || item?.reg_id || item?.['S. No.']}
              onClick={() => openMemberDetails(item)}
              className="w-full text-left rounded-2xl p-4"
              style={{ background: 'var(--surface-color)', border: '1px solid color-mix(in srgb, var(--brand-navy) 10%, transparent)' }}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="text-sm font-extrabold truncate" style={{ color: 'var(--heading-color)' }}>
                    {item?.Name || item?.member_name_english || 'N/A'}
                  </h3>
                  <p className="text-[11px] mt-0.5" style={{ color: 'var(--body-text-color)' }}>
                    {item?.member_role || item?.title || item?.type || 'N/A'}
                  </p>
                </div>
                <span
                  className="text-[10px] font-bold uppercase px-2 py-1 rounded-full"
                  style={item?.role_type === 'committee'
                    ? { background: 'var(--brand-navy-light)', color: 'var(--brand-navy)' }
                    : { background: 'var(--brand-red-light)', color: 'var(--brand-red-dark)' }}
                >
                  {item?.role_type || 'role'}
                </span>
              </div>

              <div className="mt-2 flex flex-wrap gap-2">
                {item?.['Membership number'] ? (
                  <span className="text-[10px] font-semibold px-2 py-1 rounded-full" style={{ background: 'color-mix(in srgb, var(--brand-navy-light) 55%, var(--surface-color))', color: 'var(--brand-navy)' }}>
                    M No: {item['Membership number']}
                  </span>
                ) : null}
                {item?.subtitle ? (
                  <span className="text-[10px] font-semibold px-2 py-1 rounded-full" style={{ background: 'color-mix(in srgb, var(--brand-red-light) 50%, var(--surface-color))', color: 'var(--brand-red-dark)' }}>
                    {item.subtitle}
                  </span>
                ) : null}
              </div>

              <div className="mt-3 flex items-center gap-3 text-[11px]">
                {item?.Mobile ? (
                  <span className="inline-flex items-center gap-1" style={{ color: 'var(--body-text-color)' }}>
                    <Phone className="h-3 w-3" />
                    {item.Mobile}
                  </span>
                ) : null}
                {item?.Email ? (
                  <span className="inline-flex items-center gap-1 truncate" style={{ color: 'var(--body-text-color)' }}>
                    <Mail className="h-3 w-3" />
                    {item.Email}
                  </span>
                ) : null}
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
};

export default ExecutiveBody;
