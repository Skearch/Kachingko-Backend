const BaseService = require('./BaseService');
const nodemailer = require('nodemailer');

class BrevoService extends BaseService {
    constructor() {
        super();
        this.transporter = this._createTransporter();
        this.fromEmail = process.env.SMTP_FROM;
        this.emailCodes = new Map();
        this._validateConfiguration();
        this.logInfo('Brevo email service initialized');
    }

    async initialize() {
        try {
            await super.initialize();
            if (process.env.NODE_ENV !== 'production') {
                try {
                    await this._testConnection();
                } catch (error) {
                    this.logWarn('SMS service connection test failed during initialization - service will continue without connection verification', { error: error.message });
                }
            }
            this.logInfo('SemaphoreService initialized successfully');
        } catch (error) {
            this.serviceStatus = 'error';
            throw this.handleServiceError(error, 'service initialization');
        }
    }

    async sendEmailOTP(email) {
        return this.executeWithRetry(async () => {
            this.logInfo(`Generating and sending email OTP to ${email}`);

            const otp = this._generateEmailOTP();
            const expiresAt = Date.now() + (5 * 60 * 1000);

            this._storeOTPCode(email, otp, expiresAt);

            const subject = 'Kachingko Email Verification Code';
            const htmlContent = this._generateEmailTemplate(otp);

            const result = await this._sendEmail(email, subject, htmlContent);

            return {
                status: 'pending',
                to: email,
                messageId: result.messageId
            };
        }, 3, 2000);
    }

    async verifyEmailOTP(email, code) {
        try {
            this.logInfo(`Verifying email OTP for ${email}`);

            this._validateInput({ email, code }, {
                email: { required: true, type: 'string', pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ },
                code: { required: true, type: 'string', minLength: 6, maxLength: 6 }
            });

            const storedData = this.emailCodes.get(email);
            if (!storedData) {
                return { status: 'expired', message: 'No verification code found or expired' };
            }

            if (this._isCodeExpired(storedData)) {
                this._removeOTPCode(email);
                return { status: 'expired', message: 'Verification code has expired' };
            }

            if (this._hasExceededAttempts(storedData)) {
                this._removeOTPCode(email);
                return { status: 'failed', message: 'Too many failed attempts' };
            }

            if (this._isCodeValid(storedData, code)) {
                this._removeOTPCode(email);
                this.logInfo(`Email OTP verification successful for ${email}`);
                return { status: 'approved', message: 'Email verified successfully' };
            } else {
                this._incrementAttempts(email, storedData);
                return { status: 'failed', message: 'Invalid verification code' };
            }
        } catch (error) {
            throw this.handleServiceError(error, 'Email OTP verification');
        }
    }

    async sendWelcomeEmail(email, phoneNumber) {
        return this.executeWithRetry(async () => {
            const subject = 'Welcome to Kachingko!';
            const htmlContent = this._generateWelcomeTemplate(email, phoneNumber);
            return await this._sendEmail(email, subject, htmlContent);
        }, 3, 1000);
    }

    async sendCustomEmail(to, subject, htmlContent) {
        return this.executeWithRetry(async () => {
            return await this._sendEmail(to, subject, htmlContent);
        }, 3, 1000);
    }

    async testConnection() {
        return this.executeWithTimeout(async () => {
            await this.transporter.verify();
            this.logInfo('Brevo SMTP connection verified successfully');
            return { status: 'connected', message: 'SMTP connection successful' };
        }, 10000);
    }

    cleanupExpiredCodes() {
        const now = Date.now();
        let cleaned = 0;

        for (const [email, data] of this.emailCodes.entries()) {
            if (this._isCodeExpired(data, now)) {
                this._removeOTPCode(email);
                cleaned++;
            }
        }

        if (cleaned > 0) {
            this.logInfo(`Cleaned up ${cleaned} expired email OTP codes`);
        }

        return cleaned;
    }

    getActiveCodesCount() {
        return this.emailCodes.size;
    }

    getCodeStats() {
        const stats = {
            activeCount: this.emailCodes.size,
            expiredCount: 0,
            highAttemptCount: 0
        };

        const now = Date.now();
        for (const [email, data] of this.emailCodes.entries()) {
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
            await this.testConnection();
            return {
                smtp: 'connected',
                activeCodes: this.getActiveCodesCount(),
                details: 'Email service is operational'
            };
        } catch (error) {
            return {
                smtp: 'disconnected',
                error: error.message,
                details: 'Email service connection failed'
            };
        }
    }

    _createTransporter() {
        const config = {
            host: process.env.SMTP_HOST,
            port: parseInt(process.env.SMTP_PORT) || 587,
            secure: process.env.SMTP_SECURE === 'true',
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASS
            },
            connectionTimeout: 10000,
            greetingTimeout: 5000,
            socketTimeout: 10000
        };

