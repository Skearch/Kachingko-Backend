const logger = require('../utils/Logger');

class BaseController {
    handleError(error, message) {
        logger.error(`${message}:`, error);
        return new Error(error.message || message);
    }

    logInfo(message, data = null) {
        logger.info(`[${this.constructor.name}] ${message}`, data);
    }

    logError(message, error = null) {
        logger.error(`[${this.constructor.name}] ${message}`, error);
    }

    successResponse(data, message = 'Success') {
        return {
            success: true,
            message,
            data
        };
    }

    errorResponse(message, error = null) {
        return {
            success: false,
            message,
            error: error?.message || null
        };
    }
}

module.exports = BaseController;