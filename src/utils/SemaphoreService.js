const BaseService = require('./BaseService');
const axios = require('axios');

class SemaphoreService extends BaseService {
    constructor() {
        super();
        this.apiKey = process.env.SEMAPHORE_API_KEY;
        this.senderName = process.env.SEMAPHORE_SENDER_NAME;
        this.baseUrl = 'https://api.semaphore.co/api/v4';
        this.otpCodes = new Map();
        this._validateConfiguration();
        this.logInfo('Semaphore SMS service initialized');
    }

    async initialize() {
        try {
            await super.initialize();
            await this._testConnection();
            this.logInfo('SemaphoreService initialized successfully');
        } catch (error) {
            this.serviceStatus = 'error';
            throw this.handleServiceError(error, 'service initialization');
        }
    }

    async sendOTP(phoneNumber) {
        return this.executeWithRetry(async () => {
            this.logInfo(`Sending OTP to ${phoneNumber} via Semaphore OTP endpoint`);

            this._validateInput({ phoneNumber }, {
                phoneNumber: { required: true, type: 'string', pattern: /^(\+63|63|0)?[89]\d{9}$/ }
            });

            const response = await this._makeRequest(`${this.baseUrl}/otp`, {
                apikey: this.apiKey,
                number: phoneNumber,
                message: 'Your Kachingko verification code is: {otp}. This code will expire in 5 minutes. Do not share this code with anyone.',
                sendername: this.senderName
            });

            const responseData = response.data[0];
            const generatedOTP = responseData.code;

            this._storeOTPCode(phoneNumber, generatedOTP);

            this.logInfo(`OTP sent successfully to ${phoneNumber}`, {
                messageId: responseData.message_id,
                otpCode: generatedOTP
            });

            return {
                status: 'pending',
                to: phoneNumber,
                messageId: responseData.message_id
            };
        }, 3, 2000);
    }

    async verifyOTP(phoneNumber, code) {
        try {
            this.logInfo(`Verifying OTP for ${phoneNumber}`);

            this._validateInput({ phoneNumber, code }, {
                phoneNumber: { required: true, type: 'string' },
                code: { required: true, type: 'string', minLength: 4, maxLength: 8 }
            });

            const storedData = this.otpCodes.get(phoneNumber);
            if (!storedData) {
                return { status: 'expired', message: 'No verification code found or expired' };
            }

            if (this._isCodeExpired(storedData)) {
                this._removeOTPCode(phoneNumber);
                return { status: 'expired', message: 'Verification code has expired' };
            }

            if (this._hasExceededAttempts(storedData)) {
                this._removeOTPCode(phoneNumber);
                return { status: 'failed', message: 'Too many failed attempts' };
            }

            if (this._isCodeValid(storedData, code)) {
                this._removeOTPCode(phoneNumber);
                this.logInfo(`OTP verification successful for ${phoneNumber}`);
                return { status: 'approved', message: 'Phone number verified successfully' };
            } else {
                this._incrementAttempts(phoneNumber, storedData);
                return { status: 'failed', message: 'Invalid verification code' };
            }
        } catch (error) {
            throw this.handleServiceError(error, 'OTP verification');
        }
    }

    async sendSms(to, message) {
        return this.executeWithRetry(async () => {
            this.logInfo(`Sending regular SMS to ${to} via Semaphore`);

            this._validateInput({ to, message }, {
                to: { required: true, type: 'string', pattern: /^(\+63|63|0)?[89]\d{9}$/ },
                message: { required: true, type: 'string', minLength: 1, maxLength: 160 }
            });

            const response = await this._makeRequest(`${this.baseUrl}/messages`, {
                apikey: this.apiKey,
                number: to,
                message: message,
                sendername: this.senderName
            });

            const result = response.data[0];
            this.logInfo(`SMS sent successfully to ${to}`, { messageId: result?.message_id });

            return {
                messageId: result.message_id,
                status: result.status,
                cost: result.cost
            };
        }, 3, 1000);
    }

    async sendCustomOTP(phoneNumber, customCode) {
        return this.executeWithRetry(async () => {
            this.logInfo(`Sending custom OTP to ${phoneNumber} via Semaphore OTP endpoint`);

            this._validateInput({ phoneNumber, customCode }, {
                phoneNumber: { required: true, type: 'string', pattern: /^(\+63|63|0)?[89]\d{9}$/ },
                customCode: { required: true, type: 'string', minLength: 4, maxLength: 8 }
            });

            const response = await this._makeRequest(`${this.baseUrl}/otp`, {
                apikey: this.apiKey,
                number: phoneNumber,
                message: 'Your Kachingko verification code is: {otp}. This code will expire in 5 minutes. Do not share this code with anyone.',
                sendername: this.senderName || '',
                code: customCode
            });

            const responseData = response.data[0];
            this._storeOTPCode(phoneNumber, customCode);

            this.logInfo(`Custom OTP sent successfully to ${phoneNumber}`, {
                messageId: responseData.message_id
            });

            return {
                status: 'pending',
                to: phoneNumber,
                messageId: responseData.message_id
            };
        }, 3, 1000);
    }

