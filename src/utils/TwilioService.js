const BaseService = require('../utils/BaseService');
const twilio = require('twilio');
const SibApiV3Sdk = require('@getbrevo/brevo');

class TwilioService extends BaseService {
    constructor() {
        super();
        
        this.accountSid = process.env.TWILIO_ACCOUNT_SID;
        this.authToken = process.env.TWILIO_AUTH_TOKEN;
        this.verifyServiceSid = process.env.TWILIO_VERIFY_SERVICE_SID;
        this.client = twilio(this.accountSid, this.authToken);

        this.brevoApiKey = process.env.BREVO_API_KEY;
        this.senderEmail = process.env.BREVO_SENDER_EMAIL;
        this.senderName = process.env.BREVO_SENDER_NAME;
        
        this.brevoClient = SibApiV3Sdk.ApiClient.instance;
        const apiKey = this.brevoClient.authentications['api-key'];
        apiKey.apiKey = this.brevoApiKey;
        this.transactionalEmailsApi = new SibApiV3Sdk.TransactionalEmailsApi();

        this.emailCodes = new Map();

        this.logInfo(`Using Verify Service SID: ${this.verifyServiceSid}`);
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
            this.logInfo(`Sending email verification to ${to} using Brevo`);
            
            const code = Math.floor(100000 + Math.random() * 900000).toString();
            
            const expiresAt = Date.now() + (5 * 60 * 1000);
            this.emailCodes.set(to, { code, expiresAt, attempts: 0 });

            const sendSmtpEmail = {
                to: [{ email: to }],
                sender: { 
                    email: this.senderEmail, 
                    name: this.senderName 
                },
                subject: 'Your Kachingko Verification Code',
                htmlContent: `
                    <html>
                        <body>
                            <h2>Email Verification</h2>
                            <p>Your verification code is: <strong>${code}</strong></p>
                            <p>This code will expire in 5 minutes.</p>
                            <p>If you didn't request this code, please ignore this email.</p>
                        </body>
                    </html>
                `,
                textContent: `Your Kachingko verification code is: ${code}. This code will expire in 5 minutes.`
            };

            const result = await this.transactionalEmailsApi.sendTransacEmail(sendSmtpEmail);
            this.logInfo(`Email verification sent successfully to ${to}`, { messageId: result.messageId });
            
            return {
                status: 'pending',
                to: to,
                messageId: result.messageId
            };
        } catch (error) {
            if (error.response?.body?.code === 'invalid_parameter') {
                throw new Error('Invalid email format');
            } else if (error.response?.status === 429) {
                throw new Error('Too many requests. Please try again later');
            }
            this.handleServiceError(error, 'Email sending');
        }
    }

    async checkEmailVerification(to, code) {
        try {
            this.logInfo(`Checking email verification for ${to}`);
            
            const storedData = this.emailCodes.get(to);
            if (!storedData) {
                return { status: 'expired', message: 'No verification code found or expired' };
            }

            if (Date.now() > storedData.expiresAt) {
                this.emailCodes.delete(to);
                return { status: 'expired', message: 'Verification code has expired' };
            }

            if (storedData.attempts >= 3) {
                this.emailCodes.delete(to);
                return { status: 'failed', message: 'Too many failed attempts' };
            }

            if (storedData.code === code) {
                this.emailCodes.delete(to);
                this.logInfo(`Email verification successful for ${to}`);
                return { status: 'approved', message: 'Email verified successfully' };
            } else {
                storedData.attempts++;
                this.emailCodes.set(to, storedData);
                return { status: 'failed', message: 'Invalid verification code' };
            }
        } catch (error) {
            this.handleServiceError(error, 'Email verification check');
        }
    }

    cleanupExpiredCodes() {
        const now = Date.now();
        for (const [email, data] of this.emailCodes.entries()) {
            if (now > data.expiresAt) {
                this.emailCodes.delete(email);
            }
        }
    }
}

module.exports = TwilioService;