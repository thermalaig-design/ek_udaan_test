import { supabase } from '../config/supabase.js';
import axios from 'axios';
import process from 'process';
import { initializeFast2SMSService, verifyOTP as verifyFast2SMSOTP } from './fast2smsService.js';

// Service Configuration
const MSG91_AUTH_KEY = process.env.MSG91_AUTH_KEY;
const MSG91_TEMPLATE_ID = process.env.MSG91_TEMPLATE_ID;
const MSG91_SENDER_ID = process.env.MSG91_SENDER_ID || 'MAHLTH';
const FAST2SMS_API_KEY = process.env.FAST2SMS_API_KEY;
const OTP_SERVICE_PREFERENCE = process.env.OTP_SERVICE_PREFERENCE || 'fast2sms'; // 'fast2sms' or 'msg91'
const OTP_EXPIRY_MINUTES = parseInt(process.env.OTP_EXPIRY_MINUTES) || 5;
const NODE_ENV = process.env.NODE_ENV || 'production';
const DEV_BYPASS_PHONE = '9911223344';
const DEV_BYPASS_OTP = '987654';

// In-memory OTP storage (for production, use Redis or database)
const otpStore = new Map();

/**
 * Generate 6-digit OTP
 */
const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

const normalizeTo10Digits = (value) => {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length >= 10) return digits.slice(-10);
  return digits;
};

/**
 * Send OTP via MSG91
 */
export const sendOTP = async (phoneNumber, otp) => {
  try {
    // Clean phone number
    const cleanPhone = phoneNumber.replace(/\D/g, '');
    
    // Format for MSG91 (should be in international format with country code)
    let formattedPhone;
    if (cleanPhone.length === 10) {
      formattedPhone = `91${cleanPhone}`;
    } else if (cleanPhone.length === 12 && cleanPhone.startsWith('91')) {
      formattedPhone = cleanPhone;
    } else if (cleanPhone.startsWith('+91') && cleanPhone.length === 13) {
      formattedPhone = cleanPhone.substring(1);
    } else {
      formattedPhone = cleanPhone;
    }
    
    console.log(`ðŸ“± Sending OTP ${otp} to ${formattedPhone}`);
    
    const url = 'https://control.msg91.com/api/v5/otp';
    
    const payload = {
      template_id: MSG91_TEMPLATE_ID,
      mobile: formattedPhone,
      authkey: MSG91_AUTH_KEY,
      otp: otp,
      otp_length: 6,
      otp_expiry: OTP_EXPIRY_MINUTES
    };
    
    const response = await axios.post(url, payload, {
      headers: {
        'Content-Type': 'application/json',
        'authkey': MSG91_AUTH_KEY
      }
    });
    
    console.log('âœ… MSG91 Response:', response.data);
    
    if (response.data.type === 'success') {
      return {
        success: true,
        message: 'OTP sent successfully',
        requestId: response.data.request_id
      };
    } else {
      throw new Error(response.data.message || 'Failed to send OTP');
    }
    
  } catch (error) {
    console.error('âŒ Error sending OTP via MSG91:', error.response?.data || error.message);
    throw new Error('Failed to send OTP. Please try again.');
  }
};

/**
 * Verify OTP via MSG91
 */
