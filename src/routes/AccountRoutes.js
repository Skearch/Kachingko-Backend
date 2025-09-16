const BaseRouter = require('./BaseRouter');
const AccountController = require('../controllers/AccountController');
const ValidationMiddleware = require('../middleware/ValidationMiddleware');

class AccountRoutes extends BaseRouter {
    constructor() {
        super();
        this.accountController = new AccountController();
        this.setupRoutes();
    }

    setupRoutes() {
        this.router.get('/exists/:phone',
            ValidationMiddleware.validatePhoneNumber,
            this.asyncHandler(this.checkAccountExists.bind(this))
        );

        this.router.post('/send-verification',
            ValidationMiddleware.validatePhoneNumber,
            this.asyncHandler(this.sendVerificationCode.bind(this))
        );

        this.router.post('/verify-code',
            ValidationMiddleware.validatePhoneNumber,
            this.asyncHandler(this.verifyCode.bind(this))
        );

        this.router.post('/create',
            ValidationMiddleware.validateCreateAccount,
            this.asyncHandler(this.createAccount.bind(this))
        );

        this.router.post('/login',
            ValidationMiddleware.validateLoginPin,
            this.asyncHandler(this.loginWithPin.bind(this))
        );

        this.router.post('/add-email',
            ValidationMiddleware.validateAddEmail,
            this.asyncHandler(this.addEmail.bind(this))
        );

        this.router.post('/send-email-verification',
            ValidationMiddleware.validatePhoneNumber,
            this.asyncHandler(this.sendEmailVerification.bind(this))
        );

        this.router.post('/verify-email',
            ValidationMiddleware.validateEmailVerification,
            this.asyncHandler(this.verifyEmail.bind(this))
        );
    }

    async checkAccountExists(req, res) {
        const exists = await this.accountController.checkAccountExists(req.params.phone);
        res.json(this.successResponse({ exists }, 'Account existence checked'));
    }

    async sendVerificationCode(req, res) {
        const { phoneNumber } = req.body;
        const result = await this.accountController.sendVerificationCode(phoneNumber);
        res.json(this.successResponse(result, 'Verification code sent'));
    }

    async verifyCode(req, res) {
        const { phoneNumber, code } = req.body;
        const verified = await this.accountController.verifyCode(phoneNumber, code);
        res.json(this.successResponse({ verified }, 'Code verification completed'));
    }

    async createAccount(req, res) {
        const account = await this.accountController.createAccount(req.body);
        res.json(this.successResponse(account, 'Account created successfully'));
    }

    async loginWithPin(req, res) {
        const { phoneNumber, pin } = req.body;
        const result = await this.accountController.loginWithPin(phoneNumber, pin);
        res.json(this.successResponse(result, 'Login successful'));
    }

    async addEmail(req, res) {
        const { phoneNumber, email } = req.body;
        const result = await this.accountController.addEmail(phoneNumber, email);
        res.json(this.successResponse(result, 'Email added successfully'));
    }

    async sendEmailVerification(req, res) {
        const { phoneNumber } = req.body;
        const result = await this.accountController.sendEmailVerification(phoneNumber);
        res.json(this.successResponse(result, 'Email verification sent'));
    }

    async verifyEmail(req, res) {
        const { phoneNumber, code } = req.body;
        const verified = await this.accountController.verifyEmail(phoneNumber, code);
        res.json(this.successResponse({ verified }, 'Email verification completed'));
    }
}

module.exports = AccountRoutes;