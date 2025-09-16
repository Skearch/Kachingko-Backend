const logger = require('../utils/Logger');

class ErrorMiddleware {
    static handle(err, req, res, next) {
        logger.error('Error occurred:', {
            message: err.message,
            stack: err.stack,
            url: req.url,
            method: req.method,
            body: req.body,
            params: req.params
        });

        if (err.name === 'SequelizeValidationError') {
            return res.status(400).json({
                success: false,
                message: 'Validation error',
                errors: err.errors.map(e => e.message)
            });
        }

        if (err.name === 'SequelizeUniqueConstraintError') {
            return res.status(409).json({
                success: false,
                message: 'Account already exists with this phone number'
            });
        }

        if (err.message.includes('Account already exists')) {
            return res.status(409).json({
                success: false,
                message: err.message
            });
        }

        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: process.env.NODE_ENV === 'development' ? err.message : undefined
        });
    }

    static notFound(req, res) {
        logger.warn(`404 - Endpoint not found: ${req.method} ${req.url}`);
        res.status(404).json({
            success: false,
            message: 'Endpoint not found'
        });
    }
}

module.exports = ErrorMiddleware;