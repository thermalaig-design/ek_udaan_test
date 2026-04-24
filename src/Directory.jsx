import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { User, Mail, Calendar, MapPin, Briefcase, Award, Users, Search, Phone, Star, Stethoscope, Building2, ChevronRight, Filter, ArrowLeft, Menu, LogOut, Bell, Heart, ArrowRight, X, Home as HomeIcon, Clock, FileText, UserPlus, Pill, ChevronLeft } from 'lucide-react';
import { getMemberTypes, getAllMembers, getAllHospitals, getAllElectedMembers, getAllCommitteeMembers, getMembersPage, getProfilePhotos } from './services/api';
import { getOpdDoctors } from './services/supabaseService';
import Sidebar from './components/Sidebar';
import { fetchFeatureFlags, subscribeFeatureFlags } from './services/featureFlags';
import { useAppTheme } from './context/ThemeContext';
import { getNavbarThemeStyles } from './utils/themeUtils';

const CACHE_KEY = 'directory_data_cache';
const CACHE_TIMESTAMP_KEY = 'directory_cache_timestamp';
const CACHE_DURATION = 30 * 60 * 1000; // 30 minutes
const MAX_ORDER_VALUE = Number.MAX_SAFE_INTEGER;

const getMembershipValue = (member) =>
  member?.membership_number ??
  member?.['Membership number'] ??
  member?.membership_number_elected ??
  member?.member_id ??
  member?.['S. No.'] ??
  member?.id ??
  '';

const getMembershipSortMeta = (member) => {
  const text = String(getMembershipValue(member) || '').trim();
  if (!text) return { hasMembership: false, numericPart: MAX_ORDER_VALUE, textPart: '' };

  const numericMatch = text.match(/\d+/g);
  const numericPart = numericMatch
    ? Number.parseInt(numericMatch.join(''), 10)
    : MAX_ORDER_VALUE;

  return { hasMembership: true, numericPart, textPart: text.toLowerCase() };
};

const sortMembersByMembershipNumber = (members = []) => {
  return [...members].sort((a, b) => {
    const metaA = getMembershipSortMeta(a);
    const metaB = getMembershipSortMeta(b);

    if (metaA.hasMembership !== metaB.hasMembership) {
      return metaA.hasMembership ? -1 : 1;
    }
    if (metaA.numericPart !== metaB.numericPart) {
      return metaA.numericPart - metaB.numericPart;
    }
    if (metaA.textPart !== metaB.textPart) {
      return metaA.textPart.localeCompare(metaB.textPart);
    }

    const nameA = String(a?.Name ?? a?.member_name_english ?? a?.hospital_name ?? '').toLowerCase();
    const nameB = String(b?.Name ?? b?.member_name_english ?? b?.hospital_name ?? '').toLowerCase();
    return nameA.localeCompare(nameB);
  });
};

const normalizeRoleText = (value) =>
  String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const hasRoleKeyword = (member, keyword) => {
  const normalizedKeyword = normalizeRoleText(keyword);
  if (!normalizedKeyword) return false;
  const roleText = normalizeRoleText(
    member?.role ||
    member?.type ||
    member?.position ||
    member?.member_role ||
    member?.title
  );
  return roleText.includes(normalizedKeyword);
};

const TRUSTEE_ROLE_KEYWORDS = [
  'trustee',
  'president',
  'founder',
  'chairman',
  'adhyaksha',
  'upadhyaksha',
  'mantri',
  'secretary',
  'koshadhyaksha',
  'treasurer',
  'salahakar',
  'advisor',
  'auditor'
];

const isTrusteeLikeRole = (member) => {
  const roleText = normalizeRoleText(
    member?.role ||
    member?.type ||
    member?.position ||
    member?.member_role ||
    member?.title
  );

  if (!roleText) return false;
  return TRUSTEE_ROLE_KEYWORDS.some((kw) => roleText.includes(kw));
};

