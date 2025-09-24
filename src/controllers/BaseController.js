const logger = require('../utils/Logger');

class BaseController {
    constructor() {
        this.className = this.constructor.name;
    }

    handleError(error, message) {
        const errorMessage = this._formatErrorMessage(message, error);
        this.logError(errorMessage, error);
        return new Error(error.message || message);
    }

    logInfo(message, data = null) {
        const formattedMessage = this._formatLogMessage(message);
        logger.info(formattedMessage, data);
    }

    logError(message, error = null) {
        const formattedMessage = this._formatLogMessage(message);
        logger.error(formattedMessage, error);
    }

    logDebug(message, data = null) {
        const formattedMessage = this._formatLogMessage(message);
        logger.debug(formattedMessage, data);
    }

    logWarn(message, data = null) {
        const formattedMessage = this._formatLogMessage(message);
        logger.warn(formattedMessage, data);
    }

    successResponse(data, message = 'Success') {
        return this._createResponse(true, message, data, null);
    }

    errorResponse(message, error = null) {
        return this._createResponse(false, message, null, error);
    }

    validateRequiredFields(data, requiredFields) {
        const missingFields = this._findMissingFields(data, requiredFields);

        if (missingFields.length > 0) {
            throw new Error(`Missing required fields: ${missingFields.join(', ')}`);
        }
    }

    sanitizeData(data, allowedFields) {
        return this._filterObjectByKeys(data, allowedFields);
    }

    async executeWithErrorHandling(operation, errorMessage) {
        try {
            return await operation();
        } catch (error) {
            throw this.handleError(error, errorMessage);
        }
    }

    _formatLogMessage(message) {
        return `[${this.className}] ${message}`;
    }

    _formatErrorMessage(message, error) {
        return error ? `${message}: ${error.message}` : message;
    }

    _createResponse(success, message, data, error) {
        const response = {
            success,
            message
        };

        if (data !== null && data !== undefined) {
            response.data = data;
        }

        if (error !== null && error !== undefined) {
            response.error = error?.message || error;
        }

        return response;
    }

    _findMissingFields(data, requiredFields) {
        return requiredFields.filter(field =>
            data[field] === undefined ||
            data[field] === null ||
            (typeof data[field] === 'string' && data[field].trim() === '')
        );
    }

    _filterObjectByKeys(obj, allowedKeys) {
        return Object.keys(obj)
            .filter(key => allowedKeys.includes(key))
            .reduce((filtered, key) => {
                filtered[key] = obj[key];
                return filtered;
            }, {});
    }

    _isValidEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }

    _isValidPhoneNumber(phoneNumber) {
        const phoneRegex = /^(\+63|63|0)?[89]\d{9}$/;
        return phoneRegex.test(phoneNumber.replace(/[\s-()]/g, ''));
    }

    _normalizePhoneNumber(phoneNumber) {
        let cleaned = phoneNumber.replace(/\D/g, '');

        if (cleaned.startsWith('0')) {
            return '+63' + cleaned.substring(1);
        }

        if (cleaned.startsWith('63')) {
            return '+' + cleaned;
        }

        if (!cleaned.startsWith('+63')) {
            return '+63' + cleaned;
        }

        return cleaned;
    }

    _generateRandomCode(length = 6) {
        return Math.floor(Math.pow(10, length - 1) + Math.random() * (Math.pow(10, length) - Math.pow(10, length - 1))).toString();
    }

    _isWithinTimeLimit(timestamp, limitInMinutes = 1) {
        if (!timestamp) return true;

        const now = new Date();
        const timeDiff = now - new Date(timestamp);
        const minutesDiff = timeDiff / (1000 * 60);

        return minutesDiff > limitInMinutes;
    }

    _calculateRemainingTime(timestamp, limitInMinutes = 1) {
        if (!timestamp) return 0;

        const now = new Date();
        const timeDiff = now - new Date(timestamp);
        const limitInMs = limitInMinutes * 60 * 1000;
        const remainingMs = limitInMs - timeDiff;

        return Math.max(0, Math.ceil(remainingMs / 1000));
    }
}

module.exports = BaseController;