        return nodemailer.createTransport(config);
    }

    _validateConfiguration() {
        const requiredConfig = [
            'SMTP_HOST',
            'SMTP_PORT',
            'SMTP_USER',
            'SMTP_PASS',
            'SMTP_FROM'
        ];

        try {
            this.validateConfiguration(requiredConfig);
        } catch (error) {
            throw new Error(`BrevoService configuration error: ${error.message}`);
        }
    }

    async _testConnection() {
        try {
            await this.transporter.verify();
        } catch (error) {
            throw new Error(`SMTP connection failed: ${error.message}`);
        }
    }

    _generateEmailOTP() {
        return Math.floor(100000 + Math.random() * 900000).toString();
    }

    _storeOTPCode(email, code, expiresAt) {
        this.emailCodes.set(email, {
            code,
            expiresAt,
            attempts: 0,
            createdAt: Date.now()
        });
    }

    _removeOTPCode(email) {
        this.emailCodes.delete(email);
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

    _incrementAttempts(email, data) {
        data.attempts++;
        this.emailCodes.set(email, data);
    }

    async _sendEmail(to, subject, htmlContent, textContent = null) {
        try {
            this.logInfo(`Sending email to ${to} via Brevo`);

            this._validateInput({ to, subject, htmlContent }, {
                to: { required: true, type: 'string', pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ },
                subject: { required: true, type: 'string', minLength: 1 },
                htmlContent: { required: true, type: 'string', minLength: 1 }
            });

            const mailOptions = {
                from: this.fromEmail,
                to: to.toLowerCase().trim(),
                subject: subject,
                html: htmlContent,
                text: textContent || this._stripHtmlTags(htmlContent)
            };

            const result = await this.transporter.sendMail(mailOptions);

            this.logInfo(`Email sent successfully to ${to}`, { messageId: result.messageId });
            return result;
        } catch (error) {
            if (error.responseCode) {
                throw this._handleSmtpError(error);
            }
            throw error;
        }
    }

    _handleSmtpError(error) {
        const errorCode = error.responseCode;
        const errorMessage = error.response;

        if (errorCode === 550) {
            return new Error('Invalid email address');
        } else if (errorCode === 554) {
            return new Error('Email service temporarily unavailable');
        } else if (errorCode === 535) {
            return new Error('SMTP authentication failed');
        } else if (errorCode === 421) {
            return new Error('Service temporarily unavailable - rate limit exceeded');
        }

        return new Error(`SMTP Error ${errorCode}: ${errorMessage}`);
    }

    _stripHtmlTags(html) {
        return html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
    }

    _generateEmailTemplate(otp) {
        const currentYear = new Date().getFullYear();

        return `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Kachingko Email Verification</title>
            <style>
                body {
                    font-family: 'Segoe UI', Arial, sans-serif;
                    line-height: 1.6;
                    color: #333;
                    max-width: 600px;
                    margin: 0 auto;
                    padding: 20px;
                    background-color: #f5f5f5;
                }
                .email-container {
                    background-color: #ffffff;
                    border-radius: 10px;
                    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
                    overflow: hidden;
                }
                .header {
                    background: linear-gradient(135deg, #007bff, #0056b3);
                    color: white;
                    padding: 30px 20px;
                    text-align: center;
                }
                .header h1 {
                    margin: 0;
                    font-size: 28px;
                    font-weight: 600;
                }
                .content {
                    padding: 40px 30px;
                }
                .otp-section {
                    text-align: center;
                    margin: 30px 0;
                }
                .otp-code {
                    font-size: 36px;
                    font-weight: bold;
                    color: #007bff;
                    letter-spacing: 8px;
                    margin: 20px 0;
                    padding: 20px;
                    background: linear-gradient(135deg, #e3f2fd, #f8f9ff);
                    border-radius: 12px;
                    border: 2px solid #007bff;
                    display: inline-block;
                    min-width: 200px;
                }
                .warning {
                    background-color: #fff8e1;
                    color: #f57f17;
                    padding: 20px;
                    border-radius: 8px;
                    margin: 25px 0;
                    border-left: 4px solid #ffc107;
                }
                .warning strong {
                    color: #e65100;
                }
                .info-box {
                    background-color: #f0f8ff;
                    padding: 20px;
                    border-radius: 8px;
                    margin: 20px 0;
                    border-left: 4px solid #007bff;
                }
                .footer {
                    background-color: #f8f9fa;
                    text-align: center;
                    padding: 25px;
                    font-size: 14px;
                    color: #6c757d;
                    border-top: 1px solid #dee2e6;
                }
                .button {
                    display: inline-block;
                    padding: 12px 24px;
                    background-color: #007bff;
                    color: white;
                    text-decoration: none;
                    border-radius: 6px;
                    font-weight: 500;
                    margin: 10px 0;
                }
                @media (max-width: 600px) {
                    body { padding: 10px; }
                    .content { padding: 20px 15px; }
                    .otp-code { font-size: 28px; letter-spacing: 4px; }
                }
            </style>
        </head>
        <body>
            <div class="email-container">
                <div class="header">
                    <h1>🔐 Kachingko</h1>
                    <p style="margin: 10px 0 0 0; font-size: 16px; opacity: 0.9;">Email Verification Required</p>
                </div>
                
                <div class="content">
                    <h2 style="color: #333; margin-bottom: 20px;">Verify Your Email Address</h2>
                    <p>Hello,</p>
                    <p>You've requested to verify your email address for your Kachingko account. Please use the verification code below to complete the process:</p>
                    
                    <div class="otp-section">
                        <div class="otp-code">${otp}</div>
                        <p style="color: #666; margin-top: 15px;"><strong>This code expires in 5 minutes</strong></p>
                    </div>
                    
                    <div class="info-box">
                        <p style="margin: 0;"><strong>📱 How to use this code:</strong></p>
                        <p style="margin: 5px 0 0 0;">Enter this 6-digit code in the Kachingko app or website when prompted for email verification.</p>
                    </div>
                    
                    <div class="warning">
                        <strong>⚠️ Security Notice:</strong> Never share this verification code with anyone. Kachingko staff will never ask for this code via phone, email, or any other method.
                    </div>
                    
                    <p>If you didn't request this verification, please ignore this email. If you have concerns about your account security, please contact our support team immediately.</p>
                    
                    <p style="margin-top: 30px;">
                        Best regards,<br>
                        <strong>The Kachingko Security Team</strong>
                    </p>
                </div>
                
                <div class="footer">
                    <p style="margin: 0 0 10px 0;">This is an automated security message. Please do not reply to this email.</p>
                    <p style="margin: 0;">&copy; ${currentYear} Kachingko. All rights reserved.</p>
                </div>
            </div>
        </body>
        </html>`;
    }

    _generateWelcomeTemplate(email, phoneNumber) {
        const currentYear = new Date().getFullYear();

        return `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Welcome to Kachingko!</title>
            <style>
                body {
                    font-family: 'Segoe UI', Arial, sans-serif;
                    line-height: 1.6;
                    color: #333;
                    max-width: 600px;
                    margin: 0 auto;
                    padding: 20px;
                    background-color: #f5f5f5;
                }
                .email-container {
                    background-color: #ffffff;
                    border-radius: 10px;
                    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
                    overflow: hidden;
                }
                .header {
                    background: linear-gradient(135deg, #28a745, #20c997);
                    color: white;
                    padding: 40px 30px;
                    text-align: center;
                }
                .content {
                    padding: 40px 30px;
                }
                .success-badge {
                    background-color: #d4edda;
                    color: #155724;
                    padding: 15px 20px;
                    border-radius: 8px;
                    text-align: center;
                    margin: 20px 0;
                    border: 1px solid #c3e6cb;
                }
                .account-details {
                    background-color: #f8f9fa;
                    padding: 20px;
                    border-radius: 8px;
                    margin: 20px 0;
                    border-left: 4px solid #007bff;
                }
                .footer {
                    background-color: #f8f9fa;
                    text-align: center;
                    padding: 25px;
                    color: #6c757d;
                    border-top: 1px solid #dee2e6;
                }
            </style>
        </head>
        <body>
            <div class="email-container">
                <div class="header">
                    <h1 style="margin: 0; font-size: 32px;">🎉 Welcome to Kachingko!</h1>
                    <p style="margin: 15px 0 0 0; font-size: 18px; opacity: 0.9;">Your account is ready!</p>
                </div>
                
                <div class="content">
                    <div class="success-badge">
                        <strong>✅ Email Verification Complete!</strong>
                    </div>
                    
                    <h2 style="color: #333; margin-bottom: 20px;">Account Successfully Created</h2>
                    
                    <p>Congratulations! Your Kachingko account has been successfully created and your email has been verified.</p>
                    
                    <div class="account-details">
                        <h3 style="margin-top: 0; color: #007bff;">Account Details</h3>
                        <p><strong>📱 Phone Number:</strong> ${phoneNumber}</p>
                        <p><strong>📧 Email Address:</strong> ${email}</p>
                        <p><strong>🔒 Status:</strong> Fully Verified</p>
                    </div>
                    
                    <h3>What's Next?</h3>
                    <ul style="padding-left: 20px;">
                        <li>Start exploring all Kachingko features</li>
                        <li>Set up your preferences</li>
                        <li>Begin using secure transactions</li>
                        <li>Enjoy seamless digital payments</li>
                    </ul>
                    
                    <p>If you have any questions or need assistance, our support team is here to help!</p>
                    
                    <p style="margin-top: 30px;">
                        Welcome aboard!<br>
                        <strong>The Kachingko Team</strong>
                    </p>
                </div>
                
                <div class="footer">
                    <p style="margin: 0 0 10px 0;">Thank you for choosing Kachingko!</p>
                    <p style="margin: 0;">&copy; ${currentYear} Kachingko. All rights reserved.</p>
                </div>
            </div>
        </body>
        </html>`;
    }
}

module.exports = BrevoService;