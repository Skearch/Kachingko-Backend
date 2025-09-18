const jwt = require('jsonwebtoken');
const BaseService = require('./BaseService');

class JwtService extends BaseService {
    constructor() {
        super();
        this.secret = process.env.JWT_SECRET || 'fallback_secret_key_change_in_production';
        this.expiresIn = process.env.JWT_EXPIRES_IN || '24h';
    }

    generateToken(payload) {
        try {
            this.logInfo('Generating JWT token', { userId: payload.phoneNumber });
            return jwt.sign(payload, this.secret, { expiresIn: this.expiresIn });
        } catch (error) {
            this.handleServiceError(error, 'Token generation');
        }
    }

    verifyToken(token) {
        try {
            this.logInfo('Verifying JWT token');
            return jwt.verify(token, this.secret);
        } catch (error) {
            if (error.name === 'TokenExpiredError') {
                throw new Error('Token has expired');
            } else if (error.name === 'JsonWebTokenError') {
                throw new Error('Invalid token');
            }
            this.handleServiceError(error, 'Token verification');
        }
    }

    extractTokenFromHeader(authHeader) {
        if (!authHeader) {
            throw new Error('Authorization header is required');
        }

        if (!authHeader.startsWith('Bearer ')) {
            throw new Error('Invalid authorization header format. Use: Bearer <token>');
        }

        return authHeader.substring(7);
    }
}

module.exports = JwtService;