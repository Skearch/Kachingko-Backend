const BaseService = require('../utils/BaseService');
const twilio = require('twilio');

class TwilioService extends BaseService {
    constructor() {
        super();
        this.accountSid = process.env.TWILIO_ACCOUNT_SID;
        this.authToken = process.env.TWILIO_AUTH_TOKEN;
        this.verifyServiceSid = process.env.TWILIO_VERIFY_SERVICE_SID;

        this.logInfo(`Using Verify Service SID: ${this.verifyServiceSid}`);

        this.client = twilio(this.accountSid, this.authToken);
    }

    async checkVerification(to, code) {
        try {
            this.logInfo(`Checking verification for ${to}`);
            const verificationCheck = await this.client.verify.v2
                .services(this.verifyServiceSid)
                .verificationChecks
                .create({ to, code });
            this.logInfo(`Verification check completed for ${to}`);
            return verificationCheck;
        } catch (error) {
            this.handleServiceError(error, 'Verification check');
        }
    }

    async sendSms(to) {
        try {
            this.logInfo(`Sending SMS to ${to} using service SID: ${this.verifyServiceSid}`);
            const verification = await this.client.verify.v2
                .services(this.verifyServiceSid)
                .verifications
                .create({ to, channel: 'sms' });
            this.logInfo(`SMS sent successfully to ${to}`);
            return verification;
        } catch (error) {
            if (error.code === 20404) {
                throw new Error('Invalid phone number format');
            } else if (error.code === 20429) {
                throw new Error('Too many requests. Please try again later');
            } else if (error.code === 60200) {
                throw new Error('Invalid verification service configuration');
            }
            this.handleServiceError(error, 'SMS sending');
        }
    }

    async sendEmail(to) {
        try {
            this.logInfo(`Sending email verification to ${to}`);
            const verification = await this.client.verify.v2
                .services(this.verifyServiceSid)
                .verifications
                .create({ to, channel: 'email' });
            this.logInfo(`Email verification sent successfully to ${to}`);
            return verification;
        } catch (error) {
            if (error.code === 20404) {
                throw new Error('Invalid email format');
            } else if (error.code === 20429) {
                throw new Error('Too many requests. Please try again later');
            } else if (error.code === 60200) {
                throw new Error('Invalid verification service configuration');
            }
            this.handleServiceError(error, 'Email sending');
        }
    }

    async checkEmailVerification(to, code) {
        try {
            this.logInfo(`Checking email verification for ${to}`);
            const verificationCheck = await this.client.verify.v2
                .services(this.verifyServiceSid)
                .verificationChecks
                .create({ to, code });
            this.logInfo(`Email verification check completed for ${to}`);
            return verificationCheck;
        } catch (error) {
            this.handleServiceError(error, 'Email verification check');
        }
    }
}

module.exports = TwilioService;