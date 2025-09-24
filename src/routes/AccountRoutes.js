const BaseRouter = require('./BaseRouter');
const AccountController = require('../controllers/AccountController');
const ValidationMiddleware = require('../middleware/ValidationMiddleware');
const AuthMiddleware = require('../middleware/AuthMiddleware');
const DeduplicationMiddleware = require('../middleware/DeduplicationMiddleware');

class AccountRoutes extends BaseRouter {
    constructor() {
        super();
        this.accountController = new AccountController();
        this._setupRoutes();
    }

    _setupRoutes() {
        this._setupPublicRoutes();
        this._setupAuthenticatedRoutes();
        this._setupEmailChangeRoutes();
    }

    _setupPublicRoutes() {
        this.router.get('/exists/:phone',
            ValidationMiddleware.validatePhoneNumber,
            this.asyncHandler(this.checkAccountExists.bind(this))
        );

        this.router.post('/send-verification',
            ValidationMiddleware.sanitizeInput,
            DeduplicationMiddleware.deduplicate(this._generateSmsKey),
            ValidationMiddleware.validatePhoneNumber,
            this.asyncHandler(this.sendVerificationCode.bind(this))
        );

        this.router.post('/verify-code',
            ValidationMiddleware.sanitizeInput,
            DeduplicationMiddleware.deduplicate(this._generateSmsVerificationKey),
            ValidationMiddleware.validatePhoneNumber,
            ValidationMiddleware.validateEmailVerification,
            this.asyncHandler(this.verifyCode.bind(this))
        );

        this.router.post('/create',
            ValidationMiddleware.sanitizeInput,
            DeduplicationMiddleware.deduplicate(this._generateAccountCreationKey),
            ValidationMiddleware.validateCreateAccount,
            this.asyncHandler(this.createAccount.bind(this))
        );

        this.router.post('/login',
            ValidationMiddleware.sanitizeInput,
            DeduplicationMiddleware.deduplicate(this._generateLoginKey),
            ValidationMiddleware.validateLoginPin,
            this.asyncHandler(this.loginWithPin.bind(this))
        );
    }

    _setupAuthenticatedRoutes() {
        this.router.get('/profile',
            AuthMiddleware.authenticate,
            this.asyncHandler(this.getProfile.bind(this))
        );

        this.router.post('/add-email',
            AuthMiddleware.authenticate,
            ValidationMiddleware.sanitizeInput,
            DeduplicationMiddleware.deduplicate(this._generateAddEmailKey),
            ValidationMiddleware.validateAddEmail,
            this.asyncHandler(this.addEmail.bind(this))
        );

        this.router.post('/send-email-verification',
            AuthMiddleware.authenticate,
            DeduplicationMiddleware.deduplicate(this._generateSendEmailVerificationKey),
            this.asyncHandler(this.sendEmailVerification.bind(this))
        );

        this.router.post('/verify-email',
            AuthMiddleware.authenticate,
            ValidationMiddleware.sanitizeInput,
            DeduplicationMiddleware.deduplicate(this._generateEmailVerificationKey),
            ValidationMiddleware.validateEmailVerification,
            this.asyncHandler(this.verifyEmail.bind(this))
        );
    }

    _setupEmailChangeRoutes() {
        this.router.post('/request-email-change',
            AuthMiddleware.authenticate,
            ValidationMiddleware.sanitizeInput,
            DeduplicationMiddleware.deduplicate(this._generateEmailChangeRequestKey),
            ValidationMiddleware.validateAddEmail,
            this.asyncHandler(this.requestEmailChange.bind(this))
        );

        this.router.post('/verify-email-change-sms',
            AuthMiddleware.authenticate,
            ValidationMiddleware.sanitizeInput,
            DeduplicationMiddleware.deduplicate(this._generateSmsVerifyChangeKey),
            ValidationMiddleware.validateEmailVerification,
            this.asyncHandler(this.verifyEmailChangeSms.bind(this))
        );

        this.router.post('/verify-email-change-email',
            AuthMiddleware.authenticate,
            ValidationMiddleware.sanitizeInput,
            DeduplicationMiddleware.deduplicate(this._generateEmailVerifyChangeKey),
            ValidationMiddleware.validateEmailVerification,
            this.asyncHandler(this.verifyEmailChangeEmail.bind(this))
        );
    }

    _generateSmsKey(req) {
        return `send-sms-${req.body.phoneNumber}`;
    }

    _generateSmsVerificationKey(req) {
        return `verify-sms-${req.body.phoneNumber}-${req.body.code}`;
    }

    _generateAccountCreationKey(req) {
        return `create-account-${req.body.phoneNumber}`;
    }

    _generateLoginKey(req) {
        return `login-${req.body.phoneNumber}`;
    }

