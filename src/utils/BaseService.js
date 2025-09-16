const logger = require('./Logger');

class BaseService {
    constructor() {
        this.serviceName = this.constructor.name;
    }

    logInfo(message, data = null) {
        logger.info(`[${this.serviceName}] ${message}`, data);
    }

    logError(message, error = null) {
        logger.error(`[${this.serviceName}] ${message}`, error);
    }

    logDebug(message, data = null) {
        logger.debug(`[${this.serviceName}] ${message}`, data);
    }

    logWarn(message, data = null) {
        logger.warn(`[${this.serviceName}] ${message}`, data);
    }

    handleServiceError(error, operation) {
        this.logError(`${operation} failed`, error);
        throw new Error(`${this.serviceName}: ${operation} failed - ${error.message}`);
    }
}

module.exports = BaseService;