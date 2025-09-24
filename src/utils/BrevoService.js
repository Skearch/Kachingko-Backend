const BaseService = require('./BaseService');
const nodemailer = require('nodemailer');

class BrevoService extends BaseService {
    constructor() {
        super();
        this.smsService = new SemaphoreService();
        this.emailService = new BrevoService();
        this.jwtService = new JwtService();

        this.transporter = this.createTransporter();
        this.fromEmail = process.env.SMTP_FROM;

        this.emailCodes = new Map();

        this.logInfo('Brevo email service initialized');
    }

    createTransporter() {
        return nodemailer.createTransporter({
            host: process.env.SMTP_HOST,
            port: parseInt(process.env.SMTP_PORT) || 587,
            secure: process.env.SMTP_SECURE === 'true',
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASS
            }
        });
    }

    generateEmailOTP() {
        return Math.floor(100000 + Math.random() * 900000).toString();
    }

    async sendEmail(to, subject, htmlContent, textContent = null) {
        try {
            this.logInfo(`Sending email to ${to} via Brevo`);

            const mailOptions = {
                from: this.fromEmail,
                to: to,
                subject: subject,
                html: htmlContent,
                text: textContent || htmlContent.replace(/<[^>]*>/g, '') 
            };

            const result = await this.transporter.sendMail(mailOptions);

            this.logInfo(`Email sent successfully to ${to}`, { messageId: result.messageId });
            return result;
        } catch (error) {
            if (error.response) {
                const errorCode = error.response.split(' ')[0];
                if (errorCode === '550') {
                    throw new Error('Invalid email address');
                } else if (errorCode === '554') {
                    throw new Error('Email service temporarily unavailable');
                }
            }
            this.handleServiceError(error, 'Email sending');
        }
    }

    async sendEmailOTP(email) {
        try {
            this.logInfo(`Generating and sending email OTP to ${email}`);

            const otp = this.generateEmailOTP();
            const expiresAt = Date.now() + (5 * 60 * 1000);

            this.emailCodes.set(email, {
                code: otp,
                expiresAt,
                attempts: 0
            });

            const subject = 'Kachingko Email Verification Code';
            const htmlContent = this.generateEmailTemplate(otp);

            const result = await this.sendEmail(email, subject, htmlContent);

            return {
                status: 'pending',
                to: email,
                messageId: result.messageId
            };
        } catch (error) {
            this.handleServiceError(error, 'Email OTP sending');
        }
    }

    async verifyEmailOTP(email, code) {
        try {
            this.logInfo(`Verifying email OTP for ${email}`);

            const storedData = this.emailCodes.get(email);
            if (!storedData) {
                return { status: 'expired', message: 'No verification code found or expired' };
            }

            if (Date.now() > storedData.expiresAt) {
                this.emailCodes.delete(email);
                return { status: 'expired', message: 'Verification code has expired' };
            }

            if (storedData.attempts >= 3) {
                this.emailCodes.delete(email);
                return { status: 'failed', message: 'Too many failed attempts' };
            }

            if (storedData.code === code) {
                this.emailCodes.delete(email);
                this.logInfo(`Email OTP verification successful for ${email}`);
                return { status: 'approved', message: 'Email verified successfully' };
            } else {
                storedData.attempts++;
                this.emailCodes.set(email, storedData);
                return { status: 'failed', message: 'Invalid verification code' };
            }
        } catch (error) {
            this.handleServiceError(error, 'Email OTP verification');
        }
    }

    generateEmailTemplate(otp) {
        return `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Kachingko Email Verification</title>
            <style>
                body {
                    font-family: Arial, sans-serif;
                    line-height: 1.6;
                    color: #333;
                    max-width: 600px;
                    margin: 0 auto;
                    padding: 20px;
                }
                .header {
                    background-color: #007bff;
                    color: white;
                    padding: 20px;
                    text-align: center;
                    border-radius: 8px 8px 0 0;
                }
                .content {
                    background-color: #f9f9f9;
                    padding: 30px;
                    border-radius: 0 0 8px 8px;
                }
                .otp-code {
                    font-size: 32px;
                    font-weight: bold;
                    color: #007bff;
                    text-align: center;
                    letter-spacing: 4px;
                    margin: 20px 0;
                    padding: 15px;
                    background-color: #e3f2fd;
                    border-radius: 8px;
                    border: 2px dashed #007bff;
                }
                .warning {
                    background-color: #fff3cd;
                    color: #856404;
                    padding: 15px;
                    border-radius: 5px;
                    margin: 20px 0;
                    border: 1px solid #ffeaa7;
                }
                .footer {
                    text-align: center;
                    margin-top: 30px;
                    font-size: 14px;
                    color: #666;
                }
            </style>
        </head>
        <body>
            <div class="header">
                <h1>Kachingko</h1>
                <p>Email Verification Required</p>
            </div>
            <div class="content">
                <h2>Your Verification Code</h2>
                <p>Hello,</p>
                <p>You have requested to verify your email address for your Kachingko account. Please use the verification code below:</p>
                
                <div class="otp-code">${otp}</div>
                
                <p>This verification code will expire in <strong>5 minutes</strong>.</p>
                
                <div class="warning">
                    <strong>⚠️ Important:</strong> Do not share this code with anyone. Kachingko will never ask you for this code via phone or email.
                </div>
                
                <p>If you didn't request this verification, please ignore this email or contact our support team if you have concerns.</p>
                
                <p>Thank you,<br>The Kachingko Team</p>
            </div>
            <div class="footer">
                <p>This is an automated message. Please do not reply to this email.</p>
                <p>&copy; 2025 Kachingko. All rights reserved.</p>
            </div>
        </body>
        </html>
        `;
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
            this.logInfo(`Cleaned up ${cleaned} expired email OTP codes`);
        }
    }

    async testConnection() {
        try {
            await this.transporter.verify();
            this.logInfo('Brevo SMTP connection verified successfully');
            return { status: 'connected', message: 'SMTP connection successful' };
        } catch (error) {
            this.handleServiceError(error, 'SMTP connection test');
        }
    }

    async sendCustomEmail(to, subject, htmlContent) {
        try {
            return await this.sendEmail(to, subject, htmlContent);
        } catch (error) {
            this.handleServiceError(error, 'Custom email sending');
        }
    }

    async sendWelcomeEmail(email, phoneNumber) {
        try {
            const subject = 'Welcome to Kachingko!';
            const htmlContent = `
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                    .header { background-color: #007bff; color: white; padding: 20px; text-align: center; }
                    .content { padding: 20px; background-color: #f9f9f9; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>Welcome to Kachingko!</h1>
                    </div>
                    <div class="content">
                        <h2>Account Created Successfully</h2>
                        <p>Your account has been created with phone number: <strong>${phoneNumber}</strong></p>
                        <p>Your email <strong>${email}</strong> has been successfully verified.</p>
                        <p>You can now enjoy all the features of Kachingko!</p>
                        <p>Best regards,<br>The Kachingko Team</p>
                    </div>
                </div>
            </body>
            </html>
            `;

            return await this.sendEmail(email, subject, htmlContent);
        } catch (error) {
            this.handleServiceError(error, 'Welcome email sending');
        }
    }
}

module.exports = BrevoService;