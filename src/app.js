require('dotenv').config();

const express = require('express');
const bodyParser = require('body-parser');
const DatabaseConnection = require('./config/DatabaseConnection');
const AccountRoutes = require('./routes/AccountRoutes');
const ErrorMiddleware = require('./middleware/ErrorMiddleware');
const logger = require('./utils/Logger');

class App {
    constructor() {
        this.app = express();
        this.port = process.env.PORT || 3000;
        this.databaseConnection = new DatabaseConnection();
        this.cleanupInterval = null;
        this.isInitialized = false;
        this._setupMiddleware();
    }

    _setupMiddleware() {
        this.app.use(bodyParser.json({ limit: '10mb' }));
        this.app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));

        this.app.use((req, res, next) => {
            const startTime = Date.now();

            logger.info(`${req.method} ${req.url}`, {
                body: this._sanitizeRequestBody(req.body),
                params: req.params,
                query: req.query,
                ip: req.ip,
                userAgent: req.get('User-Agent')
            });

            const originalSend = res.send;
            res.send = function (data) {
                const duration = Date.now() - startTime;
                logger.info(`${req.method} ${req.url} - ${res.statusCode} - ${duration}ms`);
                originalSend.call(this, data);
            };

            next();
        });

        this.app.use((req, res, next) => {
            res.setHeader('X-Content-Type-Options', 'nosniff');
            res.setHeader('X-Frame-Options', 'DENY');
            res.setHeader('X-XSS-Protection', '1; mode=block');
            res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
            next();
        });
    }

    _setupCleanupInterval() {
        try {
            const SemaphoreService = require('./utils/SemaphoreService');
            const BrevoService = require('./utils/BrevoService');

            const smsService = new SemaphoreService();
            const emailService = new BrevoService();

            this.cleanupInterval = setInterval(() => {
                try {
                    const smsCleanedCount = smsService.cleanupExpiredCodes();
                    const emailCleanedCount = emailService.cleanupExpiredCodes();

                    if (smsCleanedCount > 0 || emailCleanedCount > 0) {
                        logger.info(`Cleanup completed - SMS: ${smsCleanedCount}, Email: ${emailCleanedCount} expired codes removed`);
                    }
                } catch (error) {
                    logger.error('Error during cleanup process:', error);
                }
            }, 10 * 60 * 1000);
            logger.info('Cleanup interval setup successfully - runs every 10 minutes');
        } catch (error) {
            logger.error('Failed to setup cleanup interval:', error);
            throw error;
        }
    }

    async initialize() {
        if (this.isInitialized) {
            logger.warn('Application already initialized');
            return this;
        }

        try {
            logger.info('Initializing application...');

            await this._initializeDatabase();

            await this._initializeServices();

            this._setupRoutes();
            this._setupBaseRoute();
            this._setupHealthCheck();
            this._setupErrorHandling();
            this._setupCleanupInterval();

            this.isInitialized = true;
            logger.info('Application initialized successfully');
            return this;
        } catch (error) {
            logger.error('Failed to initialize app:', error);
            throw error;
        }
    }

    async _initializeDatabase() {
        try {
            logger.info('Connecting to database...');
            await this.databaseConnection.authenticate();
            await this.databaseConnection.syncModels();
            logger.info('Database connected and synced successfully');
        } catch (error) {
            logger.error('Database initialization failed:', error);
            throw new Error(`Database initialization failed: ${error.message}`);
        }
    }

    async _initializeServices() {
        try {
            logger.info('Initializing services...');

            const SemaphoreService = require('./utils/SemaphoreService');
            const BrevoService = require('./utils/BrevoService');
            const JwtService = require('./utils/JwtService');

            const smsService = new SemaphoreService();
            const emailService = new BrevoService();
            const jwtService = new JwtService();

            const initResults = await Promise.allSettled([
                smsService.initialize(),
                emailService.initialize(),
                jwtService.initialize()
            ]);

            const jwtResult = initResults[2];
            if (jwtResult.status === 'rejected') {
                throw new Error(`Critical JWT service failed to initialize: ${jwtResult.reason.message}`);
            }

            const smsResult = initResults[0];
            if (smsResult.status === 'rejected') {
                logger.warn('SMS service failed to initialize - SMS functionality will be limited:', smsResult.reason.message);
            }

            const emailResult = initResults[1];
            if (emailResult.status === 'rejected') {
                logger.warn('Email service failed to initialize - Email functionality will be limited:', emailResult.reason.message);
            }

            logger.info('Service initialization completed');
        } catch (error) {
            logger.error('Service initialization failed:', error);
            throw new Error(`Service initialization failed: ${error.message}`);
        }
    }

    _setupRoutes() {
        try {
            logger.info('Setting up routes...');

            const accountRoutes = new AccountRoutes();
            this.app.use('/api/accounts', accountRoutes.getRouter());

            logger.info('Routes setup successfully');
        } catch (error) {
            logger.error('Failed to setup routes:', error);
            throw error;
        }
    }

    _setupBaseRoute() {
        this.app.get('/', (req, res) => {
            res.json({
                message: 'Kachingko Backend is running!',
                version: '1.0.0',
                status: 'healthy',
                timestamp: new Date().toISOString(),
                environment: process.env.NODE_ENV || 'development'
            });
        });
    }

    _setupHealthCheck() {
        this.app.get('/health', async (req, res) => {
            try {
                const health = await this._performHealthCheck();
                res.status(health.status === 'healthy' ? 200 : 503).json(health);
            } catch (error) {
                logger.error('Health check failed:', error);
                res.status(503).json({
                    status: 'unhealthy',
                    timestamp: new Date().toISOString(),
                    error: error.message
                });
            }
        });
    }

    async _performHealthCheck() {
        const startTime = Date.now();

        try {
            await this.databaseConnection.authenticate();

            const SemaphoreService = require('./utils/SemaphoreService');
            const BrevoService = require('./utils/BrevoService');
            const JwtService = require('./utils/JwtService');

            const smsService = new SemaphoreService();
            const emailService = new BrevoService();
            const jwtService = new JwtService();

            const [smsHealth, emailHealth, jwtHealth] = await Promise.allSettled([
                smsService.healthCheck(),
                emailService.healthCheck(),
                jwtService.healthCheck()
            ]);

            const responseTime = Date.now() - startTime;

            return {
                status: 'healthy',
                timestamp: new Date().toISOString(),
                uptime: process.uptime(),
                responseTime: `${responseTime}ms`,
                version: '1.0.0',
                environment: process.env.NODE_ENV || 'development',
                services: {
                    database: 'connected',
                    sms: smsHealth.status === 'fulfilled' ? 'healthy' : 'unhealthy',
                    email: emailHealth.status === 'fulfilled' ? 'healthy' : 'unhealthy',
                    jwt: jwtHealth.status === 'fulfilled' ? 'healthy' : 'unhealthy'
                },
                memory: process.memoryUsage(),
                pid: process.pid
            };
        } catch (error) {
            return {
                status: 'unhealthy',
                timestamp: new Date().toISOString(),
                error: error.message,
                responseTime: `${Date.now() - startTime}ms`
            };
        }
    }

    _setupErrorHandling() {
        this.app.use(ErrorMiddleware.notFound);

        this.app.use(ErrorMiddleware.handle);

        this._setupProcessErrorHandlers();
    }

    _setupProcessErrorHandlers() {
        process.on('uncaughtException', (error) => {
            logger.error('Uncaught Exception:', error);
            this._gracefulShutdown('uncaughtException');
        });

        process.on('unhandledRejection', (reason, promise) => {
            logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
            this._gracefulShutdown('unhandledRejection');
        });

        process.on('SIGTERM', () => {
            logger.info('SIGTERM received');
            this._gracefulShutdown('SIGTERM');
        });

        process.on('SIGINT', () => {
            logger.info('SIGINT received');
            this._gracefulShutdown('SIGINT');
        });
    }

    async _gracefulShutdown(signal) {
        logger.info(`${signal} received. Starting graceful shutdown...`);

        try {
            if (this.cleanupInterval) {
                clearInterval(this.cleanupInterval);
                logger.info('Cleanup interval cleared');
            }

            if (this.databaseConnection) {
                await this.databaseConnection.close();
                logger.info('Database connection closed');
            }

            if (this.server) {
                this.server.close(() => {
                    logger.info('HTTP server closed');
                    process.exit(0);
                });
            } else {
                process.exit(0);
            }
        } catch (error) {
            logger.error('Error during graceful shutdown:', error);
            process.exit(1);
        }
    }

    _sanitizeRequestBody(body) {
        if (!body || typeof body !== 'object') {
            return body;
        }

        const sensitiveFields = ['pin', 'password', 'token', 'secret'];
        const sanitized = { ...body };

        Object.keys(sanitized).forEach(key => {
            if (sensitiveFields.some(field => key.toLowerCase().includes(field))) {
                sanitized[key] = '[REDACTED]';
            }
        });

        return sanitized;
    }

    start() {
        if (!this.isInitialized) {
            throw new Error('Application must be initialized before starting');
        }

        this.server = this.app.listen(this.port, () => {
            logger.info(`🚀 Kachingko Backend is running on port ${this.port}`);
            logger.info(`📱 API Base URL: http://localhost:${this.port}/api`);
            logger.info(`💓 Health Check: http://localhost:${this.port}/health`);
            logger.info(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);

            if (process.env.NODE_ENV !== 'production') {
                logger.info(`🔍 Visit http://localhost:${this.port} to check server status`);
            }
        });

        this.server.on('error', (error) => {
            if (error.code === 'EADDRINUSE') {
                logger.error(`Port ${this.port} is already in use`);
            } else {
                logger.error('Server error:', error);
            }
            process.exit(1);
        });

        return this.server;
    }

    getApp() {
        return this.app;
    }

    getServer() {
        return this.server;
    }
}

(async () => {
    try {
        logger.info('🏁 Starting Kachingko Backend...');
        const app = new App();
        await app.initialize();
        app.start();
    } catch (error) {
        logger.error('❌ Failed to start application:', error);
        logger.error('Stack trace:', error.stack);
        process.exit(1);
    }
})();

module.exports = App;