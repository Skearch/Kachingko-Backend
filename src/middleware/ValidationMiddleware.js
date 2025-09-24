const logger = require('../utils/Logger');

class ValidationMiddleware {
    static validatePhoneNumber(req, res, next) {
        try {
            const phoneNumber = req.body.phoneNumber || req.params.phone;

            if (!ValidationMiddleware._isFieldPresent(phoneNumber)) {
                return ValidationMiddleware._sendValidationError(res, 'Phone number is required');
            }

            if (!ValidationMiddleware._isValidPhilippinesPhoneNumber(phoneNumber)) {
                return ValidationMiddleware._sendValidationError(res,
                    'Invalid Philippines phone number format. Use format: +639XXXXXXXXX, 09XXXXXXXXX, or 639XXXXXXXXX'
                );
            }

            next();
        } catch (error) {
            ValidationMiddleware._handleValidationError(res, error, 'Phone number validation');
        }
    }

    static validateCreateAccount(req, res, next) {
        try {
            const { phoneNumber, pin } = req.body;
            const requiredFields = ['phoneNumber', 'pin'];

            const missingFields = ValidationMiddleware._findMissingFields(req.body, requiredFields);
            if (missingFields.length > 0) {
                return ValidationMiddleware._sendValidationError(res,
                    `Missing required fields: ${missingFields.join(', ')}`
                );
            }

            if (!ValidationMiddleware._isValidPhilippinesPhoneNumber(phoneNumber)) {
                return ValidationMiddleware._sendValidationError(res,
                    'Invalid Philippines phone number format'
                );
            }

            if (!ValidationMiddleware._isValidPin(pin)) {
                return ValidationMiddleware._sendValidationError(res,
                    'PIN must be exactly 6 digits'
                );
            }

            next();
        } catch (error) {
            ValidationMiddleware._handleValidationError(res, error, 'Account creation validation');
        }
    }

    static validateLoginPin(req, res, next) {
        try {
            const { phoneNumber, pin } = req.body;
            const requiredFields = ['phoneNumber', 'pin'];

            const missingFields = ValidationMiddleware._findMissingFields(req.body, requiredFields);
            if (missingFields.length > 0) {
                return ValidationMiddleware._sendValidationError(res,
                    `Missing required fields: ${missingFields.join(', ')}`
                );
            }

            if (!ValidationMiddleware._isValidPhilippinesPhoneNumber(phoneNumber)) {
                return ValidationMiddleware._sendValidationError(res,
                    'Invalid Philippines phone number format'
                );
            }

            if (!ValidationMiddleware._isValidPin(pin)) {
                return ValidationMiddleware._sendValidationError(res,
                    'PIN must be exactly 6 digits'
                );
            }

            next();
        } catch (error) {
            ValidationMiddleware._handleValidationError(res, error, 'Login validation');
        }
    }

    static validateAddEmail(req, res, next) {
        try {
            const { email } = req.body;

            if (!ValidationMiddleware._isFieldPresent(email)) {
                return ValidationMiddleware._sendValidationError(res, 'Email is required');
            }

            if (!ValidationMiddleware._isValidEmail(email)) {
                return ValidationMiddleware._sendValidationError(res, 'Invalid email format');
            }

            next();
        } catch (error) {
            ValidationMiddleware._handleValidationError(res, error, 'Email validation');
        }
    }

    static validateEmailVerification(req, res, next) {
        try {
            const { code } = req.body;

            if (!ValidationMiddleware._isFieldPresent(code)) {
                return ValidationMiddleware._sendValidationError(res, 'Verification code is required');
            }

            if (!ValidationMiddleware._isValidVerificationCode(code)) {
                return ValidationMiddleware._sendValidationError(res,
                    'Invalid verification code format'
                );
            }

            next();
        } catch (error) {
            ValidationMiddleware._handleValidationError(res, error, 'Email verification validation');
        }
    }

    static validateRequestData(requiredFields) {
        return (req, res, next) => {
            try {
                const missingFields = ValidationMiddleware._findMissingFields(req.body, requiredFields);

                if (missingFields.length > 0) {
                    return ValidationMiddleware._sendValidationError(res,
                        `Missing required fields: ${missingFields.join(', ')}`
                    );
                }

                next();
            } catch (error) {
                ValidationMiddleware._handleValidationError(res, error, 'Request data validation');
            }
        };
    }

