const { Sequelize } = require('sequelize');
const Account = require('../models/Account');
const logger = require('../utils/Logger');

class DatabaseConnection {
    static instance = null;

    constructor() {
        if (DatabaseConnection.instance) {
            return DatabaseConnection.instance;
        }

        this.sequelize = null;
        this.models = new Map();
        this.isConnected = false;
        this._initializeConnection();

        DatabaseConnection.instance = this;
    }

    static getInstance() {
        if (!DatabaseConnection.instance) {
            DatabaseConnection.instance = new DatabaseConnection();
        }
        return DatabaseConnection.instance;
    }

    _initializeConnection() {
        this.sequelize = this._createSequelizeInstance();
        this._registerModels();
    }

    _createSequelizeInstance() {
        const config = {
            dialect: 'sqlite',
            storage: this._getDatabasePath(),
            logging: this._getLoggingConfig(),
            pool: {
                max: 5,
                min: 0,
                acquire: 30000,
                idle: 10000
            },
            retry: {
                match: [/SQLITE_BUSY/],
                max: 3
            }
        };

        return new Sequelize(config);
    }

    _getDatabasePath() {
        return process.env.DATABASE_PATH || 'database.sqlite';
    }

    _getLoggingConfig() {
        const isDevelopment = process.env.NODE_ENV === 'development';
        return isDevelopment ? (sql, timing) => logger.dbLog(sql, timing) : false;
    }

    _registerModels() {
        this.models.set('Account', Account);
    }

    async authenticate() {
        if (this.isConnected) {
            return;
        }

        try {
            await this.sequelize.authenticate();
            this.isConnected = true;
            logger.info('Database connection established successfully.');
        } catch (error) {
            this.isConnected = false;
            logger.error('Unable to connect to the database:', error);
            throw new Error(`Database authentication failed: ${error.message}`);
        }
    }

    async syncModels(options = {}) {
        try {
            await this.authenticate();
            this._initializeModels();

            const syncOptions = {
                force: false,
                alter: false,
                ...options
            };

            await this.sequelize.sync(syncOptions);
            logger.info('Database models synchronized successfully.');
        } catch (error) {
            logger.error('Failed to sync database models:', error);
            throw new Error(`Model synchronization failed: ${error.message}`);
        }
    }

    _initializeModels() {
        for (const [name, model] of this.models) {
            if (this._isValidModel(model)) {
                try {
                    model.init(this.sequelize);
                    logger.debug(`Model ${name} initialized successfully`);
                } catch (error) {
                    logger.error(`Failed to initialize model ${name}:`, error);
                    throw new Error(`Model ${name} initialization failed: ${error.message}`);
                }
            }
        }
    }

    _isValidModel(model) {
        return model && typeof model.init === 'function';
    }

    getSequelize() {
        if (!this.sequelize) {
            throw new Error('Database connection not initialized');
        }
        return this.sequelize;
    }

    getModel(modelName) {
        const model = this.models.get(modelName);
        if (!model) {
            throw new Error(`Model '${modelName}' not found`);
        }
        return model;
    }

    isConnectionActive() {
        return this.isConnected && this.sequelize !== null;
    }

    async testConnection() {
        try {
            await this.sequelize.authenticate();
            return { status: 'connected', message: 'Database connection is healthy' };
        } catch (error) {
            return { status: 'disconnected', message: error.message };
        }
    }

    async close() {
        if (!this.sequelize) {
            return;
        }

        try {
            await this.sequelize.close();
            this.isConnected = false;
            logger.info('Database connection closed.');
        } catch (error) {
            logger.error('Failed to close database connection:', error);
            throw new Error(`Database closure failed: ${error.message}`);
        }
    }

    async transaction(callback) {
        if (!this.isConnectionActive()) {
            throw new Error('Database connection is not active');
        }

        return await this.sequelize.transaction(callback);
    }

    async healthCheck() {
        try {
            await this.sequelize.authenticate();
            const modelCount = this.models.size;
            return {
                status: 'healthy',
                connected: this.isConnected,
                modelsRegistered: modelCount,
                dialect: this.sequelize.getDialect()
            };
        } catch (error) {
            return {
                status: 'unhealthy',
                connected: false,
                error: error.message
            };
        }
    }
}

module.exports = DatabaseConnection;