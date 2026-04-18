import React, { useEffect, useState } from 'react';
import { ArrowLeft, Building2, Globe, Mail, MapPin, Phone, Star } from 'lucide-react';
import { getSponsorById, getSponsors } from './services/api';
import { useTheme } from './hooks';

const getCachedSponsorsForTrust = (trustId) => {
  if (!trustId) return [];
  try {
    const raw = localStorage.getItem(`sponsors_cache_${trustId}`);
    const parsed = raw ? JSON.parse(raw) : [];
    if (Array.isArray(parsed)) return parsed;
    if (Array.isArray(parsed?.data)) return parsed.data;
    return [];
  } catch {
    return [];
  }
};

const SponsorDetails = ({ onBack }) => {
  const selectedTrustId = localStorage.getItem('selected_trust_id') || '';
  const { theme } = useTheme(selectedTrustId);
  const [sponsor, setSponsor] = useState(() => {
    try {
      const raw = sessionStorage.getItem('selectedSponsor');
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });
  const [loading, setLoading] = useState(() => !sponsor);

  useEffect(() => {
    const loadSponsorDetails = async () => {
      try {
        const trustId = localStorage.getItem('selected_trust_id') || null;
        const trustName = localStorage.getItem('selected_trust_name') || null;

        let selectedSponsor = null;
        try {
          const raw = sessionStorage.getItem('selectedSponsor');
          selectedSponsor = raw ? JSON.parse(raw) : null;
        } catch {
          selectedSponsor = null;
        }

        let resolvedSponsor = null;
        let trustSponsors = getCachedSponsorsForTrust(trustId);

        if (selectedSponsor?.id) {
          resolvedSponsor = trustSponsors.find((item) => item.id === selectedSponsor.id) || null;
        }

        if (!resolvedSponsor && selectedSponsor) {
          resolvedSponsor = selectedSponsor;
        }

        if (!resolvedSponsor && trustSponsors.length > 0) {
          resolvedSponsor = trustSponsors[0];
        }

        if (resolvedSponsor) {
          setSponsor(resolvedSponsor);
          setLoading(false);
        } else {
          setLoading(true);
        }

        const listRes = await getSponsors(trustId, trustName);
        if (listRes?.success && Array.isArray(listRes.data)) {
          trustSponsors = listRes.data;
          if (trustId) {
            try {
              localStorage.setItem(
                `sponsors_cache_${trustId}`,
                JSON.stringify({ ts: Date.now(), data: trustSponsors })
              );
            } catch {
              // ignore cache write errors
            }
          }
        }

        if (selectedSponsor?.id) {
          resolvedSponsor = trustSponsors.find((item) => item.id === selectedSponsor.id) || null;
          if (!resolvedSponsor) {
            const singleRes = await getSponsorById(selectedSponsor.id);
            if (singleRes?.success && Array.isArray(singleRes.data) && singleRes.data[0]) {
              resolvedSponsor = singleRes.data[0];
            }
          }
        }

        if (!resolvedSponsor && selectedSponsor) {
          resolvedSponsor = selectedSponsor;
        }

        if (!resolvedSponsor && trustSponsors.length > 0) {
          resolvedSponsor = trustSponsors[0];
        }

        if (resolvedSponsor) {
          try {
            sessionStorage.setItem('selectedSponsor', JSON.stringify(resolvedSponsor));
          } catch {
            // ignore session storage errors
          }
        }

        setSponsor(resolvedSponsor || null);
      } catch (error) {
        console.error('Error loading sponsor details:', error);
      } finally {
        setLoading(false);
      }
    };

    loadSponsorDetails();
  }, []);

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

  if (!sponsor) {
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

  const fullAddress = [sponsor.address, sponsor.city, sponsor.state].filter(Boolean).join(', ');
  const hasContact = sponsor.phone || sponsor.whatsapp_number || sponsor.email_id || sponsor.website_url || sponsor.catalog_url || fullAddress;

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

            <div className="relative px-4 pt-4 pb-3 border-b border-slate-100">
              <div className="flex items-start gap-3">
                <div className="w-20 h-20 rounded-2xl p-[2px] flex-shrink-0" style={{ background: `linear-gradient(145deg, ${theme.primary}55, ${theme.secondary}44)` }}>
                  <div className="w-full h-full rounded-2xl overflow-hidden bg-white flex items-center justify-center">
                    {sponsor.photo_url ? (
                      <img
                        src={sponsor.photo_url}
                        alt={sponsor.name || sponsor.company_name || 'Sponsor'}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <Star className="h-7 w-7" style={{ color: theme.primary }} />
                    )}
                  </div>
                </div>

                <div className="min-w-0 flex-1">
                  <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.18em]" style={{ color: theme.primary, background: '#fff6f6', border: `1px solid ${theme.primary}30` }}>
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: theme.primary }} />
                    {sponsor.badge_label || 'Official Sponsor'}
                  </span>
                  <h2 className="mt-2 text-[21px] leading-tight font-extrabold truncate" style={{ color: theme.secondary }}>
                    {sponsor.name || sponsor.company_name || 'Sponsor'}
                  </h2>
                  <div className="mt-1 inline-flex items-center gap-1.5 min-w-0">
                    <Building2 className="h-3 w-3 text-slate-400 flex-shrink-0" />
                    <p className="text-xs font-semibold text-slate-500 truncate">
                      {sponsor.company_name || sponsor.position || 'Community partner'}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="px-4 py-4 space-y-3">
              <div className="rounded-2xl border border-slate-200 bg-white p-3.5">
                <p className="text-[11px] uppercase tracking-[0.14em] font-bold mb-1" style={{ color: theme.primary }}>About</p>
                <p className="text-sm leading-relaxed text-slate-700">
                  {sponsor.about || 'Supporting our community with care, commitment, and trusted services.'}
                </p>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-3.5">
                <p className="text-[11px] uppercase tracking-[0.14em] font-bold mb-2" style={{ color: theme.primary }}>Contact</p>
                {hasContact ? (
                  <div className="space-y-2 text-sm text-slate-700">
                    {sponsor.phone && (
                      <div className="flex items-center gap-2">
                        <Phone className="h-4 w-4" style={{ color: theme.primary }} />
                        <span>{sponsor.phone}</span>
                      </div>
                    )}
                    {sponsor.whatsapp_number && (
                      <div className="flex items-center gap-2">
                        <Phone className="h-4 w-4 text-emerald-500" />
                        <span>WhatsApp {sponsor.whatsapp_number}</span>
                      </div>
                    )}
                    {sponsor.email_id && (
                      <div className="flex items-center gap-2">
                        <Mail className="h-4 w-4" style={{ color: theme.primary }} />
                        <span>{sponsor.email_id}</span>
                      </div>
                    )}
                    {fullAddress && (
                      <div className="flex items-start gap-2">
                        <MapPin className="h-4 w-4 mt-0.5" style={{ color: theme.primary }} />
                        <span>{fullAddress}</span>
                      </div>
                    )}
                    {sponsor.website_url && (
                      <div className="flex items-center gap-2">
                        <Globe className="h-4 w-4" style={{ color: theme.primary }} />
                        <a href={sponsor.website_url} target="_blank" rel="noreferrer" className="underline underline-offset-2 break-all">
                          {sponsor.website_url}
                        </a>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-slate-500">Contact details will appear here once added.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SponsorDetails;

