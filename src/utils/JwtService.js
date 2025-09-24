const jwt = require('jsonwebtoken');
const BaseService = require('./BaseService');

class JwtService extends BaseService {
    constructor() {
        super();
        this.secret = process.env.JWT_SECRET || 'fallback_secret_key_change_in_production';
        this.expiresIn = process.env.JWT_EXPIRES_IN || '24h';
        this.issuer = process.env.JWT_ISSUER || 'kachingko-backend';
        this.audience = process.env.JWT_AUDIENCE || 'kachingko-app';
        this._validateConfiguration();
    }

    async initialize() {
        try {
            await super.initialize();
            this._validateSecretStrength();
            this.logInfo('JwtService initialized successfully');
        } catch (error) {
            this.serviceStatus = 'error';
            throw this.handleServiceError(error, 'service initialization');
        }
    }

    generateToken(payload) {
        return this.executeWithRetry(() => {
            this._validatePayload(payload);

            const tokenPayload = {
                ...payload,
                iat: Math.floor(Date.now() / 1000),
                jti: this._generateJwtId()
            };

            const options = {
                expiresIn: this.expiresIn,
                issuer: this.issuer,
                audience: this.audience,
                algorithm: 'HS256'
            };

            const token = jwt.sign(tokenPayload, this.secret, options);

            this.logInfo('JWT token generated successfully', {
                userId: payload.phoneNumber,
                expiresIn: this.expiresIn,
                jti: tokenPayload.jti
            });

            return token;
        }, 2, 100);
    }

    verifyToken(token) {
        try {
            this._validateTokenFormat(token);

            const options = {
                issuer: this.issuer,
                audience: this.audience,
                algorithms: ['HS256']
            };

            const decoded = jwt.verify(token, this.secret, options);

            this._validateTokenClaims(decoded);

            this.logInfo('JWT token verified successfully', {
                userId: decoded.phoneNumber,
                jti: decoded.jti
            });

            return decoded;
        } catch (error) {
            this._handleVerificationError(error);
        }
    }

    refreshToken(token) {
        try {
            const decoded = this.verifyToken(token);

            const { iat, exp, jti, ...payload } = decoded;

            return this.generateToken(payload);
        } catch (error) {
            throw this.handleServiceError(error, 'Token refresh');
        }
    }

    decodeToken(token, options = {}) {
        try {
            const decodeOptions = {
                complete: false,
                ...options
            };

            return jwt.decode(token, decodeOptions);
        } catch (error) {
            throw this.handleServiceError(error, 'Token decode');
        }
    }

    extractTokenFromHeader(authHeader) {
        try {
            this._validateAuthHeader(authHeader);

            const token = authHeader.substring(7).trim();

            if (!token) {
                throw new Error('Token is empty in authorization header');
            }

            return token;
        } catch (error) {
            throw this.handleServiceError(error, 'Token extraction');
        }
    }

    getTokenExpiration(token) {
        try {
            const decoded = this.decodeToken(token);

            if (!decoded || !decoded.exp) {
                throw new Error('Token does not contain expiration claim');
            }

            return new Date(decoded.exp * 1000);
        } catch (error) {
            throw this.handleServiceError(error, 'Get token expiration');
        }
    }

    isTokenExpired(token) {
        try {
            const expiration = this.getTokenExpiration(token);
            return Date.now() >= expiration.getTime();
        } catch (error) {
            return true;
        }
    }

    getTokenRemainingTime(token) {
        try {
            const expiration = this.getTokenExpiration(token);
            const remaining = expiration.getTime() - Date.now();

            return Math.max(0, remaining);
        } catch (error) {
            return 0;
        }
    }

    generatePasswordResetToken(payload) {
        try {
            const resetPayload = {
                ...payload,
                type: 'password_reset',
                iat: Math.floor(Date.now() / 1000)
            };

            const options = {
                expiresIn: '15m',
                issuer: this.issuer,
                audience: this.audience,
                algorithm: 'HS256'
            };

            return jwt.sign(resetPayload, this.secret, options);
        } catch (error) {
            throw this.handleServiceError(error, 'Password reset token generation');
        }
    }

