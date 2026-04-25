import express from 'express';
import multer from 'multer';
import { supabase } from '../config/supabase.js';

const router = express.Router();
const PROFILE_PHOTO_BUCKET = 'profile_photo';

// Configure multer for memory storage
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit for profile pictures
  fileFilter: (req, file, cb) => {
    
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);

    } else {
      cb(new Error('Invalid file type. Only JPG, PNG, WEBP allowed.'));
    }
  }
});

const normalizeDigits = (value) => String(value || '').replace(/\D/g, '');
const isUuid = (value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || '').trim());
const readMemberValue = (member, keys = []) => {
  for (const key of keys) {
    const value = member?.[key];
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      return value;
    }
  }
  return '';
};

const sanitizeMemberUpdateValue = (value) => {
  if (value === undefined || value === null) return null;
  const trimmed = String(value).trim();
  return trimmed === '' ? null : trimmed;
};

const resolveMemberContext = async ({ userIdHeader, membersIdHeader, trustIdHeader, profileData = null }) => {
  const identifiers = [
    userIdHeader,
    membersIdHeader,
    profileData?.memberId,
    profileData?.mobile
  ].filter(Boolean).map((v) => String(v).trim());

  let member = null;

  // 1) Direct by members_id (most reliable)
  for (const candidate of [membersIdHeader, userIdHeader, profileData?.members_id, profileData?.id]) {
    if (!candidate) continue;
    if (!isUuid(candidate)) continue;
    const { data } = await supabase
      .from('Members')
      .select('*')
      .eq('members_id', String(candidate).trim())
      .maybeSingle();
    if (data?.members_id) {
      member = data;
      break;
    }
  }

  // 2) By membership number in Members table
  if (!member) {
    for (const candidate of identifiers) {
      const { data } = await supabase
        .from('Members')
        .select('*')
        .eq('Membership number', candidate)
        .maybeSingle();
      if (data?.members_id) {
        member = data;
        break;
      }
    }
  }

  // 3) By mobile in Members table (handle formatting differences)
  if (!member) {
    const digits = Array.from(new Set(identifiers.map(normalizeDigits).filter(Boolean)));
    for (const d of digits) {
      const variants = Array.from(new Set([d, d.slice(-10), `+91${d.slice(-10)}`].filter(Boolean)));
      for (const variant of variants) {
        const { data } = await supabase
          .from('Members')
          .select('*')
          .eq('Mobile', variant)
          .maybeSingle();
        if (data?.members_id) {
          member = data;
          break;
        }
      }
      if (member) break;
    }
  }

  // 4) If still not found, resolve via reg_members membership and then fetch Members by members_id
  if (!member) {
    for (const candidate of identifiers) {
      let regQuery = supabase
        .from('reg_members')
        .select('members_id')
        .eq('Membership number', candidate)
        .limit(1);
      if (trustIdHeader) {
        regQuery = regQuery.eq('trust_id', trustIdHeader);
      }
      const { data: regByMembership } = await regQuery;
      const resolvedMembersId = regByMembership?.[0]?.members_id;
      if (!resolvedMembersId) continue;
      const { data } = await supabase
        .from('Members')
        .select('*')
        .eq('members_id', resolvedMembersId)
        .maybeSingle();
      if (data?.members_id) {
        member = data;
        break;
      }
    }
  }

  if (!member?.members_id) {
    const mobileDigits = normalizeDigits(profileData?.mobile || userIdHeader);
    if (mobileDigits && mobileDigits.length >= 10) {
      const normalizedMobile = mobileDigits.slice(-10);
      // Last-resort fallback: create/find minimal Members row so profile can be saved.
      const { data: insertedMember, error: insertErr } = await supabase
        .from('Members')
        .insert({ Mobile: normalizedMobile })
        .select('*')
        .maybeSingle();
      if (!insertErr && insertedMember?.members_id) {
        member = insertedMember;
      } else {
        const { data: existingByMobile } = await supabase
          .from('Members')
          .select('*')
          .eq('Mobile', normalizedMobile)
          .limit(1);
        if (existingByMobile?.[0]?.members_id) {
          member = existingByMobile[0];
        }
      }
    }
  }

  if (!member?.members_id) {
    return { member: null, activeMembership: null };
  }

  let membershipQuery = supabase
    .from('reg_members')
    .select('id, trust_id, role, is_active, joined_date, "Membership number"')
    .eq('members_id', member.members_id)
    .order('joined_date', { ascending: false });

  if (trustIdHeader) {
    membershipQuery = membershipQuery.eq('trust_id', trustIdHeader);
  }

  const { data: memberships } = await membershipQuery;
  const activeMembership =
    (memberships || []).find((m) => m?.is_active === true) ||
    (memberships || [])[0] ||
    null;

  return { member, activeMembership };
};

