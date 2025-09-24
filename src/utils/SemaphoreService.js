const BaseService = require('./BaseService');
const axios = require('axios');

class SemaphoreService extends BaseService {
    constructor() {
        super();
        this.apiKey = process.env.SEMAPHORE_API_KEY;
        this.senderName = process.env.SEMAPHORE_SENDER_NAME;
        this.baseUrl = 'https://api.semaphore.co/api/v4';
        
        this.otpCodes = new Map();
        
        this.logInfo('Semaphore SMS service initialized');
    }

    async sendOTP(phoneNumber) {
        try {
            this.logInfo(`Sending OTP to ${phoneNumber} via Semaphore OTP endpoint`);
            
            const response = await axios.post(`${this.baseUrl}/otp`, {
                apikey: this.apiKey,
                number: phoneNumber,
                message: 'Your Kachingko verification code is: {otp}. This code will expire in 5 minutes. Do not share this code with anyone.',
                sendername: this.senderName
            });

            const responseData = response.data[0];
            const generatedOTP = responseData.code;
            
            const expiresAt = Date.now() + (5 * 60 * 1000);
            this.otpCodes.set(phoneNumber, { 
                code: generatedOTP.toString(), 
                expiresAt, 
                attempts: 0 
            });

            this.logInfo(`OTP sent successfully to ${phoneNumber}`, { 
                messageId: responseData.message_id,
                otpCode: generatedOTP
            });
            
            return {
                status: 'pending',
                to: phoneNumber,
                messageId: responseData.message_id,
            };
        } catch (error) {
            if (error.response) {
                const errorData = error.response.data;
                if (errorData.message?.includes('Invalid number')) {
                    throw new Error('Invalid phone number format');
                } else if (errorData.message?.includes('Insufficient balance')) {
                    throw new Error('SMS service temporarily unavailable');
                }
            }
            this.handleServiceError(error, 'OTP sending');
        }
    }

    async verifyOTP(phoneNumber, code) {
        try {
            this.logInfo(`Verifying OTP for ${phoneNumber}`);

            const storedData = this.otpCodes.get(phoneNumber);
            if (!storedData) {
                return { status: 'expired', message: 'No verification code found or expired' };
            }

            if (Date.now() > storedData.expiresAt) {
                this.otpCodes.delete(phoneNumber);
                return { status: 'expired', message: 'Verification code has expired' };
            }

            if (storedData.attempts >= 3) {
                this.otpCodes.delete(phoneNumber);
                return { status: 'failed', message: 'Too many failed attempts' };
            }
            
            if (storedData.code === code) {
                this.otpCodes.delete(phoneNumber);
                this.logInfo(`OTP verification successful for ${phoneNumber}`);
                return { status: 'approved', message: 'Phone number verified successfully' };
            } else {
                storedData.attempts++;
                this.otpCodes.set(phoneNumber, storedData);
                return { status: 'failed', message: 'Invalid verification code' };
            }
        } catch (error) {
            this.handleServiceError(error, 'OTP verification');
        }
    }

    async sendSms(to, message) {
        try {
            this.logInfo(`Sending regular SMS to ${to} via Semaphore`);
            
            const response = await axios.post(`${this.baseUrl}/messages`, {
                apikey: this.apiKey,
                number: to,
                message: message,
                sendername: this.senderName
            });

            this.logInfo(`SMS sent successfully to ${to}`, { messageId: response.data[0]?.message_id });
            return response.data[0];
        } catch (error) {
            if (error.response) {
                const errorData = error.response.data;
                if (errorData.message?.includes('Invalid number')) {
                    throw new Error('Invalid phone number format');
                } else if (errorData.message?.includes('Insufficient balance')) {
                    throw new Error('SMS service temporarily unavailable');
                }
            }
            this.handleServiceError(error, 'SMS sending');
        }
    }

    cleanupExpiredCodes() {
        const now = Date.now();
        let cleaned = 0;
        for (const [phone, data] of this.otpCodes.entries()) {
            if (now > data.expiresAt) {
                this.otpCodes.delete(phone);
                cleaned++;
            }
        }
        if (cleaned > 0) {
            this.logInfo(`Cleaned up ${cleaned} expired OTP codes`);
        }
    }

    async getBalance() {
        try {
            const response = await axios.get(`${this.baseUrl}/account`, {
                params: { apikey: this.apiKey }
            });
            return response.data;
        } catch (error) {
            this.handleServiceError(error, 'Balance check');
        }
    }

    async sendCustomOTP(phoneNumber, customCode) {
        try {
            this.logInfo(`Sending custom OTP to ${phoneNumber} via Semaphore OTP endpoint`);
            
            const response = await axios.post(`${this.baseUrl}/otp`, {
                apikey: this.apiKey,
                number: phoneNumber,
                message: 'Your Kachingko verification code is: {otp}. This code will expire in 5 minutes. Do not share this code with anyone.',
                sendername: this.senderName || "",
                code: customCode
            });

            const responseData = response.data[0];
            
            const expiresAt = Date.now() + (5 * 60 * 1000);
            this.otpCodes.set(phoneNumber, { 
                code: customCode.toString(), 
                expiresAt, 
                attempts: 0 
            });

            this.logInfo(`Custom OTP sent successfully to ${phoneNumber}`, { 
                messageId: responseData.message_id 
            });
            
            return {
                status: 'pending',
                to: phoneNumber,
                messageId: responseData.message_id
            };
        } catch (error) {
            this.handleServiceError(error, 'Custom OTP sending');
        }
    }
}

module.exports = SemaphoreService;