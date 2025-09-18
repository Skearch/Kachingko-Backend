const JwtService = require('../utils/JwtService');
const Account = require('../models/Account');
const logger = require('../utils/Logger');

class AuthMiddleware {
    static async authenticate(req, res, next) {
        try {
            const jwtService = new JwtService();
            const token = jwtService.extractTokenFromHeader(req.headers.authorization);
            const decoded = jwtService.verifyToken(token);

            const account = await Account.findByPhoneNumber(decoded.phoneNumber);
            if (!account) {
                return res.status(401).json({
                    success: false,
                    message: 'Account not found'
                });
            }

            if (!account.smsVerified) {
                return res.status(401).json({
                    success: false,
                    message: 'Account phone number not verified'
                });
            }

            req.user = {
                phoneNumber: account.phoneNumber,
                accountId: account.id,
                smsVerified: account.smsVerified,
                emailVerified: account.emailVerified,
                fullyVerified: account.fullyVerified
            };

            logger.info(`Authenticated user: ${account.phoneNumber}`);
            next();
        } catch (error) {
            logger.error('Authentication failed:', error);
            return res.status(401).json({
                success: false,
                message: error.message || 'Authentication failed'
            });
        }
    }

    static requireEmailVerification(req, res, next) {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                message: 'Authentication required'
            });
        }

        if (!req.user.emailVerified) {
            return res.status(403).json({
                success: false,
                message: 'Email verification required to access this endpoint'
            });
        }

        next();
    }

    static requireFullVerification(req, res, next) {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                message: 'Authentication required'
            });
        }

        if (!req.user.fullyVerified) {
            return res.status(403).json({
                success: false,
                message: 'Full account verification required to access this endpoint'
            });
        }

        next();
    }
}

module.exports = AuthMiddleware;