    static validateEmailFormat(req, res, next) {
        try {
            const { email } = req.body;

            if (email && !ValidationMiddleware._isValidEmail(email)) {
                return ValidationMiddleware._sendValidationError(res, 'Invalid email format');
            }

            next();
        } catch (error) {
            ValidationMiddleware._handleValidationError(res, error, 'Email format validation');
        }
    }

    static sanitizeInput(req, res, next) {
        try {
            if (req.body.phoneNumber) {
                req.body.phoneNumber = ValidationMiddleware._sanitizePhoneNumber(req.body.phoneNumber);
            }

            if (req.body.email) {
                req.body.email = ValidationMiddleware._sanitizeEmail(req.body.email);
            }

            if (req.body.pin) {
                req.body.pin = ValidationMiddleware._sanitizePin(req.body.pin);
            }

            if (req.body.code) {
                req.body.code = ValidationMiddleware._sanitizeCode(req.body.code);
            }

            next();
        } catch (error) {
            ValidationMiddleware._handleValidationError(res, error, 'Input sanitization');
        }
    }

    static _isFieldPresent(field) {
        return field !== undefined && field !== null && field.toString().trim() !== '';
    }

    static _findMissingFields(data, requiredFields) {
        return requiredFields.filter(field => !ValidationMiddleware._isFieldPresent(data[field]));
    }

    static _isValidPhilippinesPhoneNumber(phoneNumber) {
        if (!phoneNumber) return false;
        const phoneRegex = /^(\+63|63|0)?[89]\d{9}$/;
        return phoneRegex.test(phoneNumber.replace(/[\s-()]/g, ''));
    }

    static _isValidEmail(email) {
        if (!email) return false;
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email.trim());
    }

    static _isValidPin(pin) {
        if (!pin) return false;
        const pinStr = pin.toString().trim();
        return pinStr.length === 6 && /^\d{6}$/.test(pinStr);
    }

    static _isValidVerificationCode(code) {
        if (!code) return false;
        const codeStr = code.toString().trim();
        return codeStr.length >= 4 && codeStr.length <= 8 && /^\d+$/.test(codeStr);
    }

    static _sanitizePhoneNumber(phoneNumber) {
        return phoneNumber.toString().trim().replace(/[\s-()]/g, '');
    }

    static _sanitizeEmail(email) {
        return email.toString().trim().toLowerCase();
    }

    static _sanitizePin(pin) {
        return pin.toString().trim();
    }

    static _sanitizeCode(code) {
        return code.toString().trim();
    }

    static _sendValidationError(res, message) {
        logger.warn(`Validation failed: ${message}`);
        return res.status(400).json({
            success: false,
            message,
            error: 'VALIDATION_ERROR'
        });
    }

    static _handleValidationError(res, error, context) {
        logger.error(`${context} error:`, error);
        return res.status(500).json({
            success: false,
            message: 'Internal validation error',
            error: 'INTERNAL_ERROR'
        });
    }

    static normalizePhilippinesPhoneNumber(phoneNumber) {
        if (!phoneNumber) return null;

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

    static createCustomValidator(validatorFunction, errorMessage) {
        return (req, res, next) => {
            try {
                if (!validatorFunction(req.body)) {
                    return ValidationMiddleware._sendValidationError(res, errorMessage);
                }
                next();
            } catch (error) {
                ValidationMiddleware._handleValidationError(res, error, 'Custom validation');
            }
        };
    }

    static validateMultipleFields(fieldValidators) {
        return (req, res, next) => {
            try {
                for (const [fieldName, validator] of Object.entries(fieldValidators)) {
                    const fieldValue = req.body[fieldName];

                    if (!validator.required && !ValidationMiddleware._isFieldPresent(fieldValue)) {
                        continue;
                    }

                    if (validator.required && !ValidationMiddleware._isFieldPresent(fieldValue)) {
                        return ValidationMiddleware._sendValidationError(res,
                            `${fieldName} is required`
                        );
                    }

                    if (validator.validate && !validator.validate(fieldValue)) {
                        return ValidationMiddleware._sendValidationError(res,
                            validator.message || `Invalid ${fieldName} format`
                        );
                    }
                }

                next();
            } catch (error) {
                ValidationMiddleware._handleValidationError(res, error, 'Multiple fields validation');
            }
        };
    }
}

module.exports = ValidationMiddleware;