import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Building2, Globe, Mail, MapPin, Phone, Star } from 'lucide-react';
import { useTheme } from './hooks';
import { getCachedSponsorById, getCachedSponsorDetail, getSponsorDetail, readSelectedSponsorId } from './services/sponsorStore';

const ASSOCIATION_LABEL = 'In Association With';

const toClean = (value) => {
  const text = String(value ?? '').trim();
  return text || '';
};

const buildHref = {
  phone: (value) => `tel:${value.replace(/\s+/g, '')}`,
  email: (value) => `mailto:${value}`,
  whatsapp: (value) => {
    const digits = value.replace(/\D/g, '');
    return digits ? `https://wa.me/${digits}` : '';
  },
  url: (value) => {
    const trimmed = toClean(value);
    if (!trimmed) return '';
    return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  }
};

const SponsorDetails = ({ onBack }) => {
  const selectedTrustId = localStorage.getItem('selected_trust_id') || '';
  const { theme } = useTheme(selectedTrustId);

  const [sponsorId] = useState(() => readSelectedSponsorId());

  const [sponsor, setSponsor] = useState(() => {
    if (!sponsorId) return null;
    const cachedMeta = getCachedSponsorById(sponsorId, selectedTrustId);
    const cachedDetail = getCachedSponsorDetail(sponsorId).detail;
    return cachedDetail || cachedMeta || null;
  });
  const [loading, setLoading] = useState(() => !sponsor);

  useEffect(() => {
    let active = true;
    const load = async () => {
      if (!sponsorId) {
        setLoading(false);
        return;
      }
      try {
        console.log(`[Sponsor] detail page sponsor.id=${sponsorId}`);
        const cachedMeta = getCachedSponsorById(sponsorId, selectedTrustId);
        if (cachedMeta && active) {
          setSponsor(cachedMeta);
          setLoading(false);
        }

        const detail = await getSponsorDetail({ sponsorId, trustId: selectedTrustId });
        if (!active) return;
        if (detail) {
          setSponsor(detail);
        }
      } catch (error) {
        if (active) console.error('Error loading sponsor details:', error);
      } finally {
        if (active) setLoading(false);
      }
    };

    load();
    return () => { active = false; };
  }, [sponsorId, selectedTrustId]);

  const data = useMemo(() => {
    if (!sponsor) return null;

    const phone1 = toClean(sponsor.ContactNumber1 || sponsor.phone);
    const phone2 = toClean(sponsor.contactNumber2);
    const phone3 = toClean(sponsor.contactNumber3);

    const email1 = toClean(sponsor.email_id1 || sponsor.email_id);
    const email2 = toClean(sponsor.emailId2);
    const email3 = toClean(sponsor.emailId3);

    const whatsapp = toClean(sponsor.whatsapp_number);

    const address1 = toClean(sponsor.address);
    const address2 = toClean(sponsor.address2);
    const address3 = toClean(sponsor.address3);
    const city = toClean(sponsor.city);
    const state = toClean(sponsor.state);

    const website = toClean(sponsor.website_url);
    const catalog = toClean(sponsor.catalog_url);
    const facebook = toClean(sponsor.facebook);
    const instagram = toClean(sponsor.instagram);
    const xLink = toClean(sponsor.X);
    const linkedin = toClean(sponsor.linkedin);

    return {
      photo: toClean(sponsor.photo_url),
      name: toClean(sponsor.name),
      position: toClean(sponsor.position),
      position2: toClean(sponsor.position2),
      company: toClean(sponsor.company_name),
      about: toClean(sponsor.about),
      coPartner: toClean(sponsor.coPartner),
      contacts: [
        { label: 'Mobile Number', value: phone1, type: 'phone' },
        { label: 'Alternate Phone Number', value: phone2, type: 'phone' },
        { label: 'Alternate Phone Number', value: phone3, type: 'phone' },
        { label: 'Email ID', value: email1, type: 'email' },
        { label: 'Alternate Email', value: email2, type: 'email' },
        { label: 'Alternate Email', value: email3, type: 'email' },
        { label: 'WhatsApp Number', value: whatsapp, type: 'whatsapp' }
      ].filter((item) => item.value),
      addresses: [
        { label: 'Address', value: address1 },
        { label: 'Alternate Address', value: address2 },
        { label: 'Alternate Address', value: address3 },
        { label: 'City', value: city },
        { label: 'State', value: state }
      ].filter((item) => item.value),
      links: [
        { label: 'Website', value: website },
        { label: 'Catalog', value: catalog },
        { label: 'Facebook', value: facebook },
        { label: 'Instagram', value: instagram },
        { label: 'X', value: xLink },
        { label: 'LinkedIn', value: linkedin }
      ].filter((item) => item.value)
    };
  }, [sponsor]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: `linear-gradient(160deg, #ffffff 0%, ${theme.accentBg || '#f8fafc'} 52%, #ffffff 100%)` }}>
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-2 border-t-transparent mx-auto" style={{ borderColor: theme.primary, borderTopColor: 'transparent' }} />
          <p className="mt-3 text-sm text-slate-500 font-medium">Loading sponsor details...</p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center px-5" style={{ background: `linear-gradient(160deg, #ffffff 0%, ${theme.accentBg || '#f8fafc'} 52%, #ffffff 100%)` }}>
        <div className="rounded-3xl bg-white border border-slate-200 p-6 max-w-sm w-full text-center shadow-sm">
          <h2 className="text-lg font-bold text-slate-800">No sponsor selected</h2>
          <p className="text-sm text-slate-500 mt-2">Please choose a sponsor from the list.</p>
          <button
            onClick={onBack}
            className="mt-4 px-4 py-2 rounded-xl text-sm font-semibold text-white"
            style={{ background: `linear-gradient(135deg, ${theme.primary} 0%, ${theme.secondary} 100%)` }}
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  const iconByType = {
    phone: <Phone className="h-4 w-4" style={{ color: theme.primary }} />,
    email: <Mail className="h-4 w-4" style={{ color: theme.primary }} />,
    whatsapp: <Phone className="h-4 w-4 text-emerald-500" />
  };

  return (
    <div className="min-h-screen" style={{ background: `linear-gradient(160deg, #ffffff 0%, ${theme.accentBg || '#f8fafc'} 52%, #ffffff 100%)` }}>
      <div className="theme-navbar backdrop-blur border-b px-5 py-4 flex items-center gap-3 sticky top-0 z-10">
        <button onClick={onBack} className="p-2 rounded-xl hover:bg-gray-100 transition-colors">
          <ArrowLeft className="h-5 w-5 text-gray-700" />
        </button>
        <div>
          <h1 className="text-lg font-extrabold" style={{ color: theme.secondary }}>Sponsor Details</h1>
          <p className="text-[11px] text-slate-400 font-medium">Selected sponsor profile</p>
        </div>
      </div>

      <div className="px-4 py-5">
        <div
          className="rounded-3xl p-[1px]"
          style={{
            background: `linear-gradient(130deg, ${theme.primary}40 0%, ${theme.secondary}2A 50%, ${theme.primary}2C 100%)`,
            boxShadow: `0 14px 30px ${theme.secondary}1A`,
          }}
        >
          <div className="relative rounded-3xl bg-white/95 backdrop-blur overflow-hidden">
            <div className="absolute -top-14 -right-10 h-28 w-28 rounded-full pointer-events-none" style={{ background: `radial-gradient(circle, ${theme.primary}4A 0%, transparent 70%)` }} />
            <div className="absolute -bottom-12 -left-10 h-24 w-24 rounded-full pointer-events-none" style={{ background: `radial-gradient(circle, ${theme.secondary}38 0%, transparent 72%)` }} />

            <div className="relative px-4 pt-5 pb-4 border-b border-slate-100">
              <div className="flex flex-col items-center text-center">
                <div
                  className="w-32 h-32 rounded-[1.8rem] p-[3px] shadow-sm"
                  style={{ background: `linear-gradient(145deg, ${theme.primary}66, ${theme.secondary}55)` }}
                >
                  <div className="w-full h-full rounded-[1.65rem] overflow-hidden bg-slate-50 flex items-center justify-center">
                    {data.photo ? (
                      <img
                        src={data.photo}
                        alt={data.name || data.company || 'Sponsor'}
                        className="w-full h-full object-contain"
                      />
                    ) : (
                      <Star className="h-10 w-10" style={{ color: theme.primary }} />
                    )}
                  </div>
                </div>

                <div className="mt-4 w-full">
                  {data.name ? (
                    <h2 className="text-[28px] leading-tight font-extrabold break-words" style={{ color: theme.secondary }}>
                      {data.name}
                    </h2>
                  ) : null}
                  {data.position ? (
                    <p className="mt-1 text-base font-semibold text-slate-600 break-words">{data.position}</p>
                  ) : null}
                  {data.position2 ? (
                    <p className="mt-1 text-sm font-medium text-slate-500 break-words">{data.position2}</p>
                  ) : null}
                  {data.company ? (
                    <div className="mt-2 inline-flex max-w-full items-start justify-center gap-1.5">
                      <Building2 className="h-4 w-4 text-slate-400 flex-shrink-0 mt-0.5" />
                      <p className="text-sm font-semibold text-slate-500 break-words text-left">{data.company}</p>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="px-4 py-4 space-y-3">
              {data.about ? (
                <div className="rounded-2xl border border-slate-200 bg-white p-3.5">
                  <p className="text-[11px] uppercase tracking-[0.14em] font-bold mb-1" style={{ color: theme.primary }}>About</p>
                  <p className="text-sm leading-relaxed text-slate-700">{data.about}</p>
                </div>
              ) : null}

              {data.contacts.length > 0 ? (
                <div className="rounded-2xl border border-slate-200 bg-white p-3.5">
                  <p className="text-[11px] uppercase tracking-[0.14em] font-bold mb-2" style={{ color: theme.primary }}>Contact Details</p>
                  <div className="space-y-2 text-sm text-slate-700">
                    {data.contacts.map((item, idx) => {
                      const href = buildHref[item.type](item.value);
                      if (!href) return null;
                      return (
                        <div key={`${item.label}-${idx}`} className="flex items-start gap-2">
                          <span className="mt-0.5">{iconByType[item.type]}</span>
                          <div className="min-w-0">
                            <p className="text-[11px] text-slate-400 font-semibold">{item.label}</p>
                            <a href={href} target={item.type === 'whatsapp' ? '_blank' : undefined} rel={item.type === 'whatsapp' ? 'noreferrer' : undefined} className="break-all underline underline-offset-2">
                              {item.value}
                            </a>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              {data.addresses.length > 0 ? (
                <div className="rounded-2xl border border-slate-200 bg-white p-3.5">
                  <p className="text-[11px] uppercase tracking-[0.14em] font-bold mb-2" style={{ color: theme.primary }}>Address</p>
                  <div className="space-y-1.5 text-sm text-slate-700">
                    {data.addresses.map((item, idx) => (
                      <div key={`${item.label}-${idx}`} className="flex items-start gap-2">
                        <MapPin className="h-4 w-4 mt-0.5" style={{ color: theme.primary }} />
                        <div className="min-w-0">
                          <p className="text-[11px] text-slate-400 font-semibold">{item.label}</p>
                          <p>{item.value}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {data.links.length > 0 ? (
                <div className="rounded-2xl border border-slate-200 bg-white p-3.5">
                  <p className="text-[11px] uppercase tracking-[0.14em] font-bold mb-2" style={{ color: theme.primary }}>Online Links</p>
                  <div className="space-y-2 text-sm text-slate-700">
                    {data.links.map((item) => {
                      const href = buildHref.url(item.value);
                      if (!href) return null;
                      return (
                        <div key={item.label} className="flex items-start gap-2">
                          <Globe className="h-4 w-4 mt-0.5" style={{ color: theme.primary }} />
                          <div className="min-w-0">
                            <p className="text-[11px] text-slate-400 font-semibold">{item.label}</p>
                            <a href={href} target="_blank" rel="noreferrer" className="break-all underline underline-offset-2">
                              {item.value}
                            </a>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              {data.coPartner ? (
                <div className="rounded-2xl border border-slate-200 bg-white p-3.5">
                  <p className="text-sm text-slate-700 font-medium">{ASSOCIATION_LABEL}: {data.coPartner}</p>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SponsorDetails;