const Directory = ({ onNavigate }) => {
  const theme = useAppTheme();
  const navbarTheme = getNavbarThemeStyles(theme);
  const navbarTextColor = navbarTheme?.textColor || 'var(--navbar-text)';
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [directoryTab, setDirectoryTab] = useState('healthcare');
  const [searchQuery, setSearchQuery] = useState('');
  const [allMembers, setAllMembers] = useState([]);
  const [hospitals, setHospitals] = useState([]);
  const [electedMembers, setElectedMembers] = useState([]);
  const [committeeMembers, setCommitteeMembers] = useState([]);
  const [supaDoctors, setSupaDoctors] = useState([]); // doctors from Supabase opd_schedule
  const [memberTypes, setMemberTypes] = useState([]);
  const [error, setError] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalMembersCount, setTotalMembersCount] = useState(null);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [profilePhotos, setProfilePhotos] = useState({}); // Store profile photos
  const [featureFlags, setFeatureFlags] = useState({});
  const loadedTabsRef = useRef(new Set()); // Track which tabs have loaded data
  const itemsPerPage = 20;
  const loadTabDataRef = useRef(null); // Reference to store the loadTabData function

  const isFeatureEnabled = (key) => featureFlags[key] !== false;
  const isDirectoryEnabled = isFeatureEnabled('feature_directory');
  const isDoctorsEnabled = isFeatureEnabled('feature_doctors');
  const isHospitalsEnabled = isFeatureEnabled('feature_hospitals');
  const isElectedEnabled = isFeatureEnabled('feature_elected_members');
  const isCommitteeEnabled = isFeatureEnabled('feature_committee');
  const isHealthcareEnabled = isDoctorsEnabled || isHospitalsEnabled;

  useEffect(() => {
    const loadFlags = async (force = false) => {
      const trustId = localStorage.getItem('selected_trust_id') || null;
      const result = await fetchFeatureFlags(trustId, { force });
      if (result.success) {
        setFeatureFlags(result.flags || {});
      }
    };
    loadFlags();

    const handleFocus = () => loadFlags(true);
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') loadFlags(true);
    };
    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibility);

    const trustId = localStorage.getItem('selected_trust_id') || null;
    const unsubscribe = subscribeFeatureFlags(trustId, () => loadFlags(true));

    return () => {
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibility);
      unsubscribe?.();
    };
  }, []);

  // Scroll locking when sidebar is open
  useEffect(() => {
    if (isMenuOpen) {
      const scrollY = window.scrollY;
      document.documentElement.style.overflow = 'hidden';
      document.body.style.overflow = 'hidden';
      document.body.style.position = 'fixed';
      document.body.style.width = '100%';
      document.body.style.top = `-${scrollY}px`;
      document.body.style.touchAction = 'none';
    } else {
      const scrollY = parseInt(document.body.style.top || '0') * -1;
      document.documentElement.style.overflow = 'unset';
      document.body.style.overflow = 'unset';
      document.body.style.position = 'unset';
      document.body.style.width = 'unset';
      document.body.style.top = 'unset';
      document.body.style.touchAction = 'auto';
      window.scrollTo(0, scrollY);
    }
    return () => {
      document.documentElement.style.overflow = 'unset';
      document.body.style.overflow = 'unset';
      document.body.style.position = 'unset';
      document.body.style.width = 'unset';
      document.body.style.top = 'unset';
      document.body.style.touchAction = 'auto';
      document.body.style.pointerEvents = 'auto';
    };
  }, [isMenuOpen]);

  // Close sidebar when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (isMenuOpen && !event.target.closest('.absolute.left-0.top-0.bottom-0.w-72')) {
        setIsMenuOpen(false);
      }
    };

    if (isMenuOpen) {
      document.addEventListener('click', handleClickOutside, true);
      return () => {
        document.removeEventListener('click', handleClickOutside, true);
      };
    }
  }, [isMenuOpen]);

  // Restore directory tab when coming back from member details
  useEffect(() => {
    const restoreTab = sessionStorage.getItem('restoreDirectoryTab');
    if (restoreTab) {
      const timer = setTimeout(() => {
        setDirectoryTab(restoreTab);
        sessionStorage.removeItem('restoreDirectoryTab');
      }, 0);

      return () => clearTimeout(timer);
    }
  }, []);

  // Load data for specific tab - lazy loading
  const loadTabData = useCallback(async (tabId) => {
    // If already loaded, skip
    if (loadedTabsRef.current.has(tabId)) return;

    try {
      setError(null);

      if (tabId === 'all' || tabId === 'healthcare' || tabId === 'trustees' || tabId === 'patrons' || tabId === 'doctors') {
        // Load first page of members only
        if (allMembers.length === 0) {
          const trustId = localStorage.getItem('selected_trust_id') || null;
          const trustName = localStorage.getItem('selected_trust_name') || null;
          const res = await getMembersPage(1, itemsPerPage, trustId, trustName);
          setAllMembers(res?.data || []);
          setTotalMembersCount(res?.count ?? null);

          // Fetch profile photos for trustees and patrons after loading members
          if (tabId === 'trustees' || tabId === 'patrons' || tabId === 'all') {
            const memberIds = res?.data
              .filter(member => member['Membership number'] || member.Mobile || member['S. No.'])
              .map(member => member['Membership number'] || member.Mobile || member['S. No.'])
              .filter(Boolean);

            if (memberIds && memberIds.length > 0) {
              try {
                const photosResponse = await getProfilePhotos(memberIds);
                if (photosResponse.success && photosResponse.photos) {
                  setProfilePhotos(prev => ({ ...prev, ...photosResponse.photos }));
                }
              } catch (photoErr) {
                console.error('Error fetching profile photos:', photoErr);
              }
            }
          }
        }

        // Trustees/Patrons need role-based filtering from complete dataset.
        // If we only have one paginated page, these tabs can incorrectly show "No results found".
        if ((tabId === 'trustees' || tabId === 'patrons') && totalMembersCount && allMembers.length < totalMembersCount) {
          const trustId = localStorage.getItem('selected_trust_id') || null;
          const trustName = localStorage.getItem('selected_trust_name') || null;
          const fullRes = await getAllMembers(trustId, trustName);
          const fullData = fullRes?.data || [];
          setAllMembers(fullData);
          setTotalMembersCount(fullRes?.count ?? fullData.length);
        }

        // Load member types if not loaded
        if (memberTypes.length === 0) {
          const trustId = localStorage.getItem('selected_trust_id') || null;
          const trustName = localStorage.getItem('selected_trust_name') || null;
          const typesRes = await getMemberTypes(trustId, trustName);
          setMemberTypes(typesRes?.data || []);
        }

        // Load Supabase OPD doctors when relevant
        if ((tabId === 'doctors' || tabId === 'healthcare') && supaDoctors.length === 0) {
          try {
            const trustId = localStorage.getItem('selected_trust_id') || null;
            const trustName = localStorage.getItem('selected_trust_name') || null;
            const supaRes = await getOpdDoctors(trustId, trustName);
            if (supaRes.success && Array.isArray(supaRes.data)) {
              setSupaDoctors(supaRes.data);
            }
          } catch (sErr) {
            console.error('Error loading doctors from Supabase:', sErr);
          }
        }
        loadedTabsRef.current.add(tabId);
      } else if (tabId === 'hospitals') {
        // Load hospitals only when tab is selected
        if (hospitals.length === 0) {
          const trustId = localStorage.getItem('selected_trust_id') || null;
          const trustName = localStorage.getItem('selected_trust_name') || null;
          const hospitalsRes = await getAllHospitals(trustId, trustName);
          setHospitals(hospitalsRes?.data || []);
        }
        loadedTabsRef.current.add(tabId);
      } else if (tabId === 'elected') {
        // Load elected members only when tab is selected
        if (electedMembers.length === 0) {
          const trustId = localStorage.getItem('selected_trust_id') || null;
          const trustName = localStorage.getItem('selected_trust_name') || null;
          const electedRes = await getAllElectedMembers(trustId, trustName);
          setElectedMembers(electedRes?.data || []);

          // Fetch profile photos for elected members
          const memberIds = electedRes?.data
            .filter(member => member['Membership number'] || member.Mobile || member['S. No.'] || member.membership_number_elected)
            .map(member => member['Membership number'] || member.Mobile || member['S. No.'] || member.membership_number_elected)
            .filter(Boolean);

          if (memberIds && memberIds.length > 0) {
            try {
              const photosResponse = await getProfilePhotos(memberIds);
              if (photosResponse.success && photosResponse.photos) {
                setProfilePhotos(prev => ({ ...prev, ...photosResponse.photos }));
              }
            } catch (photoErr) {
              console.error('Error fetching profile photos for elected members:', photoErr);
            }
          }
        }
        loadedTabsRef.current.add(tabId);
      } else if (tabId === 'committee') {
        // For committee tab, don't load all members - load only when user clicks on specific committee
        // We'll show unique committee names from a small batch first
        if (committeeMembers.length === 0) {
          const trustId = localStorage.getItem('selected_trust_id') || null;
          const trustName = localStorage.getItem('selected_trust_name') || null;
          // Load only first page/batch to get unique committee names quickly
          // Full members will be loaded when user clicks on a specific committee
          const committeeRes = await getAllCommitteeMembers(trustId, trustName);
          setCommitteeMembers(committeeRes?.data || []);

          // Fetch profile photos for committee members
          const memberIds = committeeRes?.data
            .filter(member => member['Membership number'] || member.Mobile || member['S. No.'] || member.member_id)
            .map(member => member['Membership number'] || member.Mobile || member['S. No.'] || member.member_id)
            .filter(Boolean);

          if (memberIds && memberIds.length > 0) {
            try {
              const photosResponse = await getProfilePhotos(memberIds);
              if (photosResponse.success && photosResponse.photos) {
                setProfilePhotos(prev => ({ ...prev, ...photosResponse.photos }));
              }
            } catch (photoErr) {
              console.error('Error fetching profile photos for committee members:', photoErr);
            }
          }
        }
        loadedTabsRef.current.add(tabId);
      } else {
        // Custom member types - load members if not loaded
        if (allMembers.length === 0) {
          const trustId = localStorage.getItem('selected_trust_id') || null;
          const trustName = localStorage.getItem('selected_trust_name') || null;
          const res = await getMembersPage(1, itemsPerPage, trustId, trustName);
          setAllMembers(res?.data || []);
          setTotalMembersCount(res?.count ?? null);

          // Fetch profile photos for trustees and patrons if this is one of those tabs
          if (tabId === 'trustees' || tabId === 'patrons' || tabId === 'all') {
            const memberIds = res?.data
              .filter(member => member['Membership number'] || member.Mobile || member['S. No.'])
              .map(member => member['Membership number'] || member.Mobile || member['S. No.'])
              .filter(Boolean);

            if (memberIds && memberIds.length > 0) {
              try {
                const photosResponse = await getProfilePhotos(memberIds);
                if (photosResponse.success && photosResponse.photos) {
                  setProfilePhotos(prev => ({ ...prev, ...photosResponse.photos }));
                }
              } catch (photoErr) {
                console.error('Error fetching profile photos:', photoErr);
              }
            }
          }
        }
        if (memberTypes.length === 0) {
          const trustId = localStorage.getItem('selected_trust_id') || null;
          const trustName = localStorage.getItem('selected_trust_name') || null;
          const typesRes = await getMemberTypes(trustId, trustName);
          setMemberTypes(typesRes?.data || []);
        }
        loadedTabsRef.current.add(tabId);
      }
    } catch (err) {
      console.error(`Error loading data for tab ${tabId}:`, err);
      setError(`Failed to load data: ${err.message || 'Please make sure backend server is running'}`);
    }
  }, [allMembers.length, hospitals.length, electedMembers.length, committeeMembers.length, memberTypes.length, totalMembersCount, itemsPerPage, getProfilePhotos, supaDoctors.length]);

  // Load minimal data on mount - only first page of members
  useEffect(() => {
    // Set dataLoaded immediately so UI shows instantly
    const timer = setTimeout(() => {
      setDataLoaded(true);
      // Load only first page of members initially
      loadTabData('healthcare');
    }, 0);

    return () => clearTimeout(timer);
  }, []); // loadTabData is now defined

  // Load data when tab changes
  useEffect(() => {
    if (dataLoaded) {
      const timer = setTimeout(() => {
        loadTabData(directoryTab);
      }, 0);

      return () => clearTimeout(timer);
    }
  }, [directoryTab, dataLoaded, loadTabData]);

  const tabs = useMemo(() => {
    // No counts in tabs - removed for faster loading
    const baseTabs = [
      { id: 'all', label: 'All', icon: Users, enabled: isDirectoryEnabled },
      { id: 'healthcare', label: 'Healthcare', icon: Stethoscope, enabled: isDirectoryEnabled && isHealthcareEnabled },
      { id: 'trustees', label: 'Trustees', icon: Star, enabled: isDirectoryEnabled },
      { id: 'patrons', label: 'Patrons', icon: Award, enabled: isDirectoryEnabled },
      { id: 'elected', label: 'Elected', icon: Star, enabled: isDirectoryEnabled && isElectedEnabled },
      { id: 'committee', label: 'Committee', icon: Users, enabled: isDirectoryEnabled && isCommitteeEnabled },
      { id: 'doctors', label: 'Doctors', icon: Stethoscope, enabled: isDirectoryEnabled && isDoctorsEnabled },
      { id: 'hospitals', label: 'Hospitals', icon: Building2, enabled: isDirectoryEnabled && isHospitalsEnabled },
    ];

    const enabledBaseTabs = baseTabs.filter((t) => t.enabled);
    const customTabs = memberTypes.filter(type =>
      !['Trustee', 'Patron', 'trustee', 'patron', 'doctor', 'medical', 'hospital', 'clinic', 'chairman', 'secretary', 'committee'].includes(type.toLowerCase())
    ).map(type => ({
      id: type.toLowerCase().replace(/\s+/g, '-'),
      label: type,
      icon: Star
    }));

    return [...enabledBaseTabs, ...customTabs];
  }, [memberTypes, featureFlags]);

  useEffect(() => {
    if (tabs.length === 0) return;
    if (!tabs.some((t) => t.id === directoryTab)) {
      setDirectoryTab(tabs[0].id);
    }
  }, [tabs, directoryTab]);

  // Function to get members based on selected tab
  const getMembersByTab = useCallback((tabId) => {
    if (tabId === 'all') {
      // Show all members
      return allMembers;
    } else if (tabId === 'healthcare') {
      // Prefer Supabase `opd_schedule` doctors when available
      if (supaDoctors && supaDoctors.length > 0) {
        return [...supaDoctors, ...hospitals];
      }

      // Fallback: Filter for healthcare professionals (excluding hospital-related entries) and include hospitals separately
      const healthcareMembers = allMembers.filter(member =>
        ((member.type && (
          member.type.toLowerCase().includes('doctor') ||
          member.type.toLowerCase().includes('medical')
        )) || member.specialization) &&
        // Exclude hospital-related entries to avoid duplication with hospitals tab
        !(member.type && (
          member.type.toLowerCase().includes('hospital') ||
          member.type.toLowerCase().includes('clinic')
        ))
      );
      return [...healthcareMembers, ...hospitals];
    } else if (tabId === 'trustees') {
      const trustees = allMembers.filter(member => {
        return isTrusteeLikeRole(member);
      });

      const electedTrustees = electedMembers.filter(elected => {
        return isTrusteeLikeRole(elected);
      });

      // Also add elected members that are not already included (in case merging failed)
      const additionalElectedTrustees = electedMembers.filter(elected => {
        // If not already in electedTrustees and not in trustees, include if it's an elected member
        const alreadyIncluded = electedTrustees.some(et =>
          (et['Membership number'] && elected['Membership number'] &&
            et['Membership number'] === elected['Membership number']) ||
          (et['S. No.'] && elected['S. No.'] && et['S. No.'] === elected['S. No.']) ||
          (et.elected_id && elected.elected_id && et.elected_id === elected.elected_id)
        );
        const inTrustees = trustees.some(t =>
          (t['Membership number'] && elected['Membership number'] &&
            t['Membership number'] === elected['Membership number']) ||
          (t['S. No.'] && elected['S. No.'] && t['S. No.'] === elected['S. No.'])
        );
        return !alreadyIncluded && !inTrustees && elected.is_elected_member;
      });

      // Combine and remove duplicates based on membership number
      const combined = [...trustees, ...electedTrustees, ...additionalElectedTrustees];
      const unique = combined.filter((item, index, self) =>
        index === self.findIndex(i =>
          (i['Membership number'] && item['Membership number'] && i['Membership number'] === item['Membership number']) ||
          (i['S. No.'] && item['S. No.'] && i['S. No.'] === item['S. No.']) ||
          (i.elected_id && item.elected_id && i.elected_id === item.elected_id)
        )
      );

      if (unique.length > 0) return unique;

      // Fallback: some trusts store leadership roles in custom text (not "trustee")
      // and we still want the Directory tab to show role-linked members.
      const roleBasedFallback = allMembers.filter((member) => normalizeRoleText(member?.role).length > 0);
      if (roleBasedFallback.length > 0) return roleBasedFallback;

      return unique;
    } else if (tabId === 'patrons') {
      const patrons = allMembers.filter(member => {
        return hasRoleKeyword(member, 'patron');
      });

      const electedPatrons = electedMembers.filter(elected => {
        return hasRoleKeyword(elected, 'patron');
      });

      // Combine and remove duplicates based on membership number
      const combined = [...patrons];
      electedPatrons.forEach(elected => {
        const exists = combined.some(p =>
          (p['Membership number'] && elected['Membership number'] &&
            p['Membership number'] === elected['Membership number']) ||
          (p['S. No.'] && elected['S. No.'] && p['S. No.'] === elected['S. No.'])
        );
        if (!exists) {
          combined.push(elected);
        }
      });

      return combined;
    } else if (tabId === 'committee') {
      // Return unique committee names instead of individual members
      const uniqueCommittees = [...new Set(committeeMembers.map(cm => cm.committee_name_english || cm.committee_name_hindi))]
        .filter(name => name && name !== 'N/A')
        .map((committeeName, index) => ({
          'S. No.': `COM${index}`,
          'Name': committeeName,
          'type': 'Committee',
          'committee_name_english': committeeMembers.find(cm => (cm.committee_name_english || cm.committee_name_hindi) === committeeName)?.committee_name_english || committeeName,
          'committee_name_hindi': committeeMembers.find(cm => (cm.committee_name_english || cm.committee_name_hindi) === committeeName)?.committee_name_hindi || committeeName,
          'is_committee_group': true
        }));
      return uniqueCommittees;
    } else if (tabId === 'doctors') {
      // Prefer Supabase `opd_schedule` doctors when available
      if (supaDoctors && supaDoctors.length > 0) return supaDoctors;

      // Fallback: Filter for doctors from members table
      return allMembers.filter(member =>
        (member.type && (
          member.type.toLowerCase().includes('doctor') ||
          member.type.toLowerCase().includes('medical')
        )) || member.specialization
      );
    } else if (tabId === 'hospitals') {
      // Return hospitals from the separate hospitals array
      return hospitals;
    } else if (tabId === 'elected') {
      // Return elected members from the separate elected_members array
      return electedMembers;
    } else {
      // For custom member types from Supabase
      const originalType = memberTypes.find(type =>
        type.toLowerCase().replace(/\s+/g, '-') === tabId
      );
      if (originalType) {
        return allMembers.filter(member =>
          member.type && member.type === originalType
        );
      }
      return [];
    }
  }, [allMembers, hospitals, committeeMembers, electedMembers, memberTypes]);

  const membersForTab = useMemo(() => getMembersByTab(directoryTab), [directoryTab, getMembersByTab]);

  // Helper function to get profile photo URL for a member
  const getProfilePhoto = (member) => {
    if (!member) return null;

    // Try to match by membership number first
    if (member['Membership number'] && profilePhotos[member['Membership number']]) {
      return profilePhotos[member['Membership number']];
    }

    // Then try mobile number
    if (member.Mobile && profilePhotos[member.Mobile]) {
      return profilePhotos[member.Mobile];
    }

    // Then try S. No.
    if (member['S. No.'] && profilePhotos[member['S. No.']]) {
      return profilePhotos[member['S. No.']];
    }

    // Try with user_identifier if available
    if (member.user_identifier && profilePhotos[member.user_identifier]) {
      return profilePhotos[member.user_identifier];
    }

    return null;
  };

  const filteredMembers = useMemo(() => {
    const q = (searchQuery || '').trim().toLowerCase();

    // If we have search query and we're in a relevant tab, fetch profile photos for matching members
    if (q && ['trustees', 'patrons', 'elected', 'all'].includes(directoryTab)) {
      const matchingMembers = membersForTab.filter(item => {
        try {
          return (
            (item.Name && item.Name.toLowerCase().includes(q)) ||
            (item.hospital_name && item.hospital_name.toLowerCase().includes(q)) ||
            (item['Company Name'] && item['Company Name'].toLowerCase().includes(q)) ||
            (item.trust_name && item.trust_name.toLowerCase().includes(q)) ||
            (item.type && item.type.toLowerCase().includes(q)) ||
            (item.hospital_type && item.hospital_type.toLowerCase().includes(q)) ||
            (item.city && item.city.toLowerCase().includes(q)) ||
            (item.address && item.address.toLowerCase().includes(q)) ||
            (item['Membership number'] && item['Membership number'].toLowerCase().includes(q)) ||
            (item.position && item.position.toLowerCase().includes(q)) ||
            (item.location && item.location.toLowerCase().includes(q)) ||
            (item.member_id && item.member_id.toLowerCase().includes(q)) ||
            (item.Mobile && item.Mobile.toLowerCase().includes(q)) ||
            (item.Mobile2 && item.Mobile2.toLowerCase().includes(q))
          );
        } catch {
          return false;
        }
      });

      // Fetch profile photos for matching members that don't have them loaded
      const memberIds = matchingMembers
        .filter(member => member['Membership number'] || member.Mobile || member['S. No.'] || member.membership_number_elected)
        .map(member => member['Membership number'] || member.Mobile || member['S. No.'] || member.membership_number_elected)
        .filter(Boolean);

      if (memberIds && memberIds.length > 0) {
        // Filter out members that already have photos loaded
        const idsWithoutPhotos = memberIds.filter(id => !profilePhotos[id]);

        if (idsWithoutPhotos.length > 0) {
          // Fetch photos for members that don't have them loaded
          getProfilePhotos(idsWithoutPhotos)
            .then(photosResponse => {
              if (photosResponse.success && photosResponse.photos) {
                setProfilePhotos(prev => ({ ...prev, ...photosResponse.photos }));
              }
            })
            .catch(photoErr => {
              console.error('Error fetching profile photos for search results:', photoErr);
            });
        }
      }

      return sortMembersByMembershipNumber(matchingMembers);
    }

    // If no search query, return all members for the tab
    return sortMembersByMembershipNumber(membersForTab);
  }, [membersForTab, searchQuery, directoryTab, profilePhotos]);

  // Pagination calculations
  const totalPages = Math.ceil(filteredMembers.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const currentPageMembers = useMemo(() => filteredMembers.slice(startIndex, endIndex), [filteredMembers, startIndex, endIndex]);

  // Load more members (next page) and append to `allMembers` - no loading indicator
  const loadMoreMembers = async () => {
    try {
      const nextPage = (Math.ceil(allMembers.length / itemsPerPage) || 1) + 1;
      const trustId = localStorage.getItem('selected_trust_id') || null;
      const trustName = localStorage.getItem('selected_trust_name') || null;
      const res = await getMembersPage(nextPage, itemsPerPage, trustId, trustName);
      const newMembers = res.data || [];

      // Fetch profile photos for new members if in relevant tabs
      if (['trustees', 'patrons', 'elected'].includes(directoryTab)) {
        const memberIds = newMembers
          .filter(member => member['Membership number'] || member.Mobile || member['S. No.'] || member.membership_number_elected)
          .map(member => member['Membership number'] || member.Mobile || member['S. No.'] || member.membership_number_elected)
          .filter(Boolean);

        if (memberIds && memberIds.length > 0) {
          try {
            const photosResponse = await getProfilePhotos(memberIds);
            if (photosResponse.success && photosResponse.photos) {
              setProfilePhotos(prev => ({ ...prev, ...photosResponse.photos }));
            }
          } catch (photoErr) {
            console.error('Error fetching profile photos for new members:', photoErr);
          }
        }
      }

      setAllMembers(prev => [...prev, ...newMembers]);
      if (res.count != null) setTotalMembersCount(res.count);
      setCurrentPage(1);
    } catch (e) {
      console.error('Error loading more members:', e);
    }
  };

  // Ref for the content area to scroll to
  const contentRef = useRef(null);
  const searchTimeoutRef = useRef(null);

  // Reset to page 1 when tab or search changes
  useEffect(() => {
    const timer = setTimeout(() => {
      setCurrentPage(1);
    }, 0);

    // Scroll to the content area when tab changes
    if (contentRef.current) {
      contentRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    return () => clearTimeout(timer);
  }, [directoryTab, searchQuery]);

  // Clear debounce timer on unmount
  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, []);

  const containerRef = useRef(null);

  // Scroll to top of container when component mounts
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, []);

  if (!isFeatureEnabled('feature_directory')) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6" style={{ background: 'var(--page-bg, var(--app-page-bg))' }}>
        <div className="text-center max-w-sm">
          <div className="h-16 w-16 rounded-full flex items-center justify-center mx-auto mb-4" style={{ background: 'color-mix(in srgb, var(--surface-color) 76%, var(--app-accent-bg))' }}>
            <Users className="h-7 w-7" style={{ color: 'color-mix(in srgb, var(--body-text-color) 42%, var(--surface-color))' }} />
          </div>
          <h2 className="text-lg font-bold" style={{ color: 'var(--heading-color)' }}>Directory is disabled</h2>
          <p className="text-sm mt-2" style={{ color: 'color-mix(in srgb, var(--body-text-color) 65%, var(--surface-color))' }}>This feature is currently turned off by admin.</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`min-h-screen pb-10 relative${isMenuOpen ? ' overflow-hidden max-h-screen' : ''}`}
      ref={containerRef}
      style={{ background: 'var(--page-bg, var(--app-page-bg))' }}
    >
      {/* Navbar - Brand theme */}
      <div
        className="px-4 py-4 flex items-center justify-between sticky top-0 z-50 shadow-md transition-all duration-300 pointer-events-auto"
        style={{
          background: navbarTheme?.backgroundStyle || 'var(--navbar-bg, var(--app-navbar-bg))',
          backdropFilter: `blur(${navbarTheme?.blurPx || '12px'})`,
          WebkitBackdropFilter: `blur(${navbarTheme?.blurPx || '12px'})`,
          borderBottom: '1px solid var(--navbar-border)',
          paddingTop: "max(env(safe-area-inset-top, 0px), 16px)"
        }}
      >
        <button
          onClick={() => setIsMenuOpen(!isMenuOpen)}
          className="p-2 rounded-xl transition-colors pointer-events-auto"
          style={{ color: navbarTextColor, background: 'transparent' }}
        >
          {isMenuOpen ? <X className="h-6 w-6" style={{ color: navbarTextColor }} /> : <Menu className="h-6 w-6" style={{ color: navbarTextColor }} />}
        </button>
        <h1 className="text-base font-bold tracking-wide" style={{ color: navbarTextColor }}>Directory</h1>
        <div className="flex items-center gap-1">
          <button
            onClick={() => onNavigate('home')}
            className="p-2 rounded-xl transition-colors flex items-center justify-center"
            style={{ color: navbarTextColor, background: 'transparent' }}
          >
            <HomeIcon className="h-5 w-5" style={{ color: navbarTextColor }} />
          </button>
        </div>
      </div>

      {error && (
        <div className="px-6 py-4">
          <div className="rounded-xl p-4 text-center" style={{ background: 'var(--brand-red-light)', border: '1px solid color-mix(in srgb, var(--brand-red) 18%, transparent)' }}>
            <p className="font-medium" style={{ color: 'var(--brand-red-dark)' }}>{error}</p>
            <button
              onClick={() => {
                setError(null);
                loadTabData(directoryTab);
              }}
              className="mt-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              style={{ background: 'linear-gradient(135deg, var(--brand-red) 0%, var(--brand-navy) 100%)', color: 'var(--surface-color)' }}
            >
              Retry
            </button>
          </div>
        </div>
      )}

      {/* No loading indicator - UI shows immediately */}

      <Sidebar
        isOpen={isMenuOpen}
        onClose={() => setIsMenuOpen(false)}
        onNavigate={onNavigate}
        currentPage="directory"
      />

      {/* Header Section - Brand gradient */}
      <div
        className="px-5 pt-6 pb-10"
        style={{ background: 'linear-gradient(160deg, var(--brand-navy-light) 0%, color-mix(in srgb, var(--brand-red-light) 68%, var(--surface-color)) 60%, var(--surface-color) 100%)' }}
      >
        <div className="flex items-center gap-4">
          <div
            className="h-14 w-14 rounded-2xl flex items-center justify-center shadow-md overflow-hidden flex-shrink-0"
            style={{ background: 'linear-gradient(135deg, var(--brand-red) 0%, var(--brand-navy) 100%)' }}
          >
            <img
              src={import.meta.env.VITE_LOGO_URL || '/src/assets/logo.png'}
              alt="Logo"
              className="h-14 w-14 object-contain"
              onError={(e) => { e.target.onerror = null; e.target.style.display = 'none'; }}
            />
          </div>
          <div>
            <h1 className="text-xl font-extrabold leading-tight" style={{ color: 'var(--brand-navy)' }}>
              {directoryTab === 'healthcare' ? 'Healthcare Directory' :
                directoryTab === 'doctors' ? 'Doctor Directory' :
                  directoryTab === 'hospitals' ? 'Hospital Directory' :
                    directoryTab === 'trustees' ? 'Trustee Directory' :
                      directoryTab === 'patrons' ? 'Patron Directory' :
                        directoryTab === 'committee' ? 'Committee Directory' :
                          directoryTab === 'elected' ? 'Elected Members' :
                            'Directory'}
            </h1>
            <p className="text-xs font-semibold mt-0.5" style={{ color: 'var(--brand-red)' }}>
              {directoryTab === 'healthcare' ? 'Find Doctors & Hospitals' :
                directoryTab === 'doctors' ? 'Find Healthcare Professionals' :
                  directoryTab === 'hospitals' ? 'Find Hospitals & Clinics' :
                    directoryTab === 'trustees' ? 'Find Trustees' :
                      directoryTab === 'patrons' ? 'Find Patrons' :
                        directoryTab === 'committee' ? 'Find Committee Members' :
                          directoryTab === 'elected' ? 'Find Elected Members' :
                            'Find Members'}
            </p>
          </div>
        </div>
      </div>

      {/* Search Section - Brand styled */}
      <div className="px-5 -mt-5">
        <div
          className="rounded-2xl p-2.5 flex items-center gap-3 shadow-md transition-all focus-within:shadow-lg"
          style={{ background: 'var(--surface-color)', border: '2px solid var(--brand-navy-light)' }}
        >
          <div className="p-2 rounded-xl ml-1" style={{ background: 'var(--brand-navy-light)' }}>
            <Search className="h-5 w-5" style={{ color: 'var(--brand-navy)' }} />
          </div>
          <input
            type="text"
            placeholder={`Name, Membership No., Mobile - ${directoryTab === 'healthcare' ? 'Healthcare' :
              directoryTab === 'doctors' ? 'Doctors' :
                directoryTab === 'hospitals' ? 'Hospitals' :
                  directoryTab === 'trustees' ? 'Trustees' :
                    directoryTab === 'patrons' ? 'Patrons' :
                      directoryTab === 'committee' ? 'Committee' :
                        directoryTab === 'elected' ? 'Elected Members' :
                          'All'} directory...`}
            value={searchQuery}
            onChange={(e) => {
              const val = e.target.value;
              if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
              searchTimeoutRef.current = setTimeout(() => setSearchQuery(val), 250);
            }}
            className="flex-1 bg-transparent border-none focus:ring-0 font-semibold text-sm py-2"
            style={{ color: 'var(--body-text-color)' }}
          />
          {searchQuery ? (
            <button
              onClick={() => {
                if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
                setSearchQuery('');
              }}
              className="h-8 w-8 rounded-lg flex items-center justify-center transition-colors"
              style={{ color: 'color-mix(in srgb, var(--body-text-color) 55%, var(--surface-color))' }}
              aria-label="Clear search"
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </div>
      </div>

      {/* Tabs - Brand Pill Style */}
      <div className="px-5 mt-5">
        <div className="flex gap-2 overflow-x-auto pb-3 no-scrollbar">
          {tabs.map((tab) => {
            const isActive = directoryTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setDirectoryTab(tab.id)}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold whitespace-nowrap transition-all text-xs"
                style={isActive
                  ? { background: 'linear-gradient(135deg, var(--brand-red) 0%, var(--brand-navy) 100%)', color: 'var(--surface-color)', boxShadow: '0 4px 12px color-mix(in srgb, var(--brand-red) 25%, transparent)' }
                  : { background: 'var(--surface-color)', color: 'var(--brand-navy)', border: '1.5px solid var(--brand-navy-light)' }
                }
              >
                <tab.icon className="h-4 w-4" style={{ color: isActive ? 'var(--surface-color)' : 'var(--brand-red)' }} />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>


      {/* Content List - Brand Cards */}
      <div className="px-5 mt-4 space-y-3" ref={contentRef}>
        {currentPageMembers.length > 0 ? (
          currentPageMembers.map((item) => (
            <div
              key={item['S. No.'] || item.id || item['Membership number'] || `member-${item.Name || 'unknown'}`}
              className="rounded-2xl p-4 flex items-center gap-4 group cursor-pointer active:scale-[0.98] transition-all duration-200"
              style={{ background: 'var(--surface-color)', boxShadow: '0 2px 12px color-mix(in srgb, var(--brand-navy) 7%, transparent)', border: '1px solid color-mix(in srgb, var(--brand-navy) 8%, transparent)' }}
              onClick={() => {
                // Check if this is a committee group (committee name)
                if (item.is_committee_group) {
                  // Load full committee members if not already loaded, then navigate
                  const loadAndNavigate = async () => {
                    let membersToUse = committeeMembers;

                    // If committee members not fully loaded, load them now
                    if (committeeMembers.length === 0 ||
                      !committeeMembers.some(cm =>
                        (cm.committee_name_hindi === item.Name || cm.committee_name_english === item.Name)
                      )) {
                      try {
                        const trustId = localStorage.getItem('selected_trust_id') || null;
                        const trustName = localStorage.getItem('selected_trust_name') || null;
                        const committeeRes = await getAllCommitteeMembers(trustId, trustName);
                        membersToUse = committeeRes?.data || [];
                        setCommitteeMembers(membersToUse);
                      } catch (err) {
                        console.error('Error loading committee members:', err);
                      }
                    }

                    // Filter members for this specific committee
                    const filteredCommitteeMembers = membersToUse.filter(cm =>
                      cm.committee_name_hindi === item.Name ||
                      cm.committee_name_english === item.Name ||
                      cm['Company Name'] === item.Name
                    );

                    const committeeData = {
                      'Name': item.Name,
                      'type': 'Committee',
                      'committee_members': filteredCommitteeMembers,
                      'committee_name_hindi': item.committee_name_hindi || item.Name,
                      'committee_name_english': item.committee_name_english || item.Name,
                      'is_committee_group': true
                    };

                    // Add the current tab name for back button
                    committeeData.previousScreenName = directoryTab;

                    onNavigate('committee-members', committeeData);
                  };

                  loadAndNavigate();
                } else {
                  // Determine if this is a healthcare member (from opd_schedule)
                  const isHealthcareMember = !!item.consultant_name ||
                    (item.original_id && item.original_id.toString().startsWith('DOC')) ||
                    (item['S. No.'] && item['S. No.'].toString().startsWith('DOC'));

                  // Determine if this is a hospital member (from hospitals table)
                  const isHospitalMember = !!item.is_hospital ||
                    (item.original_id && item.original_id.toString().startsWith('HOSP')) ||
                    (item['S. No.'] && item['S. No.'].toString().startsWith('HOSP'));

                  // Determine if this is an elected member (from elected_members table)
                  const isElectedMember = !!item.is_elected_member ||
                    (item.elected_id !== undefined && item.elected_id !== null) ||
                    (item.original_id && item.original_id.toString().startsWith('ELECT')) ||
                    (item['S. No.'] && item['S. No.'].toString().startsWith('ELECT'));

                  // Create member data based on the source
                  const memberData = {
                    'S. No.': item['S. No.'] || item.original_id || `MEM${Math.floor(Math.random() * 10000)}`,
                    'Name': item.Name || item.hospital_name || 'N/A',
                    'Mobile': item.Mobile || item.contact_phone || 'N/A',
                    'Email': item.Email || item.contact_email || 'N/A',
                    'type': item.type || item.Type || 'N/A',
                    'Membership number': item['Membership number'] || item.membership_number || 'N/A',
                    'isHealthcareMember': isHealthcareMember,
                    'isHospitalMember': isHospitalMember,
                    'isElectedMember': isElectedMember
                  };

                  // Add Members Table fields if NOT a healthcare member and NOT a hospital member
                  // OR if it's an elected member (since elected members are merged with Members Table)
                  if ((!isHealthcareMember && !isHospitalMember) || isElectedMember) {
                    if (item['Company Name']) memberData['Company Name'] = item['Company Name'];
                    if (item['Address Home']) memberData['Address Home'] = item['Address Home'];
                    if (item['Address Office']) memberData['Address Office'] = item['Address Office'];
                    if (item['Resident Landline']) memberData['Resident Landline'] = item['Resident Landline'];
                    if (item['Office Landline']) memberData['Office Landline'] = item['Office Landline'];
                  }

                  // Add hospital-specific fields (from hospitals table) only if it's a hospital member
                  if (isHospitalMember) {
                    memberData.hospital_name = item.hospital_name || 'N/A';
                    memberData.trust_name = item.trust_name || 'N/A';
                    memberData.hospital_type = item.hospital_type || 'N/A';
                    memberData.address = item.address || 'N/A';
                    memberData.city = item.city || 'N/A';
                    memberData.state = item.state || 'N/A';
                    memberData.pincode = item.pincode || 'N/A';
                    memberData.established_year = item.established_year || 'N/A';
                    memberData.bed_strength = item.bed_strength || 'N/A';
                    memberData.accreditation = item.accreditation || 'N/A';
                    memberData.facilities = item.facilities || 'N/A';
                    memberData.departments = item.departments || 'N/A';
                    memberData.contact_phone = item.contact_phone || 'N/A';
                    memberData.contact_email = item.contact_email || 'N/A';
                    memberData.is_active = item.is_active || 'N/A';
                    memberData.id = item.original_id || null;
                  }

                  // Add healthcare-specific fields (from opd_schedule) only if it's a healthcare member
                  if (isHealthcareMember) {
                    memberData.department = item.department || 'N/A';
                    memberData.designation = item.designation || item.specialization || 'N/A';
                    memberData.qualification = item.qualification || 'N/A';
                    memberData.senior_junior = item.senior_junior || 'N/A';
                    memberData.unit = item.unit || 'N/A';
                    memberData.general_opd_days = item.general_opd_days || 'N/A';
                    memberData.private_opd_days = item.private_opd_days || 'N/A';
                    memberData.unit_notes = item.unit_notes || 'N/A';
                    memberData.consultant_name = item.consultant_name || item.Name || 'N/A';
                    memberData.notes = item.notes || item.unit_notes || 'N/A';
                    memberData.id = item.id || item.original_id || null;
                  }

                  // Add elected members-specific fields (from elected_members table) only if it's an elected member
                  if (isElectedMember) {
                    // Elected-specific fields from elected_members table
                    memberData.position = item.position || 'N/A';
                    memberData.location = item.location || 'N/A';
                    memberData.elected_id = item.elected_id || item.original_id || null;
                    memberData.membership_number_elected = item.membership_number || item['Membership number'] || 'N/A';
                    memberData.created_at = item.created_at || 'N/A';
                    memberData.is_merged_with_member = item.is_merged_with_member || false;
                    // Note: name, mobile, email, address fields already come from merged Members Table data
                  }

                  // Add the current tab name for back button
                  memberData.previousScreenName = directoryTab;

                  // Store the current directory tab in sessionStorage to restore when coming back
                  sessionStorage.setItem('restoreDirectoryTab', directoryTab);

                  onNavigate('member-details', memberData);
                }
              }}
            >
              {/* Avatar */}
              <div
                className="h-14 w-14 rounded-xl flex items-center justify-center overflow-hidden flex-shrink-0"
                style={{ background: 'linear-gradient(135deg, var(--brand-navy-light) 0%, color-mix(in srgb, var(--brand-navy-light) 72%, var(--surface-color)) 100%)', border: '1.5px solid color-mix(in srgb, var(--brand-navy) 12%, transparent)' }}
              >
                {item.doctor_image_url ? (
                  <img
                    src={item.doctor_image_url}
                    alt={item.consultant_name || item.Name || 'Doctor'}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      e.target.onerror = null;
                      e.target.style.display = 'none';
                    }}
                  />
                ) : (() => {
                  const memberId = item['Membership number'] || item.Mobile || item['S. No.'] || item.membership_number_elected;
                  const profilePhoto = profilePhotos[memberId];
                  if (profilePhoto) {
                    return (
                      <img
                        src={profilePhoto}
                        alt={item.Name || 'Member'}
                        className="w-full h-full object-cover"
                        onError={(e) => { e.target.onerror = null; e.target.style.display = 'none'; }}
                      />
                    );
                  } else if (directoryTab === 'hospitals') {
                    return <Building2 className="h-7 w-7" style={{ color: 'var(--brand-navy)' }} />;
                  } else if (directoryTab === 'healthcare' || directoryTab === 'doctors') {
                    return <Stethoscope className="h-7 w-7" style={{ color: 'var(--brand-navy)' }} />;
                  } else {
                    return <User className="h-7 w-7" style={{ color: 'var(--brand-navy)' }} />;
                  }
                })()}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-start gap-2">
                  <div className="min-w-0">
                    <h3 className="font-bold text-sm leading-tight" style={{ color: 'var(--heading-color)' }}>
                      {item.consultant_name || item.Name || item.hospital_name || ''}
                    </h3>
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      {item['Membership number'] && item['Membership number'] !== 'N/A' && (
                        <p className="text-xs font-medium" style={{ color: 'color-mix(in srgb, var(--body-text-color) 60%, var(--surface-color))' }}>{item['Membership number']}</p>
                      )}
                      {(item.position || item.member_role || item.type || item['Company Name']) &&
                        (item.position || item.member_role || item.type || item['Company Name']) !== 'N/A' && (
                          <span
                            className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full inline-block"
                            style={{ background: 'var(--brand-navy-light)', color: 'var(--brand-navy)' }}
                          >
                            {item.position || item.member_role || item.type || item['Company Name']}
                          </span>
                        )}
                      {item.location && item.location !== 'N/A' && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full inline-flex items-center gap-1" style={{ background: 'color-mix(in srgb, var(--brand-red-light) 34%, var(--surface-color))', color: 'var(--brand-red-dark)' }}>
                          ðŸ“ {item.location}
                        </span>
                      )}
                      {(item.hospital_type || item.trust_name) &&
                        (item.hospital_type || item.trust_name) !== 'N/A' && (
                          <span className="text-[10px]" style={{ color: 'color-mix(in srgb, var(--body-text-color) 60%, var(--surface-color))' }}>{item.hospital_type || item.trust_name}</span>
                        )}
                      {item.city && item.city !== 'N/A' && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full inline-flex items-center gap-1" style={{ background: 'color-mix(in srgb, var(--brand-red-light) 34%, var(--surface-color))', color: 'var(--brand-red-dark)' }}>
                          ðŸ“ {item.city}{item.state && item.state !== 'N/A' ? `, ${item.state}` : ''}
                        </span>
                      )}
                    </div>
                  </div>
                  <div
                    className="h-7 w-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
                    style={{ background: 'var(--brand-navy-light)' }}
                  >
                    <ChevronRight className="h-4 w-4" style={{ color: 'var(--brand-navy)' }} />
                  </div>
                </div>

                <div className="flex items-center gap-2 mt-3 flex-wrap">
                  {item.Mobile && item.Mobile !== 'N/A' && (
                    <a
                      href={`tel:${item.Mobile.replace(/\s+/g, '').split(',')[0]}`}
                      onClick={(e) => e.stopPropagation()}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                      style={{ background: 'var(--brand-red-light)', color: 'var(--brand-red-dark)', border: '1px solid color-mix(in srgb, var(--brand-red) 15%, transparent)' }}
                    >
                      <Phone className="h-3 w-3" />Call
                    </a>
                  )}
                  {item.Email && item.Email.trim() && item.Email !== 'N/A' && (
                    <a
                      href={`mailto:${item.Email.trim()}`}
                      onClick={(e) => e.stopPropagation()}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                      style={{ background: 'var(--brand-navy-light)', color: 'var(--brand-navy)', border: '1.5px solid color-mix(in srgb, var(--brand-navy) 12%, transparent)' }}
                    >
                      <Mail className="h-3 w-3" />Email
                    </a>
                  )}
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="text-center py-20">
            <div
              className="h-20 w-20 rounded-full flex items-center justify-center mx-auto mb-4"
              style={{ background: 'var(--brand-navy-light)', border: '2px dashed color-mix(in srgb, var(--brand-navy) 20%, transparent)' }}
            >
              <Search className="h-8 w-8" style={{ color: 'var(--brand-navy)' }} />
            </div>
            <h3 className="font-bold" style={{ color: 'var(--heading-color)' }}>No results found</h3>
            <p className="text-sm mt-1" style={{ color: 'color-mix(in srgb, var(--body-text-color) 60%, var(--surface-color))' }}>Try searching with a different keyword</p>
          </div>
        )}
      </div>

      {/* Load more button */}
      {totalMembersCount != null && allMembers.length < totalMembersCount && (
        <div className="px-5 mt-4 mb-6 flex justify-center">
          <button
            onClick={loadMoreMembers}
            className="px-6 py-2.5 rounded-xl font-bold text-sm transition-all active:scale-95"
            style={{ background: 'linear-gradient(135deg, var(--brand-red) 0%, var(--brand-navy) 100%)', boxShadow: '0 4px 12px color-mix(in srgb, var(--brand-red) 25%, transparent)', color: 'var(--surface-color)' }}
          >
            Load more
          </button>
        </div>
      )}

      {/* Pagination Controls - Brand Design */}
      {filteredMembers.length > itemsPerPage && (
        <div className="px-5 mt-5 mb-4">
          <div className="rounded-2xl px-3 py-3" style={{ background: 'linear-gradient(135deg, var(--brand-navy-light) 0%, var(--brand-red-light) 100%)', border: '1px solid color-mix(in srgb, var(--brand-navy) 10%, transparent)' }}>
            <div className="flex items-center justify-between gap-2">
              <button
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
                className={`flex-shrink-0 px-3 py-2 rounded-xl text-xs font-bold transition-all ${currentPage === 1 ? 'cursor-not-allowed' : 'active:scale-95'}`}
                style={currentPage === 1
                  ? { background: 'color-mix(in srgb, var(--surface-color) 76%, var(--app-accent-bg))', color: 'color-mix(in srgb, var(--body-text-color) 35%, var(--surface-color))' }
                  : { background: 'var(--surface-color)', color: 'var(--brand-navy)', border: '1px solid var(--brand-navy-light)' }}
              >
                â† Prev
              </button>
              <div className="flex items-center gap-1">
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  let pageNum;
                  if (totalPages <= 5) { pageNum = i + 1; }
                  else if (currentPage <= 3) { pageNum = i + 1; }
                  else if (currentPage >= totalPages - 2) { pageNum = totalPages - 4 + i; }
                  else { pageNum = currentPage - 2 + i; }
                  return (
                    <button
                      key={pageNum}
                      onClick={() => setCurrentPage(pageNum)}
                      className="w-9 h-9 rounded-xl font-bold text-sm transition-all"
                      style={currentPage === pageNum
                        ? { background: 'linear-gradient(135deg, var(--brand-red) 0%, var(--brand-navy) 100%)', color: 'var(--surface-color)', boxShadow: '0 4px 12px color-mix(in srgb, var(--brand-red) 25%, transparent)' }
                        : { background: 'var(--surface-color)', color: 'var(--brand-navy)', border: '1.5px solid var(--brand-navy-light)' }
                      }
                    >{pageNum}</button>
                  );
                })}
              </div>
              <span className="text-[11px] font-semibold whitespace-nowrap" style={{ color: 'var(--brand-navy)' }}>
                {startIndex + 1}â€“{Math.min(endIndex, filteredMembers.length)} / {filteredMembers.length}
              </span>
              <button
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                disabled={currentPage === totalPages}
                className={`flex-shrink-0 px-3 py-2 rounded-xl text-xs font-bold transition-all ${currentPage === totalPages ? 'cursor-not-allowed' : 'active:scale-95'}`}
                style={currentPage === totalPages
                  ? { background: 'color-mix(in srgb, var(--surface-color) 76%, var(--app-accent-bg))', color: 'color-mix(in srgb, var(--body-text-color) 35%, var(--surface-color))' }
                  : { background: 'var(--surface-color)', color: 'var(--brand-navy)', border: '1px solid var(--brand-navy-light)' }}
              >
                Next â†’
              </button>
            </div>
          </div>
        </div>
      )}


      {/* Extra Space for Bottom Nav */}
      <div className="h-10"></div>
    </div>
  );
};

export default Directory;
