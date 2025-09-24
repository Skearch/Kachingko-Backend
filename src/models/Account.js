const { DataTypes, Model } = require('sequelize');

class Account extends Model {
    static init(sequelize) {
        return super.init({
            phoneNumber: {
                type: DataTypes.STRING,
                allowNull: false,
                unique: true,
                validate: {
                    notEmpty: true,
                    isValidPhilippinesPhoneNumber(value) {
                        if (!Account._isValidPhilippinesPhoneNumber(value)) {
                            throw new Error('Invalid Philippines phone number format. Use format: +639XXXXXXXXX, 09XXXXXXXXX, or 639XXXXXXXXX');
                        }
                    }
                }
            },
            lastVerificationSent: {
                type: DataTypes.DATE,
                allowNull: true
            },
            verificationAttempts: {
                type: DataTypes.INTEGER,
                defaultValue: 0,
                validate: {
                    min: 0,
                    max: 10
                }
            },
            smsVerified: {
                type: DataTypes.BOOLEAN,
                defaultValue: false
            },
            pin: {
                type: DataTypes.STRING,
                allowNull: false,
                validate: {
                    notEmpty: true,
                    len: [6, 6],
                    isNumeric: true
                }
            },
            email: {
                type: DataTypes.STRING,
                allowNull: true,
                validate: {
                    isEmail: true
                }
            },
            pendingEmail: {
                type: DataTypes.STRING,
                allowNull: true,
                validate: {
                    isEmail: true
                }
            },
            emailChangeVerificationStep: {
                type: DataTypes.STRING,
                defaultValue: 'none',
                validate: {
                    isIn: [['none', 'sms_pending', 'email_pending', 'completed']]
                }
            },
            emailVerified: {
                type: DataTypes.BOOLEAN,
                defaultValue: false
            },
            lastEmailVerificationSent: {
                type: DataTypes.DATE,
                allowNull: true
            },
            emailVerificationAttempts: {
                type: DataTypes.INTEGER,
                defaultValue: 0,
                validate: {
                    min: 0,
                    max: 10
                }
            },
            fullyVerified: {
                type: DataTypes.BOOLEAN,
                defaultValue: false
            },
            kycStatus: {
                type: DataTypes.STRING,
                defaultValue: 'not_submitted',
                validate: {
                    isIn: [['not_submitted', 'pending', 'approved', 'rejected']]
                }
            },
            kycSubmittedAt: {
                type: DataTypes.DATE,
                allowNull: true
            }
        }, {
            sequelize,
            modelName: 'Account',
            tableName: 'accounts',
            timestamps: true,
            hooks: {
                beforeCreate: Account._normalizePhoneNumberHook,
                beforeUpdate: Account._normalizePhoneNumberHook,
                afterUpdate: Account._updateFullyVerifiedStatus
            },
            indexes: [
                {
                    unique: true,
                    fields: ['phoneNumber']
                },
                {
                    fields: ['email']
                },
                {
                    fields: ['smsVerified']
                },
                {
                    fields: ['emailVerified']
                },
                {
                    fields: ['fullyVerified']
                },
                {
                    fields: ['kycStatus']
                },
                {
                    fields: ['createdAt']
                }
            ]
        });
    }

    static _normalizePhoneNumberHook(account) {
        account.phoneNumber = Account.normalizePhoneNumber(account.phoneNumber);
        if (account.changed && account.changed('phoneNumber')) {
            account.phoneNumber = Account.normalizePhoneNumber(account.phoneNumber);
        }
    }

    static _updateFullyVerifiedStatus(account) {
        const wasFullyVerified = account._previousDataValues?.fullyVerified || false;
        const isNowFullyVerified = account.smsVerified && account.emailVerified;

        if (!wasFullyVerified && isNowFullyVerified) {
            account.fullyVerified = true;
        } else if (wasFullyVerified && !isNowFullyVerified) {
            account.fullyVerified = false;
        }
    }

