const BaseService = require('../utils/BaseService');
const twilio = require('twilio');
const nodemailer = require('nodemailer');

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

        try {
            this.emailTransporter = nodemailer.createTransport({
                host: 'smtp-relay.brevo.com',
                port: 587,
                secure: false,
                auth: {
                    user: this.senderEmail,
                    pass: this.brevoApiKey
                }
            });
            this.logInfo('Brevo SMTP client initialized successfully');
        } catch (error) {
            this.logError('Failed to initialize Brevo SMTP client', error);
            throw error;
        }

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
            this.logInfo(`Sending email verification to ${to} using Brevo SMTP`);

            const code = Math.floor(100000 + Math.random() * 900000).toString();

            const expiresAt = Date.now() + (5 * 60 * 1000);
            this.emailCodes.set(to, { code, expiresAt, attempts: 0 });

            const mailOptions = {
                from: `${this.senderName} <${this.senderEmail}>`,
                to: to,
                subject: 'Your Kachingko Verification Code',
                html: `
                    <html>
                        <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                            <div style="text-align: center; margin-bottom: 30px;">
                                <h2 style="color: #333; margin-bottom: 10px;">Email Verification</h2>
                                <p style="color: #666; font-size: 16px;">Kachingko Account Verification</p>
                            </div>
                            
                            <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; text-align: center; margin-bottom: 20px;">
                                <p style="color: #333; font-size: 16px; margin-bottom: 15px;">Your verification code is:</p>
                                <div style="background-color: #007bff; color: white; padding: 15px 30px; border-radius: 5px; font-size: 24px; font-weight: bold; letter-spacing: 3px; display: inline-block;">
                                    ${code}
                                </div>
                            </div>
                            
                            <div style="text-align: center; color: #666; font-size: 14px;">
                                <p>This code will expire in <strong>5 minutes</strong>.</p>
                                <p>If you didn't request this code, please ignore this email.</p>
                                <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
                                <p style="font-size: 12px;">© 2025 Kachingko. All rights reserved.</p>
                            </div>
                        </body>
                    </html>
                `,
                text: `Your Kachingko verification code is: ${code}. This code will expire in 5 minutes. If you didn't request this code, please ignore this email.`
            };

            const result = await this.emailTransporter.sendMail(mailOptions);
            this.logInfo(`Email verification sent successfully to ${to}`, { messageId: result.messageId });

            return {
                status: 'pending',
                to: to,
                messageId: result.messageId
            };
        } catch (error) {
            if (error.code === 'EAUTH') {
                throw new Error('Email authentication failed. Check Brevo API key.');
            } else if (error.code === 'ECONNECTION') {
                throw new Error('Failed to connect to email service.');
            } else if (error.responseCode === 550) {
                throw new Error('Invalid email address.');
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
        let cleaned = 0;
        for (const [email, data] of this.emailCodes.entries()) {
            if (now > data.expiresAt) {
                this.emailCodes.delete(email);
                cleaned++;
            }
        }
        if (cleaned > 0) {
            this.logInfo(`Cleaned up ${cleaned} expired email codes`);
        }
    }

    async testEmailConnection() {
        try {
            await this.emailTransporter.verify();
            this.logInfo('Email connection test successful');
            return true;
        } catch (error) {
            this.logError('Email connection test failed', error);
            return false;
        }
    }
}

module.exports = TwilioService;