export const verifyOTPWithMSG91 = async (phoneNumber, otp) => {
  try {
    const cleanPhone = phoneNumber.replace(/\D/g, '');
    
    let formattedPhone;
    if (cleanPhone.length === 10) {
      formattedPhone = `91${cleanPhone}`;
    } else if (cleanPhone.length === 12 && cleanPhone.startsWith('91')) {
      formattedPhone = cleanPhone;
    } else if (cleanPhone.startsWith('+91') && cleanPhone.length === 13) {
      formattedPhone = cleanPhone.substring(1);
    } else {
      formattedPhone = cleanPhone;
    }
    
    console.log(`ðŸ” Verifying OTP ${otp} for ${formattedPhone}`);
    
    const url = 'https://control.msg91.com/api/v5/otp/verify';
    
    const payload = {
      authkey: MSG91_AUTH_KEY,
      mobile: formattedPhone,
      otp: otp
    };
    
    const response = await axios.post(url, payload, {
      headers: {
        'Content-Type': 'application/json',
        'authkey': MSG91_AUTH_KEY
      }
    });
    
    console.log('âœ… MSG91 Verify Response:', response.data);
    
    if (response.data.type === 'success') {
      return {
        success: true,
        message: 'OTP verified successfully'
      };
    } else {
      return {
        success: false,
        message: response.data.message || 'Invalid OTP'
      };
    }
    
  } catch (error) {
    console.error('âŒ Error verifying OTP:', error.response?.data || error.message);
    return {
      success: false,
      message: 'Invalid or expired OTP'
    };
  }
};

/**
 * Store OTP locally (backup method)
 */
const storeOTP = (phoneNumber, otp) => {
  const cleanPhone = phoneNumber.replace(/\D/g, '');
  
  let formattedPhoneForStorage;
  if (cleanPhone.length === 10) {
    formattedPhoneForStorage = `91${cleanPhone}`;
  } else if (cleanPhone.length === 12 && cleanPhone.startsWith('91')) {
    formattedPhoneForStorage = cleanPhone;
  } else if (cleanPhone.startsWith('+91') && cleanPhone.length === 13) {
    formattedPhoneForStorage = cleanPhone.substring(1);
  } else {
    formattedPhoneForStorage = cleanPhone;
  }
  const expiryTime = Date.now() + (OTP_EXPIRY_MINUTES * 60 * 1000);
  
  otpStore.set(formattedPhoneForStorage, {
    otp: otp,
    expiryTime: expiryTime,
    attempts: 0
  });
  
  // Auto-delete after expiry
  setTimeout(() => {
    otpStore.delete(formattedPhoneForStorage);
  }, OTP_EXPIRY_MINUTES * 60 * 1000);
};

/**
 * Verify OTP locally (backup method)
 */
const verifyOTPLocal = (phoneNumber, otp) => {
  const cleanPhone = phoneNumber.replace(/\D/g, '');
  
  let formattedPhoneForRetrieval;
  if (cleanPhone.length === 10) {
    formattedPhoneForRetrieval = `91${cleanPhone}`;
  } else if (cleanPhone.length === 12 && cleanPhone.startsWith('91')) {
    formattedPhoneForRetrieval = cleanPhone;
  } else if (cleanPhone.startsWith('+91') && cleanPhone.length === 13) {
    formattedPhoneForRetrieval = cleanPhone.substring(1);
  } else {
    formattedPhoneForRetrieval = cleanPhone;
  }
  
  const stored = otpStore.get(formattedPhoneForRetrieval);
  
  if (!stored) {
    return { success: false, message: 'OTP expired or not found' };
  }
  
  if (Date.now() > stored.expiryTime) {
    otpStore.delete(formattedPhoneForRetrieval);
    return { success: false, message: 'OTP expired' };
  }
  
  if (stored.attempts >= 3) {
    otpStore.delete(formattedPhoneForRetrieval);
    return { success: false, message: 'Too many failed attempts' };
  }
  
  if (stored.otp === otp) {
    otpStore.delete(formattedPhoneForRetrieval);
    return { success: true, message: 'OTP verified successfully' };
  }
  
  stored.attempts += 1;
  return { success: false, message: 'Invalid OTP' };
};

/**
 * Check if phone number exists in any table.
 * Updated to use new Members + reg_members schema.
 */
