const BaseController = require('./BaseController');
const Account = require('../models/Account');
const TwilioService = require('../utils/TwilioService');

class AccountController extends BaseController {
    constructor() {
        super();
        this.twilioService = new TwilioService();
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

            const result = await this.twilioService.sendSms(normalizedPhone);

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
            const verification = await this.twilioService.checkVerification(normalizedPhone, code);
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

            return {
                account: account.toSafeJSON(),
                verificationStatus: account.getVerificationStatus(),
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
                throw new Error('Please wait before requesting another email verification code');
            }

            const result = await this.twilioService.sendEmail(account.email);
            account.lastEmailVerificationSent = new Date();
            await account.save();

            return result;
        } catch (error) {
            throw this.handleError(error, 'Failed to send email verification');
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

            const verification = await this.twilioService.checkEmailVerification(account.email, code);

            if (verification.status === 'approved') {
                await account.markEmailAsVerified();
                return true;
            } else {
                account.emailVerificationAttempts += 1;
                await account.save();
                return false;
            }
        } catch (error) {
            throw this.handleError(error, 'Failed to verify email');
        }
    }
}

module.exports = AccountController;