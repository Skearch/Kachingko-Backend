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

            this._validateRateLimit(account);
            const result = await this.smsService.sendOTP(normalizedPhone);
            await this._updateVerificationTimestamp(account);

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
            await this._validateUniqueAccount(phoneNumber);
            const newAccount = await this._createNewAccount(phoneNumber, pin);
            const token = this._generateAuthToken(newAccount);

            return {
                account: newAccount.toSafeJSON(),
                token
            };
        } catch (error) {
            throw this.handleError(error, 'Failed to create account');
        }
    }

    async loginWithPin(phoneNumber, pin) {
        try {
            const account = await this._findAndValidateAccount(phoneNumber);
            this._validateAccountStatus(account);
            this._validatePin(account, pin);

            const token = this._generateAuthToken(account);

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
            const account = await this._findAndValidateAccount(phoneNumber);
            await account.updateEmail(email);
            return account.toSafeJSON();
        } catch (error) {
            throw this.handleError(error, 'Failed to add email');
        }
    }

    async sendEmailVerification(phoneNumber) {
        try {
            const account = await this._findAndValidateAccount(phoneNumber);
            this._validateEmailForVerification(account);
            this._validateEmailRateLimit(account);

            const result = await this.emailService.sendEmailOTP(account.email);
            await this._updateEmailVerificationTimestamp(account);

            return result;
        } catch (error) {
            throw this.handleError(error, 'Failed to send email verification');
        }
    }

    async verifyEmail(phoneNumber, code) {
        try {
            const account = await this._findAndValidateAccount(phoneNumber);
            this._validateEmailForVerification(account);
            this._validateEmailAttempts(account);

            const verification = await this.emailService.verifyEmailOTP(account.email, code);

            if (verification.status === 'approved') {
                await account.markEmailAsVerified();
                await this._sendWelcomeEmailSafely(account);
                return true;
            }

            await this._handleFailedEmailVerification(account, verification);
            return false;
        } catch (error) {
            throw this.handleError(error, 'Failed to verify email');
        }
    }

    async requestEmailChange(phoneNumber, newEmail) {
        try {
            const account = await this._findAndValidateAccount(phoneNumber);
            this._validateEmailChange(account, newEmail);

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
            const account = await this._findAndValidateAccount(phoneNumber);
            this._validateEmailChangeStep(account, 'sms_pending');

            const verification = await this.smsService.verifyOTP(phoneNumber, code);
            if (verification.status !== 'approved') {
                throw new Error('Invalid SMS verification code');
            }

            await this._progressEmailChangeToEmailStep(account);

            return {
                message: 'SMS verified successfully. Email verification code sent to new email address.'
            };
        } catch (error) {
            throw this.handleError(error, 'Failed to verify SMS for email change');
        }
    }

    async verifyEmailChangeNewEmail(phoneNumber, code) {
        try {
            const account = await this._findAndValidateAccount(phoneNumber);

            if (this._isEmailChangeCompleted(account)) {
                return this._getCompletedEmailChangeResponse(account);
            }

            this._validateEmailChangeStep(account, 'email_pending');

            const verification = await this.emailService.verifyEmailOTP(account.pendingEmail, code);
            if (verification.status !== 'approved') {
                throw new Error(verification.message || 'Invalid email verification code');
            }

            await this._completeEmailChange(account);

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
            const account = await this._findAndValidateAccount(phoneNumber);
            return { account: account.toSafeJSON() };
        } catch (error) {
            throw this.handleError(error, 'Failed to get profile');
        }
    }

    _validateRateLimit(account) {
        if (account && !account.canSendVerification()) {
            const timeLeft = 60000 - (new Date() - account.lastVerificationSent);
            const secondsLeft = Math.ceil(timeLeft / 1000);
            throw new Error(`Please wait ${secondsLeft} seconds before requesting another code`);
        }
    }

    async _updateVerificationTimestamp(account) {
        if (account) {
            account.lastVerificationSent = new Date();
            await account.save();
        }
    }

    async _validateUniqueAccount(phoneNumber) {
        const existingAccount = await Account.findByPhoneNumber(phoneNumber);
        if (existingAccount) {
            throw new Error('Account already exists with this phone number');
        }
    }

    async _createNewAccount(phoneNumber, pin) {
        return await Account.createAccount({
            phoneNumber,
            pin,
            smsVerified: true
        });
    }

    _generateAuthToken(account) {
        return this.jwtService.generateToken({
            phoneNumber: account.phoneNumber,
            accountId: account.id,
            smsVerified: account.smsVerified,
            emailVerified: account.emailVerified,
            fullyVerified: account.fullyVerified
        });
    }

    async _findAndValidateAccount(phoneNumber) {
        const account = await Account.findByPhoneNumber(phoneNumber);
        if (!account) {
            throw new Error('Account not found');
        }
        return account;
    }

    _validateAccountStatus(account) {
        if (!account.smsVerified) {
            throw new Error('Account phone number not verified');
        }
    }

    _validatePin(account, pin) {
        if (!account.validatePin(pin)) {
            throw new Error('Invalid PIN');
        }
    }

    _validateEmailForVerification(account) {
        if (!account.email) {
            throw new Error('No email address found for this account');
        }

        if (account.emailVerified) {
            throw new Error('Email is already verified');
        }
    }

    _validateEmailRateLimit(account) {
        if (!account.canSendEmailVerification()) {
            const timeLeft = 60000 - (new Date() - account.lastEmailVerificationSent);
            const secondsLeft = Math.ceil(timeLeft / 1000);
            throw new Error(`Please wait ${secondsLeft} seconds before requesting another email verification code`);
        }
    }

    async _updateEmailVerificationTimestamp(account) {
        account.lastEmailVerificationSent = new Date();
        await account.save();
    }

    _validateEmailAttempts(account) {
        if (account.emailVerificationAttempts >= 5) {
            throw new Error('Too many email verification attempts. Please request a new code.');
        }
    }

    async _sendWelcomeEmailSafely(account) {
        try {
            await this.emailService.sendWelcomeEmail(account.email, account.phoneNumber);
        } catch (welcomeError) {
            this.logError('Failed to send welcome email', welcomeError);
        }
    }

    async _handleFailedEmailVerification(account, verification) {
        account.emailVerificationAttempts += 1;
        await account.save();

        if (verification.status === 'failed') {
            throw new Error(verification.message);
        } else if (verification.status === 'expired') {
            throw new Error('Verification code has expired. Please request a new one.');
        }
    }

    _validateEmailChange(account, newEmail) {
        if (account.email === newEmail) {
            throw new Error('New email cannot be the same as current email');
        }
    }

    _validateEmailChangeStep(account, expectedStep) {
        if (account.emailChangeVerificationStep !== expectedStep) {
            const stepMessages = {
                'sms_pending': 'No email change request pending SMS verification',
                'email_pending': 'Email verification not ready. Complete SMS verification first.'
            };
            throw new Error(stepMessages[expectedStep]);
        }
    }

    async _progressEmailChangeToEmailStep(account) {
        account.emailChangeVerificationStep = 'email_pending';
        await account.save();

        await this.emailService.sendEmailOTP(account.pendingEmail);
        account.lastEmailVerificationSent = new Date();
        await account.save();
    }

    _isEmailChangeCompleted(account) {
        return account.emailChangeVerificationStep === 'completed' ||
            account.emailChangeVerificationStep === 'none';
    }

    _getCompletedEmailChangeResponse(account) {
        return {
            message: 'Email change already completed!',
            newEmail: account.email
        };
    }

    async _completeEmailChange(account) {
        account.email = account.pendingEmail;
        account.pendingEmail = null;
        account.emailVerified = true;
        account.emailChangeVerificationStep = 'none';
        account.emailVerificationAttempts = 0;
        await account.save();
    }
}

module.exports = AccountController;