export const checkPhoneExists = async (phoneNumber) => {
  try {
    const cleanPhone = phoneNumber.replace(/\D/g, '');
    
    console.log(`ðŸ” Checking if phone ${cleanPhone} exists in database...`);
    
    const searchPatterns = [];
    
    if (cleanPhone.length >= 5) searchPatterns.push(cleanPhone);
    
    if (cleanPhone.length === 10) {
      searchPatterns.push(`91${cleanPhone}`);
      searchPatterns.push(`+91${cleanPhone}`);
    }
    
    if (cleanPhone.length === 12 && cleanPhone.startsWith('91')) {
      searchPatterns.push(cleanPhone.substring(2));
    }
    
    if (cleanPhone.length === 13 && cleanPhone.startsWith('+91')) {
      searchPatterns.push(cleanPhone.substring(3));
    }
    
    const uniquePatterns = [...new Set(searchPatterns)];
    
    console.log('ðŸ“± Search patterns:', uniquePatterns);    // Members.Mobile is numeric in this DB; use numeric-safe exact matching.
    const numericMobileCandidates = Array.from(
      new Set(
        uniquePatterns
          .map((pattern) => String(pattern || '').replace(/\D/g, ''))
          .filter((digits) => digits.length >= 10)
          .map((digits) => digits.slice(-10))
      )
    );

    // (1) Check in new Members table
    let memberData = [];
    let memberError = null;
    if (numericMobileCandidates.length > 0) {
      const memberQuery = await supabase
        .from('Members')
        .select(`
          "S.No.",
          "Name",
          "Address Home",
          "Company Name",
          "Address Office",
          "Resident Landline",
          "Office Landline",
          "Mobile",
          "Email",
          members_id
        `)
        .in('Mobile', numericMobileCandidates)
        .limit(1);
      memberData = memberQuery.data || [];
      memberError = memberQuery.error || null;
    }
    
    if (memberError) {
      console.error('âŒ Error querying Members:', memberError);
    }
    
    if (memberData && memberData.length > 0) {
      console.log('âœ… Phone found in Members');
      const member = memberData[0];
      
      const mergedUser = {
        'S. No.': member['S.No.'],
        'Membership number': null,        // Will be populated from reg_members
        'Name': member['Name'],
        'Address Home': member['Address Home'],
        'Company Name': member['Company Name'],
        'Address Office': member['Address Office'],
        'Resident Landline': member['Resident Landline'],
        'Office Landline': member['Office Landline'],
        'Mobile': member['Mobile'],
        'Email': member['Email'],
        'type': null,                      // Will be populated from reg_members
        id: member['S.No.'],
        name: member['Name'],
        mobile: member['Mobile'],
        members_id: member.members_id,
        membership_number: null
      };

      // â”€â”€ (2) Fetch trust memberships from reg_members â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
      if (member.members_id) {
        const { data: regMemberships, error: membershipError } = await supabase
          .from('reg_members')
          .select(`
            id,
            trust_id,
            role,
            joined_date,
            is_active,
            "Membership number",
            trust:Trust (
              id,
              name,
              icon_url,
              remark
            )
          `)
          .eq('members_id', member.members_id);

        if (membershipError) {
          console.warn('Could not fetch reg_member memberships:', membershipError);
        } else if (regMemberships && regMemberships.length > 0) {
          const memberships = regMemberships.map((row) => ({
            id: row.id,
            trust_id: row.trust_id,
            trust_name: row.trust?.name || null,
            trust_icon_url: row.trust?.icon_url || null,
            trust_remark: row.trust?.remark || null,
            role: row.role || null,
            joined_date: row.joined_date || null,
            is_active: row.is_active,
            membership_number: row['Membership number'] || null
          }));

          const activeMembership = memberships.find((m) => m.is_active);
          const primaryTrust = activeMembership || memberships[0];

          mergedUser.hospital_memberships = memberships;
          mergedUser['Membership number'] = primaryTrust?.membership_number || null;
          mergedUser.membership_number = primaryTrust?.membership_number || null;
          mergedUser.type = primaryTrust?.role || null;
          if (primaryTrust) {
            mergedUser.primary_trust = {
              id: primaryTrust.trust_id,
              name: primaryTrust.trust_name,
              icon_url: primaryTrust.trust_icon_url,
              remark: primaryTrust.trust_remark
            };
          }
        }
      }
      
      return {
        exists: true,
        table: 'Members',
        user: mergedUser
      };
    }
    
    // â”€â”€ (3) Check in opd_schedule â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const opdConditions = [];
    uniquePatterns.forEach(pattern => {
      opdConditions.push(`mobile.ilike.%${pattern}%`);
    });
    
    const opdSearchCondition = opdConditions.join(',');
    
    const { data: opdData } = await supabase
      .from('opd_schedule')
      .select('id, mobile, consultant_name, department, designation')
      .or(opdSearchCondition)
      .eq('is_active', true)
      .limit(1);
    
    if (opdData && opdData.length > 0) {
      console.log('âœ… Phone found in opd_schedule');
      return {
        exists: true,
        table: 'opd_schedule',
        user: {
          id: opdData[0].id,
          name: opdData[0].consultant_name,
          mobile: opdData[0].mobile,
          type: 'Doctor',
          department: opdData[0].department,
          designation: opdData[0].designation
        }
      };
    }
    
    // â”€â”€ (4) Check in hospitals â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const hospitalConditions = [];
    uniquePatterns.forEach(pattern => {
      hospitalConditions.push(`contact_phone.ilike.%${pattern}%`);
    });
    
    const hospitalSearchCondition = hospitalConditions.join(',');
    
    const { data: hospitalData } = await supabase
      .from('hospitals')
      .select('id, hospital_name, contact_phone, trust_name')
      .or(hospitalSearchCondition)
      .limit(1);
    
    if (hospitalData && hospitalData.length > 0) {
      console.log('âœ… Phone found in hospitals');
      return {
        exists: true,
        table: 'hospitals',
        user: {
          id: hospitalData[0].id,
          name: hospitalData[0].hospital_name,
          mobile: hospitalData[0].contact_phone,
          type: 'Hospital',
          trust_name: hospitalData[0].trust_name
        }
      };
    }
    
    console.log('âŒ Phone not found in any table');
    return {
      exists: false,
      table: null,
      user: null
    };
    
  } catch (error) {
    console.error('âŒ Error checking phone existence:', error);
    throw error;
  }
};



