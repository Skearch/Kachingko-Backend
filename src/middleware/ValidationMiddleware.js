class ValidationMiddleware {
    static validatePhoneNumber(req, res, next) {
        const phoneNumber = req.body.phoneNumber || req.params.phone;
        if (!phoneNumber) {
            return res.status(400).json({
                success: false,
                message: 'Phone number is required'
            });
        }

        const phoneRegex = /^(\+63|63|0)?[89]\d{9}$/;
        if (!phoneRegex.test(phoneNumber.replace(/[\s-()]/g, ''))) {
            return res.status(400).json({
                success: false,
                message: 'Invalid Philippines phone number format. Use format: +639XXXXXXXXX, 09XXXXXXXXX, or 639XXXXXXXXX'
            });
        }

        next();
    }

    static validateCreateAccount(req, res, next) {
        const { phoneNumber, pin } = req.body;

        if (!phoneNumber || !pin) {
            return res.status(400).json({
                success: false,
                message: 'Phone number and PIN are required'
            });
        }

        if (pin.length !== 6) {
            return res.status(400).json({
                success: false,
                message: 'PIN must be exactly 6 digits'
            });
        }

        next();
    }

    static validateLoginPin(req, res, next) {
        const { phoneNumber, pin } = req.body;

        if (!phoneNumber || !pin) {
            return res.status(400).json({
                success: false,
                message: 'Phone number and PIN are required'
            });
        }

        if (pin.length !== 6) {
            return res.status(400).json({
                success: false,
                message: 'PIN must be exactly 6 digits'
            });
        }

        next();
    }

    static validateAddEmail(req, res, next) {
        const { phoneNumber, email } = req.body;

        if (!phoneNumber || !email) {
            return res.status(400).json({
                success: false,
                message: 'Phone number and email are required'
            });
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid email format'
            });
        }

        next();
    }

    static validateEmailVerification(req, res, next) {
        const { phoneNumber, code } = req.body;

        if (!phoneNumber || !code) {
            return res.status(400).json({
                success: false,
                message: 'Phone number and verification code are required'
            });
        }

        if (code.length < 4 || code.length > 8) {
            return res.status(400).json({
                success: false,
                message: 'Invalid verification code format'
            });
        }

        next();
    }

    static normalizePhilippinesPhoneNumber(phoneNumber) {
        let cleaned = phoneNumber.replace(/\D/g, '');

        if (cleaned.startsWith('0')) {
            cleaned = '+63' + cleaned.substring(1);
        } else if (cleaned.startsWith('63')) {
            cleaned = '+' + cleaned;
        } else if (!cleaned.startsWith('+63')) {
            cleaned = '+63' + cleaned;
        }

        return cleaned;
    }
}

module.exports = ValidationMiddleware;