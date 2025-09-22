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
        this.setupMiddleware();
    }

    setupMiddleware() {
        this.app.use(bodyParser.json());
        this.app.use(bodyParser.urlencoded({ extended: true }));

        this.app.use((req, res, next) => {
            logger.info(`${req.method} ${req.url}`, {
                body: req.body,
                params: req.params,
                query: req.query
            });
            next();
        });
    }

    async initialize() {
        try {
            await this.databaseConnection.authenticate();
            await this.databaseConnection.syncModels();
            this.setupRoutes();
            this.setupBaseRoute();
            this.setupErrorHandling();
            logger.info('Application initialized successfully');
            return this;
        } catch (error) {
            logger.error('Failed to initialize app:', error);
            throw error;
        }
    }

    setupRoutes() {
        const accountRoutes = new AccountRoutes();
        this.app.use('/api/accounts', accountRoutes.getRouter());
    }

    setupBaseRoute() {
        this.app.get('/', (req, res) => {
            res.json({
                message: 'Backend is running!',
                version: '1.0.0'
            });
        });
    }

    setupErrorHandling() {
        this.app.use(ErrorMiddleware.notFound);
        this.app.use(ErrorMiddleware.handle);
    }

    start() {
        this.app.listen(this.port, () => {
            logger.info(`Server is running on port ${this.port}`);
        });
    }
}

(async () => {
    try {
        const app = new App();
        await app.initialize();
        app.start();
    } catch (error) {
        logger.error('Failed to start application:', error);
        process.exit(1);
    }
})();

module.exports = App;