import { initializePhoneAuth, verifyOTP, checkPhoneExists } from '../services/otpService.js';

/**
 * Special login for phone number 9911334455 - bypass OTP
 */
export const specialLogin = async (req, res, next) => {
  try {
    const { phoneNumber, passcode } = req.body;
    
    // Validate input
    if (!phoneNumber || !passcode) {
      return res.status(400).json({
        success: false,
        message: 'Phone number and passcode are required'
      });
    }
    
    // Check if it's the special phone number
    if (phoneNumber !== '9911334455') {
      return res.status(403).json({
        success: false,
        message: 'This endpoint is only for special phone number 9911334455'
      });
    }
    
    // Check if passcode is correct
    if (passcode !== '123456') {
      return res.status(401).json({
        success: false,
        message: 'Invalid passcode'
      });
    }
    
    console.log(`ðŸ”§ Special login attempt for ${phoneNumber} with passcode ${passcode}`);
    
    // Check if phone exists in database
    const phoneCheck = await checkPhoneExists(phoneNumber);
    
    if (!phoneCheck.exists) {
      return res.status(404).json({
        success: false,
        message: 'Phone number not registered in the system'
      });
    }
    
    res.status(200).json({
      success: true,
      message: 'Special login successful',
      data: {
        user: phoneCheck.user,
        phoneNumber: phoneNumber
      }
    });
    
  } catch (error) {
    console.error('âŒ Error in specialLogin:', error);
    next(error);
  }
};

/**
 * Check phone and send OTP
 */
export const checkPhone = async (req, res, next) => {
  try {
    const { phoneNumber } = req.body;
    
    // Validate phone number
    if (!phoneNumber) {
      return res.status(400).json({
        success: false,
        message: 'Phone number is required'
      });
    }
    
    // Clean and validate phone format
    const cleanPhone = phoneNumber.replace(/\D/g, '');
    if (cleanPhone.length < 10) {
      return res.status(400).json({
        success: false,
        message: 'Invalid phone number format'
      });
    }
    
    console.log(`ðŸ“± Checking phone and sending OTP: ${cleanPhone}`);
    
    const result = await initializePhoneAuth(cleanPhone);
    
    if (!result.success) {
      return res.status(404).json(result);
    }
    
    res.status(200).json({
      success: true,
      message: 'OTP sent successfully',
      data: {
        phoneNumber: result.data.phoneNumber,
        user: result.data.user,
        requestId: result.data.requestId
      }
    });
    
  } catch (error) {
    console.error('âŒ Error in checkPhone:', error);
    next(error);
  }
};

/**
 * Verify OTP
 */
export const verifyOTPController = async (req, res, next) => {
  try {
    const { phoneNumber, otp, secretCode, trustId } = req.body;

    if (!phoneNumber) {
      return res.status(400).json({
        success: false,
        message: 'Phone number is required'
      });
    }

    const normalizedOtp = String(otp || '').trim();
    const normalizedSecretCode = String(secretCode || '').trim();
    const normalizedTrustId = String(trustId || '').trim();

    if (!normalizedOtp && !normalizedSecretCode) {
      return res.status(400).json({
        success: false,
        message: 'OTP or secret code is required'
      });
    }

    if (normalizedOtp && !/^\d{6}$/.test(normalizedOtp)) {
      return res.status(400).json({
        success: false,
        message: 'OTP must be 6 digits'
      });
    }

    if (normalizedSecretCode && !normalizedTrustId) {
      return res.status(400).json({
        success: false,
        message: 'Trust ID is required for secret code verification'
      });
    }

    const result = await verifyOTP(phoneNumber, normalizedOtp, {
      secretCode: normalizedSecretCode,
      trustId: normalizedTrustId
    });

    if (!result.success) {
      return res.status(400).json(result);
    }

    res.status(200).json({
      success: true,
      message: result.usedSecretCode ? 'Secret code verified successfully' : 'OTP verified successfully'
    });

  } catch (error) {
    console.error('Error in verifyOTP:', error);
    next(error);
  }
};