    async getBalance() {
        return this.executeWithRetry(async () => {
            const response = await axios.get(`${this.baseUrl}/account`, {
                params: { apikey: this.apiKey },
                timeout: 10000
            });

            return {
                balance: response.data.balance,
                credits: response.data.credits,
                currency: response.data.currency
            };
        }, 2, 1000);
    }

    cleanupExpiredCodes() {
        const now = Date.now();
        let cleaned = 0;

        for (const [phone, data] of this.otpCodes.entries()) {
            if (this._isCodeExpired(data, now)) {
                this._removeOTPCode(phone);
                cleaned++;
            }
        }

        if (cleaned > 0) {
            this.logInfo(`Cleaned up ${cleaned} expired OTP codes`);
        }

        return cleaned;
    }

    getActiveCodesCount() {
        return this.otpCodes.size;
    }

    getCodeStats() {
        const stats = {
            activeCount: this.otpCodes.size,
            expiredCount: 0,
            highAttemptCount: 0
        };

        const now = Date.now();
        for (const [phone, data] of this.otpCodes.entries()) {
            if (this._isCodeExpired(data, now)) {
                stats.expiredCount++;
            }
            if (data.attempts >= 2) {
                stats.highAttemptCount++;
            }
        }

        return stats;
    }

    async _performHealthCheck() {
        try {
            const balance = await this.getBalance();
            return {
                sms: 'connected',
                balance: balance.balance,
                credits: balance.credits,
                activeCodes: this.getActiveCodesCount(),
                details: 'SMS service is operational'
            };
        } catch (error) {
            return {
                sms: 'disconnected',
                error: error.message,
                details: 'SMS service connection failed'
            };
        }
    }

    _validateConfiguration() {
        const requiredConfig = ['SEMAPHORE_API_KEY', 'SEMAPHORE_SENDER_NAME'];

        try {
            this.validateConfiguration(requiredConfig);
        } catch (error) {
            throw new Error(`SemaphoreService configuration error: ${error.message}`);
        }
    }

    async _testConnection() {
        try {
            const response = await axios.get(`${this.baseUrl}/account`, {
                params: { apikey: this.apiKey },
                timeout: 5000
            });

            this.logInfo('Semaphore API connection verified successfully');
            return {
                balance: response.data.balance,
                credits: response.data.credits,
                currency: response.data.currency
            };
        } catch (error) {
            if (error.response?.status === 429) {
                throw new Error(`Semaphore API rate limit exceeded - try again later`);
            }
            throw new Error(`Semaphore API connection failed: ${error.message}`);
        }
    }
    async _makeRequest(url, data) {
        try {
            return await axios.post(url, data, {
                timeout: 15000,
                headers: {
                    'Content-Type': 'application/json',
                    'User-Agent': 'Kachingko-Backend/1.0.0'
                }
            });
        } catch (error) {
            if (error.response) {
                const errorData = error.response.data;
                throw this._handleApiError(errorData);
            }
            throw error;
        }
    }

    _handleApiError(errorData) {
        if (errorData.message?.includes('Invalid number')) {
            return new Error('Invalid Philippines phone number format');
        } else if (errorData.message?.includes('Insufficient balance')) {
            return new Error('SMS service temporarily unavailable - insufficient balance');
        } else if (errorData.message?.includes('Invalid API key')) {
            return new Error('SMS service authentication failed');
        } else if (errorData.message?.includes('Rate limit')) {
            return new Error('SMS service rate limit exceeded');
        }

        return new Error(`SMS service error: ${errorData.message || 'Unknown error'}`);
    }

    _storeOTPCode(phoneNumber, code) {
        const expiresAt = Date.now() + (5 * 60 * 1000);
        this.otpCodes.set(phoneNumber, {
            code: code.toString(),
            expiresAt,
            attempts: 0,
            createdAt: Date.now()
        });
    }

    _removeOTPCode(phoneNumber) {
        this.otpCodes.delete(phoneNumber);
    }

    _isCodeExpired(data, currentTime = Date.now()) {
        return currentTime > data.expiresAt;
    }

    _hasExceededAttempts(data, maxAttempts = 3) {
        return data.attempts >= maxAttempts;
    }

    _isCodeValid(data, inputCode) {
        return data.code === inputCode.toString().trim();
    }

    _incrementAttempts(phoneNumber, data) {
        data.attempts++;
        this.otpCodes.set(phoneNumber, data);
    }
}

module.exports = SemaphoreService;