    static normalizePhoneNumber(phoneNumber) {
        if (!phoneNumber) return null;

        let cleaned = phoneNumber.replace(/\D/g, '');

        if (cleaned.startsWith('0')) {
            return '+63' + cleaned.substring(1);
        }

        if (cleaned.startsWith('63') && !cleaned.startsWith('+63')) {
            return '+' + cleaned;
        }

        if (!cleaned.startsWith('+63')) {
            return '+63' + cleaned;
        }

        return cleaned;
    }

    static _isValidPhilippinesPhoneNumber(phoneNumber) {
        if (!phoneNumber) return false;
        const phoneRegex = /^(\+63|63|0)?[89]\d{9}$/;
        return phoneRegex.test(phoneNumber.replace(/[\s-()]/g, ''));
    }

    canSendVerification() {
        if (!this.lastVerificationSent) return true;
        return this._isWithinRateLimit(this.lastVerificationSent, 1);
    }

    canSendEmailVerification() {
        if (!this.lastEmailVerificationSent) return true;
        return this._isWithinRateLimit(this.lastEmailVerificationSent, 1);
    }

    _isWithinRateLimit(lastSent, limitInMinutes = 1) {
        const now = new Date();
        const limitInMs = limitInMinutes * 60 * 1000;
        return (now - new Date(lastSent)) >= limitInMs;
    }

    getRemainingCooldown(type = 'sms') {
        const lastSent = type === 'email' ? this.lastEmailVerificationSent : this.lastVerificationSent;
        if (!lastSent) return 0;

        const now = new Date();
        const oneMinute = 60 * 1000;
        const timePassed = now - new Date(lastSent);
        const remaining = oneMinute - timePassed;

        return Math.max(0, Math.ceil(remaining / 1000));
    }

    static async findByPhoneNumber(phoneNumber) {
        if (!phoneNumber) return null;
        const normalizedPhone = Account.normalizePhoneNumber(phoneNumber);
        return await this.findOne({ where: { phoneNumber: normalizedPhone } });
    }

    static async findByEmail(email) {
        if (!email) return null;
        return await this.findOne({ where: { email: email.toLowerCase().trim() } });
    }

    static async createAccount(accountData) {
        const normalizedData = {
            ...accountData,
            phoneNumber: Account.normalizePhoneNumber(accountData.phoneNumber),
            email: accountData.email ? accountData.email.toLowerCase().trim() : null
        };

        return await this.create(normalizedData);
    }

    static async findActiveAccounts() {
        return await this.findAll({
            where: {
                smsVerified: true
            },
            order: [['updatedAt', 'DESC']]
        });
    }

    static async findFullyVerifiedAccounts() {
        return await this.findAll({
            where: {
                fullyVerified: true
            },
            order: [['updatedAt', 'DESC']]
        });
    }

    static async getAccountStats() {
        const total = await this.count();
        const smsVerified = await this.count({ where: { smsVerified: true } });
        const emailVerified = await this.count({ where: { emailVerified: true } });
        const fullyVerified = await this.count({ where: { fullyVerified: true } });
        const kycApproved = await this.count({ where: { kycStatus: 'approved' } });

        return {
            total,
            smsVerified,
            emailVerified,
            fullyVerified,
            kycApproved,
            completionRate: total > 0 ? ((fullyVerified / total) * 100).toFixed(2) : 0
        };
    }

    validatePin(inputPin) {
        if (!inputPin || typeof inputPin !== 'string') return false;
        return this.pin === inputPin.trim();
    }

    async updatePin(newPin) {
        if (!newPin || typeof newPin !== 'string' || newPin.length !== 6 || !/^\d{6}$/.test(newPin)) {
            throw new Error('PIN must be exactly 6 digits');
        }

        this.pin = newPin;
        return await this.save();
    }

    async markSmsAsVerified() {
        this.smsVerified = true;
        this.verificationAttempts = 0;
        this.lastVerificationSent = null;
        return await this.save();
    }

    async markEmailAsVerified() {
        this.emailVerified = true;
        this.emailVerificationAttempts = 0;
        this.lastEmailVerificationSent = null;
        return await this.save();
    }

    async markAsFullyVerified() {
        this.fullyVerified = true;
        this.smsVerified = true;
        this.emailVerified = true;
        return await this.save();
    }