    generateEmailVerificationToken(payload) {
        try {
            const verificationPayload = {
                ...payload,
                type: 'email_verification',
                iat: Math.floor(Date.now() / 1000)
            };

            const options = {
                expiresIn: '1h',
                issuer: this.issuer,
                audience: this.audience,
                algorithm: 'HS256'
            };

            return jwt.sign(verificationPayload, this.secret, options);
        } catch (error) {
            throw this.handleServiceError(error, 'Email verification token generation');
        }
    }

    async _performHealthCheck() {
        try {
            const testPayload = {
                phoneNumber: '+639123456789',
                accountId: 1,
                test: true
            };

            const token = this.generateToken(testPayload);
            const verified = this.verifyToken(token);

            if (!verified || verified.phoneNumber !== testPayload.phoneNumber) {
                throw new Error('Token generation/verification test failed');
            }

            return {
                tokenGeneration: 'working',
                tokenVerification: 'working',
                algorithm: 'HS256',
                expiresIn: this.expiresIn,
                details: 'JWT service is operational'
            };
        } catch (error) {
            return {
                tokenGeneration: 'failed',
                tokenVerification: 'failed',
                error: error.message,
                details: 'JWT service is not operational'
            };
        }
    }

    _validateConfiguration() {
        const requiredConfig = ['JWT_SECRET'];

        try {
            this.validateConfiguration(requiredConfig);
        } catch (error) {
            this.logWarn('JWT_SECRET not set, using fallback (not recommended for production)');
        }
    }

    _validateSecretStrength() {
        if (this.secret.length < 32) {
            this.logWarn('JWT secret is shorter than recommended 32 characters');
        }

        if (this.secret === 'fallback_secret_key_change_in_production') {
            this.logWarn('Using default JWT secret - change this in production!');
        }
    }

    _validatePayload(payload) {
        if (!payload || typeof payload !== 'object') {
            throw new Error('Token payload must be a non-empty object');
        }

        if (!payload.phoneNumber) {
            throw new Error('Token payload must contain phoneNumber');
        }

        if (!payload.accountId) {
            throw new Error('Token payload must contain accountId');
        }
    }

    _validateTokenFormat(token) {
        if (!token) {
            throw new Error('Token is required');
        }

        if (typeof token !== 'string') {
            throw new Error('Token must be a string');
        }

        const parts = token.split('.');
        if (parts.length !== 3) {
            throw new Error('Invalid token format - must have 3 parts separated by dots');
        }
    }

    _validateTokenClaims(decoded) {
        const now = Math.floor(Date.now() / 1000);

        if (decoded.exp && decoded.exp <= now) {
            throw new Error('Token has expired');
        }

        if (decoded.nbf && decoded.nbf > now) {
            throw new Error('Token not yet valid');
        }

        if (!decoded.phoneNumber) {
            throw new Error('Token missing required phoneNumber claim');
        }
    }

    _validateAuthHeader(authHeader) {
        if (!authHeader) {
            throw new Error('Authorization header is required');
        }

        if (typeof authHeader !== 'string') {
            throw new Error('Authorization header must be a string');
        }

        if (!authHeader.startsWith('Bearer ')) {
            throw new Error('Invalid authorization header format. Use: Bearer <token>');
        }
    }

    _handleVerificationError(error) {
        let errorMessage = 'Token verification failed';

        if (error.name === 'TokenExpiredError') {
            errorMessage = 'Token has expired';
        } else if (error.name === 'JsonWebTokenError') {
            errorMessage = 'Invalid token format or signature';
        } else if (error.name === 'NotBeforeError') {
            errorMessage = 'Token not yet valid';
        } else if (error.message) {
            errorMessage = error.message;
        }

        this.logError('Token verification failed', error);
        throw new Error(errorMessage);
    }

    _generateJwtId() {
        return Math.random().toString(36).substring(2) + Date.now().toString(36);
    }
}

module.exports = JwtService;