    _generateAddEmailKey(req) {
        return `add-email-${req.user.phoneNumber}`;
    }

    _generateSendEmailVerificationKey(req) {
        return `send-email-verify-${req.user.phoneNumber}`;
    }

    _generateEmailVerificationKey(req) {
        return `email-verify-${req.user.phoneNumber}-${req.body.code}`;
    }

    _generateEmailChangeRequestKey(req) {
        return `email-change-request-${req.user.phoneNumber}`;
    }

    _generateSmsVerifyChangeKey(req) {
        return `sms-verify-${req.user.phoneNumber}-${req.body.code}`;
    }

    _generateEmailVerifyChangeKey(req) {
        return `email-verify-${req.user.phoneNumber}-${req.body.code}`;
    }

    async checkAccountExists(req, res) {
        try {
            const exists = await this.accountController.checkAccountExists(req.params.phone);
            res.json(this.successResponse({ exists }, 'Account existence checked'));
        } catch (error) {
            res.status(400).json(this.errorResponse(error.message));
        }
    }

    async sendVerificationCode(req, res) {
        try {
            const { phoneNumber } = req.body;
            const result = await this.accountController.sendVerificationCode(phoneNumber);
            res.json(this.successResponse(result, 'Verification code sent'));
        } catch (error) {
            res.status(400).json(this.errorResponse(error.message));
        }
    }

    async verifyCode(req, res) {
        try {
            const { phoneNumber, code } = req.body;
            const verified = await this.accountController.verifyCode(phoneNumber, code);
            res.json(this.successResponse({ verified }, 'Code verification completed'));
        } catch (error) {
            res.status(400).json(this.errorResponse(error.message));
        }
    }

    async createAccount(req, res) {
        try {
            const result = await this.accountController.createAccount(req.body);
            res.status(201).json(this.successResponse(result, 'Account created successfully'));
        } catch (error) {
            const statusCode = error.message.includes('already exists') ? 409 : 400;
            res.status(statusCode).json(this.errorResponse(error.message));
        }
    }

    async loginWithPin(req, res) {
        try {
            const { phoneNumber, pin } = req.body;
            const result = await this.accountController.loginWithPin(phoneNumber, pin);
            res.json(this.successResponse(result, 'Login successful'));
        } catch (error) {
            const statusCode = error.message.includes('not found') ? 404 : 401;
            res.status(statusCode).json(this.errorResponse(error.message));
        }
    }

    async getProfile(req, res) {
        try {
            const result = await this.accountController.getProfile(req.user.phoneNumber);
            res.json(this.successResponse(result, 'Profile retrieved successfully'));
        } catch (error) {
            res.status(404).json(this.errorResponse(error.message));
        }
    }

    async addEmail(req, res) {
        try {
            const { email } = req.body;
            const result = await this.accountController.addEmail(req.user.phoneNumber, email);
            res.json(this.successResponse(result, 'Email added successfully'));
        } catch (error) {
            const statusCode = error.message.includes('already in use') ? 409 : 400;
            res.status(statusCode).json(this.errorResponse(error.message));
        }
    }

    async sendEmailVerification(req, res) {
        try {
            const result = await this.accountController.sendEmailVerification(req.user.phoneNumber);
            res.json(this.successResponse(result, 'Email verification sent'));
        } catch (error) {
            res.status(400).json(this.errorResponse(error.message));
        }
    }

    async verifyEmail(req, res) {
        try {
            const { code } = req.body;
            const verified = await this.accountController.verifyEmail(req.user.phoneNumber, code);
            res.json(this.successResponse({ verified }, 'Email verification completed'));
        } catch (error) {
            res.status(400).json(this.errorResponse(error.message));
        }
    }

    async requestEmailChange(req, res) {
        try {
            const { email } = req.body;
            const result = await this.accountController.requestEmailChange(req.user.phoneNumber, email);
            res.json(this.successResponse(result, 'Email change request initiated'));
        } catch (error) {
            const statusCode = error.message.includes('already in use') ? 409 : 400;
            res.status(statusCode).json(this.errorResponse(error.message));
        }
    }

    async verifyEmailChangeSms(req, res) {
        try {
            const { code } = req.body;
            const result = await this.accountController.verifyEmailChangeSms(req.user.phoneNumber, code);
            res.json(this.successResponse(result, 'SMS verification completed'));
        } catch (error) {
            res.status(400).json(this.errorResponse(error.message));
        }
    }

    async verifyEmailChangeEmail(req, res) {
        try {
            const { code } = req.body;
            const result = await this.accountController.verifyEmailChangeNewEmail(req.user.phoneNumber, code);
            res.json(this.successResponse(result, 'Email change completed'));
        } catch (error) {
            res.status(400).json(this.errorResponse(error.message));
        }
    }
}

module.exports = AccountRoutes;