    async updateKycStatus(status, submittedAt = null) {
        const validStatuses = ['not_submitted', 'pending', 'approved', 'rejected'];
        if (!validStatuses.includes(status)) {
            throw new Error(`Invalid KYC status. Must be one of: ${validStatuses.join(', ')}`);
        }

        this.kycStatus = status;
        if (submittedAt) {
            this.kycSubmittedAt = submittedAt;
        }

        if (status === 'approved') {
            this.fullyVerified = true;
        }

        return await this.save();
    }

    async updateEmail(newEmail) {
        if (!newEmail || typeof newEmail !== 'string') {
            throw new Error('Valid email address is required');
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        const normalizedEmail = newEmail.toLowerCase().trim();

        if (!emailRegex.test(normalizedEmail)) {
            throw new Error('Invalid email format');
        }

        const existingAccount = await Account.findByEmail(normalizedEmail);
        if (existingAccount && existingAccount.id !== this.id) {
            throw new Error('Email address is already in use by another account');
        }

        this.email = normalizedEmail;
        this.emailVerified = false;
        this.emailVerificationAttempts = 0;
        this.lastEmailVerificationSent = null;

        return await this.save();
    }

    async startEmailChangeProcess(newEmail) {
        if (!newEmail || typeof newEmail !== 'string') {
            throw new Error('Valid email address is required');
        }

        const normalizedEmail = newEmail.toLowerCase().trim();

        if (this.email === normalizedEmail) {
            throw new Error('New email cannot be the same as current email');
        }

        const existingAccount = await Account.findByEmail(normalizedEmail);
        if (existingAccount && existingAccount.id !== this.id) {
            throw new Error('Email address is already in use by another account');
        }

        this.pendingEmail = normalizedEmail;
        this.emailChangeVerificationStep = 'sms_pending';

        return await this.save();
    }

    async completeEmailChange() {
        if (this.emailChangeVerificationStep !== 'email_pending') {
            throw new Error('Email change process not in correct state');
        }

        this.email = this.pendingEmail;
        this.pendingEmail = null;
        this.emailVerified = true;
        this.emailChangeVerificationStep = 'none';
        this.emailVerificationAttempts = 0;
        this.lastEmailVerificationSent = null;

        return await this.save();
    }

    async incrementVerificationAttempts(type = 'sms') {
        if (type === 'email') {
            this.emailVerificationAttempts += 1;
        } else {
            this.verificationAttempts += 1;
        }

        return await this.save();
    }

    async resetVerificationAttempts(type = 'sms') {
        if (type === 'email') {
            this.emailVerificationAttempts = 0;
            this.lastEmailVerificationSent = null;
        } else {
            this.verificationAttempts = 0;
            this.lastVerificationSent = null;
        }

        return await this.save();
    }

    isVerificationLimited(type = 'sms') {
        const maxAttempts = 5;
        const attempts = type === 'email' ? this.emailVerificationAttempts : this.verificationAttempts;
        return attempts >= maxAttempts;
    }

    getVerificationStatus() {
        return {
            smsVerified: this.smsVerified,
            emailVerified: this.emailVerified,
            fullyVerified: this.fullyVerified,
            kycStatus: this.kycStatus,
            hasEmail: !!this.email,
            verificationAttempts: this.verificationAttempts,
            emailVerificationAttempts: this.emailVerificationAttempts,
            canSendSmsVerification: this.canSendVerification(),
            canSendEmailVerification: this.canSendEmailVerification(),
            smsRemainingCooldown: this.getRemainingCooldown('sms'),
            emailRemainingCooldown: this.getRemainingCooldown('email')
        };
    }

    toSafeJSON() {
        const { pin, ...safeData } = this.toJSON();
        return {
            ...safeData,
            verificationStatus: this.getVerificationStatus()
        };
    }

    toPublicJSON() {
        return {
            id: this.id,
            phoneNumber: this.phoneNumber,
            email: this.email,
            smsVerified: this.smsVerified,
            emailVerified: this.emailVerified,
            fullyVerified: this.fullyVerified,
            kycStatus: this.kycStatus,
            createdAt: this.createdAt,
            updatedAt: this.updatedAt
        };
    }
}

module.exports = Account;