const BaseController = require('./BaseController');
const Account = require('../models/Account');
const SemaphoreService = require('../utils/SemaphoreService');
const BrevoService = require('../utils/BrevoService');
const JwtService = require('../utils/JwtService');

class AccountController extends BaseController {
    constructor() {
        super();
        this.smsService = new SemaphoreService();
        this.emailService = new BrevoService();
        this.jwtService = new JwtService();
    }

    async checkAccountExists(phoneNumber) {
        try {
            const account = await Account.findByPhoneNumber(phoneNumber);
            return account !== null;
        } catch (error) {
            throw this.handleError(error, 'Failed to check account existence');
        }
    }

    async sendVerificationCode(phoneNumber) {
        try {
            const normalizedPhone = Account.normalizePhoneNumber(phoneNumber);
            const account = await Account.findByPhoneNumber(normalizedPhone);

            if (account && !account.canSendVerification()) {
                const timeLeft = 60000 - (new Date() - account.lastVerificationSent);
                const secondsLeft = Math.ceil(timeLeft / 1000);
                throw new Error(`Please wait ${secondsLeft} seconds before requesting another code`);
            }

            const result = await this.smsService.sendOTP(normalizedPhone);

            if (account) {
                account.lastVerificationSent = new Date();
                await account.save();
            }

            return result;
        } catch (error) {
            throw this.handleError(error, 'Failed to send verification code');
        }
    }

    async verifyCode(phoneNumber, code) {
        try {
            const normalizedPhone = Account.normalizePhoneNumber(phoneNumber);
            const verification = await this.smsService.verifyOTP(normalizedPhone, code);
            return verification.status === 'approved';
        } catch (error) {
            throw this.handleError(error, 'Failed to verify code');
        }
    }

    async createAccount({ phoneNumber, pin }) {
        try {
            const existingAccount = await Account.findByPhoneNumber(phoneNumber);
            if (existingAccount) {
                throw new Error('Account already exists with this phone number');
            }

            const newAccount = await Account.createAccount({
                phoneNumber,
                pin,
                smsVerified: true
            });

            return newAccount.toSafeJSON();
        } catch (error) {
            throw this.handleError(error, 'Failed to create account');
        }
    }

    async loginWithPin(phoneNumber, pin) {
        try {
            const account = await Account.findByPhoneNumber(phoneNumber);
            if (!account) {
                throw new Error('Account not found');
            }

            if (!account.smsVerified) {
                throw new Error('Account phone number not verified');
            }

            if (!account.validatePin(pin)) {
                throw new Error('Invalid PIN');
            }

            const token = this.jwtService.generateToken({
                phoneNumber: account.phoneNumber,
                accountId: account.id,
                smsVerified: account.smsVerified,
                emailVerified: account.emailVerified,
                fullyVerified: account.fullyVerified
            });

            return {
                account: account.toSafeJSON(),
                token,
                message: 'Login successful'
            };
        } catch (error) {
            throw this.handleError(error, 'Failed to login');
        }
    }

    async addEmail(phoneNumber, email) {
        try {
            const account = await Account.findByPhoneNumber(phoneNumber);
            if (!account) {
                throw new Error('Account not found');
            }

            await account.updateEmail(email);
            return account.toSafeJSON();
        } catch (error) {
            throw this.handleError(error, 'Failed to add email');
        }
    }

    async sendEmailVerification(phoneNumber) {
        try {
            const account = await Account.findByPhoneNumber(phoneNumber);
            if (!account) {
                throw new Error('Account not found');
            }

            if (!account.email) {
                throw new Error('No email address found for this account');
            }

            if (account.emailVerified) {
                throw new Error('Email is already verified');
            }

            if (!account.canSendEmailVerification()) {
                const timeLeft = 60000 - (new Date() - account.lastEmailVerificationSent);
                const secondsLeft = Math.ceil(timeLeft / 1000);
                throw new Error(`Please wait ${secondsLeft} seconds before requesting another email verification code`);
            }

            const result = await this.emailService.sendEmailOTP(account.email);
            account.lastEmailVerificationSent = new Date();
            await account.save();

            return result;
        } catch (error) {
            throw this.handleError(error, 'Failed to send email verification');
        }
    }

