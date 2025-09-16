const { Sequelize } = require('sequelize');
const Account = require('../models/Account');
const logger = require('../utils/Logger');

class DatabaseConnection {
    constructor() {
        this.sequelize = this._createSequelizeInstance();
        this.models = { Account };
    }

    _createSequelizeInstance() {
        return new Sequelize({
            dialect: 'sqlite',
            storage: 'database.sqlite',
            logging: this._getLoggingConfig()
        });
    }

    _getLoggingConfig() {
        return process.env.NODE_ENV === 'development' 
            ? (sql, timing) => logger.dbLog(sql, timing) 
            : false;
    }

    async authenticate() {
        try {
            await this.sequelize.authenticate();
            logger.info('Database connection established successfully.');
        } catch (error) {
            logger.error('Unable to connect to the database:', error);
            throw error;
        }
    }

    async syncModels() {
        try {
            this._initializeModels();
            await this.sequelize.sync();
            logger.info('Database models synchronized successfully.');
        } catch (error) {
            logger.error('Failed to sync database models:', error);
            throw error;
        }
    }

    _initializeModels() {
        Object.values(this.models).forEach(model => {
            if (model.init && typeof model.init === 'function') {
                model.init(this.sequelize);
            }
        });
    }

    getSequelize() {
        return this.sequelize;
    }

    async close() {
        try {
            await this.sequelize.close();
            logger.info('Database connection closed.');
        } catch (error) {
            logger.error('Failed to close database connection:', error);
            throw error;
        }
    }
}

module.exports = DatabaseConnection;