const JwtService = require('../utils/JwtService');
const Account = require('../models/Account');
const logger = require('../utils/Logger');

class AuthMiddleware {
    constructor() {
        this.jwtService = new JwtService();
    }

    static getInstance() {
        if (!AuthMiddleware.instance) {
            AuthMiddleware.instance = new AuthMiddleware();
        }
        return AuthMiddleware.instance;
    }

    async authenticate(req, res, next) {
        try {
            const token = this._extractToken(req.headers.authorization);
            const decoded = this._verifyToken(token);
            const account = await this._findAccount(decoded.phoneNumber);

            this._validateAccount(account);
            this._attachUserToRequest(req, account);

            this._logAuthSuccess(account.phoneNumber);
            next();
        } catch (error) {
            this._handleAuthError(res, error);
        }
    }

    requireEmailVerification(req, res, next) {
        try {
            this._validateUserExists(req);
            this._validateEmailVerified(req.user);
            next();
        } catch (error) {
            this._handleAuthError(res, error);
        }
    }

    requireFullVerification(req, res, next) {
        try {
            this._validateUserExists(req);
            this._validateFullVerification(req.user);
            next();
        } catch (error) {
            this._handleAuthError(res, error);
        }
    }

    requireSmsVerification(req, res, next) {
        try {
            this._validateUserExists(req);
            this._validateSmsVerified(req.user);
            next();
        } catch (error) {
            this._handleAuthError(res, error);
        }
    }

    optionalAuthentication(req, res, next) {
        try {
            const authHeader = req.headers.authorization;
            if (!authHeader) {
                req.user = null;
                return next();
            }

            const token = this._extractToken(authHeader);
            const decoded = this._verifyToken(token);

            Account.findByPhoneNumber(decoded.phoneNumber)
                .then(account => {
                    if (account && account.smsVerified) {
                        this._attachUserToRequest(req, account);
                    } else {
                        req.user = null;
                    }
                    next();
                })
                .catch(() => {
                    req.user = null;
                    next();
                });
        } catch (error) {
            req.user = null;
            next();
        }
    }

    _extractToken(authHeader) {
        if (!authHeader) {
            throw new AuthenticationError('Authorization header is required');
        }
        return this.jwtService.extractTokenFromHeader(authHeader);
    }

    _verifyToken(token) {
        try {
            return this.jwtService.verifyToken(token);
        } catch (error) {
            throw new AuthenticationError(error.message);
        }
    }

    async _findAccount(phoneNumber) {
        const account = await Account.findByPhoneNumber(phoneNumber);
        if (!account) {
            throw new AuthenticationError('Account not found');
        }
        return account;
    }

    _validateAccount(account) {
        if (!account.smsVerified) {
            throw new AuthenticationError('Account phone number not verified');
        }
    }

    _validateUserExists(req) {
        if (!req.user) {
            throw new AuthenticationError('Authentication required');
        }
    }

    _validateEmailVerified(user) {
        if (!user.emailVerified) {
            throw new AuthorizationError('Email verification required to access this endpoint');
        }
    }

    _validateFullVerification(user) {
        if (!user.fullyVerified) {
            throw new AuthorizationError('Full account verification required to access this endpoint');
        }
    }

    _validateSmsVerified(user) {
        if (!user.smsVerified) {
            throw new AuthorizationError('SMS verification required to access this endpoint');
        }
    }

    _attachUserToRequest(req, account) {
        req.user = {
            phoneNumber: account.phoneNumber,
            accountId: account.id,
            smsVerified: account.smsVerified,
            emailVerified: account.emailVerified,
            fullyVerified: account.fullyVerified,
            kycStatus: account.kycStatus
        };
    }

    _logAuthSuccess(phoneNumber) {
        logger.info(`User authenticated successfully: ${phoneNumber}`);
    }

    _handleAuthError(res, error) {
        logger.error('Authentication failed:', error);

        const statusCode = this._getErrorStatusCode(error);
        const message = error.message || 'Authentication failed';

        res.status(statusCode).json({
            success: false,
            message
        });
    }

    _getErrorStatusCode(error) {
        if (error instanceof AuthorizationError) {
            return 403;
        }
        return 401;
    }

    static authenticate(req, res, next) {
        return AuthMiddleware.getInstance().authenticate(req, res, next);
    }

    static requireEmailVerification(req, res, next) {
        return AuthMiddleware.getInstance().requireEmailVerification(req, res, next);
    }

    static requireFullVerification(req, res, next) {
        return AuthMiddleware.getInstance().requireFullVerification(req, res, next);
    }

    static requireSmsVerification(req, res, next) {
        return AuthMiddleware.getInstance().requireSmsVerification(req, res, next);
    }

    static optionalAuthentication(req, res, next) {
        return AuthMiddleware.getInstance().optionalAuthentication(req, res, next);
    }
}

class AuthenticationError extends Error {
    constructor(message) {
        super(message);
        this.name = 'AuthenticationError';
    }
}

class AuthorizationError extends Error {
    constructor(message) {
        super(message);
        this.name = 'AuthorizationError';
    }
}

AuthMiddleware.instance = null;

module.exports = AuthMiddleware;