    async createAccount({ phoneNumber, pin }) {
        try {
            const existingAccount = await Account.findByPhoneNumber(phoneNumber);
            if (existingAccount) {
                throw new Error('Account already exists with this phone number');
            }

            const newAccount = await Account.createAccount({
                phoneNumber,
                pin,
                smsVerified: true
            });

            const token = this.jwtService.generateToken({
                phoneNumber: newAccount.phoneNumber,
                accountId: newAccount.id,
                smsVerified: newAccount.smsVerified
            });

            return {
                account: newAccount.toSafeJSON(),
                token,
            };
        } catch (error) {
            throw this.handleError(error, 'Failed to create account');
        }
    }

    async verifyEmail(phoneNumber, code) {
        try {
            const account = await Account.findByPhoneNumber(phoneNumber);
            if (!account) {
                throw new Error('Account not found');
            }

            if (!account.email) {
                throw new Error('No email address found for this account');
            }

            if (account.emailVerificationAttempts >= 5) {
                throw new Error('Too many email verification attempts. Please request a new code.');
            }

            const verification = await this.emailService.verifyEmailOTP(account.email, code);

            if (verification.status === 'approved') {
                await account.markEmailAsVerified();

                try {
                    await this.emailService.sendWelcomeEmail(account.email, account.phoneNumber);
                } catch (welcomeError) {
                    this.logError('Failed to send welcome email', welcomeError);
                }

                return true;
            } else {
                account.emailVerificationAttempts += 1;
                await account.save();

                if (verification.status === 'failed') {
                    throw new Error(verification.message);
                } else if (verification.status === 'expired') {
                    throw new Error('Verification code has expired. Please request a new one.');
                }

                return false;
            }
        } catch (error) {
            throw this.handleError(error, 'Failed to verify email');
        }
    }

    async requestEmailChange(phoneNumber, newEmail) {
        try {
            const account = await Account.findByPhoneNumber(phoneNumber);
            if (!account) {
                throw new Error('Account not found');
            }

            if (account.email === newEmail) {
                throw new Error('New email cannot be the same as current email');
            }

            account.pendingEmail = newEmail;
            account.emailChangeVerificationStep = 'sms_pending';
            await account.save();

            return { message: 'Email change requested. SMS verification required first.' };
        } catch (error) {
            throw this.handleError(error, 'Failed to request email change');
        }
    }

    async verifyEmailChangeSms(phoneNumber, code) {
        try {
            const account = await Account.findByPhoneNumber(phoneNumber);
            if (!account) {
                throw new Error('Account not found');
            }

            if (account.emailChangeVerificationStep !== 'sms_pending') {
                throw new Error('No email change request pending SMS verification');
            }

            const verification = await this.smsService.verifyOTP(phoneNumber, code);
            if (verification.status !== 'approved') {
                throw new Error('Invalid SMS verification code');
            }

            account.emailChangeVerificationStep = 'email_pending';
            await account.save();

            await this.emailService.sendEmailOTP(account.pendingEmail);
            account.lastEmailVerificationSent = new Date();
            await account.save();

            return {
                message: 'SMS verified successfully. Email verification code sent to new email address.'
            };
        } catch (error) {
            throw this.handleError(error, 'Failed to verify SMS for email change');
        }
    }

    async verifyEmailChangeNewEmail(phoneNumber, code) {
        try {
            const account = await Account.findByPhoneNumber(phoneNumber);
            if (!account) {
                throw new Error('Account not found');
            }

            if (account.emailChangeVerificationStep === 'completed' ||
                account.emailChangeVerificationStep === 'none') {
                return {
                    message: 'Email change already completed!',
                    newEmail: account.email
                };
            }

            if (account.emailChangeVerificationStep !== 'email_pending') {
                throw new Error('Email verification not ready. Complete SMS verification first.');
            }

            const verification = await this.emailService.verifyEmailOTP(account.pendingEmail, code);
            if (verification.status !== 'approved') {
                throw new Error(verification.message || 'Invalid email verification code');
            }

            account.email = account.pendingEmail;
            account.pendingEmail = null;
            account.emailVerified = true;
            account.emailChangeVerificationStep = 'none';
            account.emailVerificationAttempts = 0;
            await account.save();

            return {
                message: 'Email changed successfully!',
                newEmail: account.email
            };
        } catch (error) {
            throw this.handleError(error, 'Failed to verify new email for email change');
        }
    }

    async getProfile(phoneNumber) {
        try {
            this.logInfo('Fetching profile for', { phoneNumber });
            const account = await Account.findByPhoneNumber(phoneNumber);
            if (!account) {
                throw new Error('Account not found');
            }
            return {
                account: account.toSafeJSON()
            };
        } catch (error) {
            throw this.handleError(error, 'Failed to get profile');
        }
    }
}

module.exports = AccountController;