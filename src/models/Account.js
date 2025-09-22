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
                        const phoneRegex = /^(\+63|63|0)?[89]\d{9}$/;
                        if (!phoneRegex.test(value.replace(/[\s-()]/g, ''))) {
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
                defaultValue: 0
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
                    len: [6, 6]
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
                defaultValue: 0
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
                beforeCreate: (account) => {
                    account.phoneNumber = Account.normalizePhoneNumber(account.phoneNumber);
                },
                beforeUpdate: (account) => {
                    if (account.changed('phoneNumber')) {
                        account.phoneNumber = Account.normalizePhoneNumber(account.phoneNumber);
                    }
                }
            }
        });
    }

    static normalizePhoneNumber(phoneNumber) {
        let cleaned = phoneNumber.replace(/\D/g, '');

        if (cleaned.startsWith('0')) {
            return '+63' + cleaned.substring(1);
        }

        if (cleaned.startsWith('63')) {
            return '+' + cleaned;
        }

        if (!cleaned.startsWith('+63')) {
            return '+63' + cleaned;
        }

        return cleaned;
    }

    canSendVerification() {
        if (!this.lastVerificationSent) return true;

        const now = new Date();
        const oneMinute = 60 * 1000;
        return (now - this.lastVerificationSent) > oneMinute;
    }

    canSendEmailVerification() {
        if (!this.lastEmailVerificationSent) return true;

        const now = new Date();
        const oneMinute = 60 * 1000;
        return (now - this.lastEmailVerificationSent) > oneMinute;
    }

    static async findByPhoneNumber(phoneNumber) {
        const normalizedPhone = Account.normalizePhoneNumber(phoneNumber);
        return await this.findOne({ where: { phoneNumber: normalizedPhone } });
    }

    static async createAccount(accountData) {
        return await this.create(accountData);
    }

    validatePin(inputPin) {
        return this.pin === inputPin;
    }

    markSmsAsVerified() {
        this.smsVerified = true;
        this.verificationAttempts = 0;
        return this.save();
    }

    markEmailAsVerified() {
        this.emailVerified = true;
        this.emailVerificationAttempts = 0;
        return this.save();
    }

    markAsFullyVerified() {
        this.fullyVerified = true;
        this.kycStatus = 'approved';
        return this.save();
    }

    async updateEmail(newEmail) {
        this.email = newEmail;
        this.emailVerified = false;
        this.emailVerificationAttempts = 0;
        return this.save();
    }

    toSafeJSON() {
        const { pin, ...safeData } = this.toJSON();
        return safeData;
    }
}

module.exports = Account;