/**
 * Initialize phone auth and send OTP
 */
export const initializePhoneAuth = async (phoneNumber) => {
  try {
    // Optional DB lookup only for metadata; OTP send should work for generalized login flow.
    let phoneCheck = { exists: false, user: null };
    try {
      phoneCheck = await checkPhoneExists(phoneNumber);
    } catch (lookupError) {
      console.warn('Phone lookup skipped:', lookupError?.message || lookupError);
    }
    
    // Format phone number for MSG91
    const cleanPhone = phoneNumber.replace(/\D/g, '');
    let formattedPhone;
    if (cleanPhone.length === 10) {
      formattedPhone = `91${cleanPhone}`;
    } else if (cleanPhone.length === 12 && cleanPhone.startsWith('91')) {
      formattedPhone = cleanPhone;
    } else if (cleanPhone.startsWith('+91') && cleanPhone.length === 13) {
      formattedPhone = cleanPhone.substring(1);
    } else {
      formattedPhone = cleanPhone;
    }
    
    // Generate OTP
    const otp = generateOTP();
    
    // Store OTP locally as backup
    storeOTP(phoneNumber, otp);
    
    // Developer bypass: do not call external OTP provider for this number.
    if (normalizeTo10Digits(cleanPhone) === DEV_BYPASS_PHONE) {
      console.log('Developer bypass number detected. Skipping SMS provider send.');
      return {
        success: true,
        message: 'Developer OTP bypass enabled',
        data: {
          phoneNumber: formattedPhone,
          user: phoneCheck?.user || null,
          requestId: `dev_bypass_${Date.now()}`
        }
      };
    }

    // Send OTP via Fast2SMS only
    let sendResult;
    
    if (FAST2SMS_API_KEY) {
      try {
        console.log('ðŸ”„ Using Fast2SMS as OTP service');
        sendResult = await initializeFast2SMSService(cleanPhone);
      } catch (fast2smsError) {
        console.error('âŒ Fast2SMS failed:', fast2smsError.message);
        throw new Error('Failed to send OTP via Fast2SMS. Please complete website verification in your Fast2SMS account.');
      }
    } else {
      throw new Error('Fast2SMS API key not configured. Please add FAST2SMS_API_KEY to your environment variables.');
    }
    
    if (!sendResult.success) {
      throw new Error('Failed to send OTP');
    }
    
    console.log(`ðŸ“± OTP sent successfully to ${formattedPhone}`);
    
    return {
      success: true,
      message: 'OTP sent successfully',
      data: {
        phoneNumber: formattedPhone,
        user: phoneCheck?.user || null,
        requestId: sendResult.requestId
      }
    };
    
  } catch (error) {
    console.error('âŒ Error in initializePhoneAuth:', error);
    throw error;
  }
};