// Get user profile
router.get('/', async (req, res) => {
  try {
    const userIdHeader = req.headers['user-id'];
    const membersIdHeader = req.headers['members-id'];
    const trustIdHeader = req.headers['trust-id'];
    if (!userIdHeader) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const { member, activeMembership } = await resolveMemberContext({
      userIdHeader,
      membersIdHeader,
      trustIdHeader
    });

    if (!member?.members_id) {
      return res.json({ success: true, profile: null });
    }

    const membersId = member.members_id;

    const { data: profile, error: profileErr } = await supabase
      .from('member_profiles')
      .select('*')
      .eq('members_id', membersId)
      .maybeSingle();

    if (profileErr) {
      console.error('Fetch member_profiles error:', profileErr);
      return res.status(500).json({ success: false, message: 'Failed to fetch profile' });
    }

    const mergedProfile = {
      name: readMemberValue(member, ['Name', 'name', 'Full Name', 'full_name']),
      role: activeMembership?.role || member?.role || member?.Role || 'Trustee',
      memberId: activeMembership?.['Membership number'] || member?.['Membership number'] || '',
      mobile: readMemberValue(member, ['Mobile', 'mobile']),
      email: readMemberValue(member, ['Email', 'email']),
      address_home: member?.['Address Home'] || '',
      address_office: member?.['Address Office'] || '',
      company_name: member?.['Company Name'] || '',
      resident_landline: member?.['Resident Landline'] || '',
      office_landline: member?.['Office Landline'] || '',
      gender: profile?.gender || '',
      marital_status: profile?.marital_status || '',
      nationality: profile?.nationality || '',
      aadhaar_id: profile?.aadhaar_id || '',
      blood_group: profile?.blood_group || '',
      dob: profile?.date_of_birth || '',
      emergency_contact_name: profile?.emergency_contact_name || '',
      emergency_contact_number: profile?.emergency_contact_number || '',
      profile_photo_url: profile?.profile_photo_url || '',
      spouse_name: profile?.spouse_name || '',
      spouse_contact_number: profile?.spouse_contact || '',
      children_count: profile?.no_of_children ?? '',
      facebook: profile?.facebook || '',
      twitter: profile?.twitter || '',
      instagram: profile?.instagram || '',
      linkedin: profile?.linkedin || '',
      whatsapp: profile?.whatsapp || '',
      members_id: membersId
    };

    res.json({
      success: true,
      profile: mergedProfile
    });

  } catch (error) {
    console.error('Fetch error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// Save/Update user profile
router.post('/save', upload.single('profilePhoto'), async (req, res) => {
  try {
    const userIdHeader = req.headers['user-id'];
    const membersIdHeader = req.headers['members-id'];
    const trustIdHeader = req.headers['trust-id'];
    if (!userIdHeader) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const profileData = JSON.parse(req.body.profileData || '{}');
    const profilePhotoFile = req.file;

    let profilePhotoUrl = profileData.profilePhotoUrl || profileData.profile_photo_url || '';

    const { member, activeMembership } = await resolveMemberContext({
      userIdHeader,
      membersIdHeader,
      trustIdHeader,
      profileData
    });

    if (!member?.members_id) {
      return res.status(404).json({ success: false, message: 'Member not found' });
    }

    const membersId = member.members_id;

    // Upload profile picture if provided
    if (profilePhotoFile) {
      const safeOriginalName = String(profilePhotoFile.originalname || 'profile_photo')
        .replace(/[^a-zA-Z0-9._-]/g, '_');
      const fileName = `profiles/${membersId}/${Date.now()}_${safeOriginalName}`;
      console.log('Attempting to upload profile photo to:', fileName);
      
      const { error: uploadError } = await supabase.storage
        .from(PROFILE_PHOTO_BUCKET)
        .upload(fileName, profilePhotoFile.buffer, {
          contentType: profilePhotoFile.mimetype,
          upsert: true
        });

      if (uploadError) {
        console.error('Profile photo upload error:', uploadError);
        console.error('Upload error details:', {
          message: uploadError.message,
          code: uploadError.code,
          statusCode: uploadError.statusCode
        });
        return res.status(500).json({ 
          success: false, 
          message: `Failed to upload profile photo: ${uploadError.message || 'unknown storage error'}`,
          error: uploadError.message,
          details: uploadError
        });
      }

      // Get public URL
      const { data: urlData } = supabase.storage
        .from(PROFILE_PHOTO_BUCKET)
        .getPublicUrl(fileName);

      console.log('Successfully uploaded profile photo, public URL:', urlData.publicUrl);
      profilePhotoUrl = urlData.publicUrl;
    }

    const memberPatch = {
      Name: sanitizeMemberUpdateValue(profileData.name),
      Email: sanitizeMemberUpdateValue(profileData.email),
      'Address Home': sanitizeMemberUpdateValue(profileData.address_home),
      'Address Office': sanitizeMemberUpdateValue(profileData.address_office),
      'Company Name': sanitizeMemberUpdateValue(profileData.company_name),
      'Resident Landline': sanitizeMemberUpdateValue(profileData.resident_landline),
      'Office Landline': sanitizeMemberUpdateValue(profileData.office_landline)
    };

    const memberUpdatePayload = Object.fromEntries(
      Object.entries(memberPatch).filter(([, value]) => value !== null)
    );

    let mergedMember = member;
    if (Object.keys(memberUpdatePayload).length > 0) {
      const { data: updatedMember, error: memberUpdateErr } = await supabase
        .from('Members')
        .update(memberUpdatePayload)
        .eq('members_id', membersId)
        .select('*')
        .maybeSingle();

      if (memberUpdateErr) {
        console.error('Members update error:', memberUpdateErr);
        return res.status(500).json({
          success: false,
          message: 'Failed to save profile',
          error: memberUpdateErr.message
        });
      }

      if (updatedMember?.members_id) {
        mergedMember = updatedMember;
      }
    }

    const dbProfileData = {
      members_id: membersId,
      profile_photo_url: profilePhotoUrl || null,
      gender: profileData.gender || null,
      date_of_birth: profileData.dob || null,
      blood_group: profileData.blood_group || null,
      marital_status: profileData.marital_status || null,
      nationality: profileData.nationality || null,
      aadhaar_id: profileData.aadhaar_id || null,
      emergency_contact_name: profileData.emergency_contact_name || null,
      emergency_contact_number: profileData.emergency_contact_number || null,
      spouse_name: profileData.spouse_name || null,
      spouse_contact: profileData.spouse_contact_number || null,
      no_of_children: profileData.children_count ? parseInt(profileData.children_count, 10) : 0,
      facebook: profileData.facebook || null,
      twitter: profileData.twitter || null,
      instagram: profileData.instagram || null,
      linkedin: profileData.linkedin || null,
      whatsapp: profileData.whatsapp || null,
      updated_at: new Date().toISOString()
    };

    const { data: upsertedProfile, error: upsertErr } = await supabase
      .from('member_profiles')
      .upsert(dbProfileData, { onConflict: 'members_id' })
      .select()
      .maybeSingle();

    if (upsertErr) {
      console.error('DB error:', upsertErr);
      return res.status(500).json({ 
        success: false, 
        message: 'Failed to save profile',
        error: upsertErr.message
      });
    }

    const responseProfile = {
      name: readMemberValue(mergedMember, ['Name', 'name', 'Full Name', 'full_name']),
      role: activeMembership?.role || mergedMember?.role || mergedMember?.Role || 'Trustee',
      memberId: activeMembership?.['Membership number'] || mergedMember?.['Membership number'] || '',
      mobile: readMemberValue(mergedMember, ['Mobile', 'mobile']),
      email: readMemberValue(mergedMember, ['Email', 'email']),
      address_home: mergedMember?.['Address Home'] || '',
      address_office: mergedMember?.['Address Office'] || '',
      company_name: mergedMember?.['Company Name'] || '',
      resident_landline: mergedMember?.['Resident Landline'] || '',
      office_landline: mergedMember?.['Office Landline'] || '',
      gender: upsertedProfile?.gender || '',
      marital_status: upsertedProfile?.marital_status || '',
      nationality: upsertedProfile?.nationality || '',
      aadhaar_id: upsertedProfile?.aadhaar_id || '',
      blood_group: upsertedProfile?.blood_group || '',
      dob: upsertedProfile?.date_of_birth || '',
      emergency_contact_name: upsertedProfile?.emergency_contact_name || '',
      emergency_contact_number: upsertedProfile?.emergency_contact_number || '',
      profile_photo_url: upsertedProfile?.profile_photo_url || profilePhotoUrl || '',
      spouse_name: upsertedProfile?.spouse_name || '',
      spouse_contact_number: upsertedProfile?.spouse_contact || '',
      children_count: upsertedProfile?.no_of_children ?? '',
      facebook: upsertedProfile?.facebook || '',
      twitter: upsertedProfile?.twitter || '',
      instagram: upsertedProfile?.instagram || '',
      linkedin: upsertedProfile?.linkedin || '',
      whatsapp: upsertedProfile?.whatsapp || '',
      members_id: membersId
    };

    res.json({
      success: true,
      message: 'Profile saved successfully',
      profile: responseProfile
    });

  } catch (error) {
    console.error('Save error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// Get profile photos for multiple members
router.post('/photos', async (req, res) => {
  try {
    const { memberIds } = req.body;
    
    if (!memberIds || !Array.isArray(memberIds)) {
      return res.status(400).json({ success: false, message: 'memberIds array is required' });
    }

    const uniqIds = Array.from(new Set(memberIds.filter(Boolean)));
    if (uniqIds.length === 0) {
      return res.json({ success: true, photos: {} });
    }

    const { data: membersByNumber } = await supabase
      .from('Members')
      .select('members_id, "Membership number", Mobile')
      .in('Membership number', uniqIds);

    const { data: membersByMobile } = await supabase
      .from('Members')
      .select('members_id, "Membership number", Mobile')
      .in('Mobile', uniqIds);

    const memberMap = new Map();
    [...(membersByNumber || []), ...(membersByMobile || [])].forEach(m => {
      if (m?.members_id) memberMap.set(String(m.members_id), m);
    });

    const membersIdList = Array.from(memberMap.keys());
    if (membersIdList.length === 0) {
      return res.json({ success: true, photos: {} });
    }

    const { data: profiles, error } = await supabase
      .from('member_profiles')
      .select('members_id, profile_photo_url')
      .in('members_id', membersIdList)
      .not('profile_photo_url', 'is', null);

    if (error) {
      console.error('Fetch profile photos error:', error);
      return res.status(500).json({ success: false, message: 'Failed to fetch profile photos' });
    }

    const photoMap = {};
    (profiles || []).forEach(p => {
      const member = memberMap.get(String(p.members_id));
      if (!member) return;
      if (member['Membership number']) photoMap[member['Membership number']] = p.profile_photo_url;
      if (member.Mobile) photoMap[member.Mobile] = p.profile_photo_url;
      photoMap[p.members_id] = p.profile_photo_url;
    });
    
    res.json({
      success: true,
      photos: photoMap
    });
    
  } catch (error) {
    console.error('Fetch profile photos error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

export default router;

