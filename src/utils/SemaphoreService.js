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

    generateOTP() {
        return Math.floor(100000 + Math.random() * 900000).toString();
    }

    async sendSms(to, message) {
        try {
            this.logInfo(`Sending SMS to ${to} via Semaphore`);
            
            const response = await axios.post(`${this.baseUrl}/messages`, {
                apikey: this.apiKey,
                number: to,
                message: message,
                sendername: this.senderName
            });

            this.logInfo(`SMS sent successfully to ${to}`, { messageId: response.data.message_id });
            return response.data;
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

    async sendOTP(phoneNumber) {
        try {
            this.logInfo(`Generating and sending OTP to ${phoneNumber}`);
            
            const otp = this.generateOTP();
            const expiresAt = Date.now() + (5 * 60 * 1000);
            
            this.otpCodes.set(phoneNumber, { 
                code: otp, 
                expiresAt, 
                attempts: 0 
            });

            const message = `Your Kachingko verification code is: ${otp}. This code will expire in 5 minutes. Do not share this code with anyone.`;
            
            const result = await this.sendSms(phoneNumber, message);
            
            return {
                status: 'pending',
                to: phoneNumber,
                messageId: result.message_id || result.id
            };
        } catch (error) {
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
}

module.exports = SemaphoreService;