/**
 * Verify OTP
 */
const verifyTrustSecretCode = async (trustId, secretCode) => {
  try {
    const normalizedTrustId = String(trustId || '').trim();
    const normalizedSecretCode = String(secretCode || '').trim();
    if (!normalizedTrustId || !normalizedSecretCode) {
      return { success: false, message: 'Trust ID and secret code are required' };
    }

    const { data: trustRow, error } = await supabase
      .from('Trust')
      .select('id, secret_code')
      .eq('id', normalizedTrustId)
      .maybeSingle();

    if (error) {
      console.error('Trust secret code lookup error:', error);
      return { success: false, message: 'Unable to validate secret code' };
    }

    const expectedSecret = String(trustRow?.secret_code || '').trim();
    if (!expectedSecret) {
      return { success: false, message: 'Secret code is not configured for this trust' };
    }

    if (normalizedSecretCode === expectedSecret) {
      return { success: true, message: 'Secret code verified successfully' };
    }

    return { success: false, message: 'Invalid secret code' };
  } catch (error) {
    console.error('Error verifying trust secret code:', error);
    return { success: false, message: 'Failed to verify secret code' };
  }
};

/**
 * Verify OTP OR secret code
 */
export const verifyOTP = async (phoneNumber, otp, options = {}) => {
  try {
    const { secretCode = '', trustId = '' } = options || {};
    const normalizedOtp = String(otp || '').trim();
    const normalizedSecretCode = String(secretCode || '').trim();

    console.log(`Verifying OTP for ${phoneNumber}`);

    const normalizedPhone = normalizeTo10Digits(phoneNumber);
    if (normalizedPhone === DEV_BYPASS_PHONE && normalizedOtp === DEV_BYPASS_OTP) {
      return {
        success: true,
        message: 'Developer OTP verified successfully'
      };
    }

    if (normalizedOtp) {
      if (FAST2SMS_API_KEY) {
        const fast2smsResult = verifyFast2SMSOTP(phoneNumber, normalizedOtp);
        if (fast2smsResult.success) {
          return fast2smsResult;
        }

        const localResult = verifyOTPLocal(phoneNumber, normalizedOtp);
        if (localResult.success) return localResult;
      } else {
        throw new Error('Fast2SMS API key not configured for verification');
      }
    }

    if (normalizedSecretCode) {
      const secretResult = await verifyTrustSecretCode(trustId, normalizedSecretCode);
      if (secretResult.success) {
        return {
          success: true,
          message: 'Secret code verified successfully',
          usedSecretCode: true
        };
      }
      return secretResult;
    }

    return {
      success: false,
      message: 'Invalid OTP or secret code'
    };
  } catch (error) {
    console.error('Error verifying OTP:', error);
    return {
      success: false,
      message: 'Failed to verify OTP'
    };
  }
};

