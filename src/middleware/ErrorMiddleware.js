const logger = require('../utils/Logger');

class ErrorMiddleware {
    static handle(err, req, res, next) {
        const errorContext = ErrorMiddleware._buildErrorContext(err, req);
        logger.error('Error occurred:', errorContext);

        const errorResponse = ErrorMiddleware._determineErrorResponse(err);
        res.status(errorResponse.status).json(errorResponse.body);
    }

    static notFound(req, res) {
        logger.warn(`404 - Endpoint not found: ${req.method} ${req.url}`);
        
        res.status(404).json({
            success: false,
            message: 'Endpoint not found'
        });
    }

    static _buildErrorContext(err, req) {
        return {
            message: err.message,
            stack: err.stack,
            url: req.url,
            method: req.method,
            body: req.body,
            params: req.params,
            query: req.query,
            headers: ErrorMiddleware._sanitizeHeaders(req.headers),
            userAgent: req.get('User-Agent'),
            ip: req.ip || req.connection.remoteAddress,
            timestamp: new Date().toISOString()
        };
    }

    static _sanitizeHeaders(headers) {
        const sensitiveHeaders = ['authorization', 'cookie', 'x-api-key'];
        const sanitized = { ...headers };
        
        sensitiveHeaders.forEach(header => {
            if (sanitized[header]) {
                sanitized[header] = '[REDACTED]';
            }
        });
        
        return sanitized;
    }

    static _determineErrorResponse(err) {
        const errorMappings = [
            {
                condition: (error) => error.name === 'SequelizeValidationError',
                handler: (error) => ErrorMiddleware._handleValidationError(error)
            },
            {
                condition: (error) => error.name === 'SequelizeUniqueConstraintError',
                handler: (error) => ErrorMiddleware._handleUniqueConstraintError(error)
            },
            {
                condition: (error) => error.name === 'SequelizeForeignKeyConstraintError',
                handler: (error) => ErrorMiddleware._handleForeignKeyError(error)
            },
            {
                condition: (error) => error.name === 'SequelizeDatabaseError',
                handler: (error) => ErrorMiddleware._handleDatabaseError(error)
            },
            {
                condition: (error) => error.message.includes('Account already exists'),
                handler: (error) => ErrorMiddleware._handleAccountExistsError(error)
            },
            {
                condition: (error) => error.message.includes('Account not found'),
                handler: (error) => ErrorMiddleware._handleAccountNotFoundError(error)
            },
            {
                condition: (error) => error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError',
                handler: (error) => ErrorMiddleware._handleJwtError(error)
            },
            {
                condition: (error) => error.name === 'MulterError',
                handler: (error) => ErrorMiddleware._handleFileUploadError(error)
            },
            {
                condition: (error) => error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND',
                handler: (error) => ErrorMiddleware._handleNetworkError(error)
            },
            {
                condition: (error) => error.statusCode && error.statusCode >= 400 && error.statusCode < 500,
                handler: (error) => ErrorMiddleware._handleClientError(error)
            }
        ];

        for (const mapping of errorMappings) {
            if (mapping.condition(err)) {
                return mapping.handler(err);
            }
        }

        return ErrorMiddleware._handleGenericError(err);
    }

    static _handleValidationError(err) {
        return {
            status: 400,
            body: {
                success: false,
                message: 'Validation error',
                errors: err.errors.map(e => ({
                    field: e.path,
                    message: e.message,
                    value: e.value
                }))
            }
        };
    }

    static _handleUniqueConstraintError(err) {
        const field = err.errors?.[0]?.path || 'field';
        const fieldName = field === 'phoneNumber' ? 'phone number' : field;
        
        return {
            status: 409,
            body: {
                success: false,
                message: `An account with this ${fieldName} already exists`
            }
        };
    }

    static _handleForeignKeyError(err) {
        return {
            status: 400,
            body: {
                success: false,
                message: 'Referenced record does not exist'
            }
        };
    }

    static _handleDatabaseError(err) {
        return {
            status: 500,
            body: {
                success: false,
                message: 'Database error occurred'
            }
        };
    }

    static _handleAccountExistsError(err) {
        return {
            status: 409,
            body: {
                success: false,
                message: err.message
            }
        };
    }

    static _handleAccountNotFoundError(err) {
        return {
            status: 404,
            body: {
                success: false,
                message: err.message
            }
        };
    }

    static _handleJwtError(err) {
        let message = 'Authentication failed';
        
        if (err.name === 'TokenExpiredError') {
            message = 'Token has expired';
        } else if (err.name === 'JsonWebTokenError') {
            message = 'Invalid token';
        }
        
        return {
            status: 401,
            body: {
                success: false,
                message
            }
        };
    }

    static _handleFileUploadError(err) {
        let message = 'File upload error';
        
        if (err.code === 'LIMIT_FILE_SIZE') {
            message = 'File too large';
        } else if (err.code === 'LIMIT_FILE_COUNT') {
            message = 'Too many files';
        } else if (err.code === 'LIMIT_UNEXPECTED_FILE') {
            message = 'Unexpected field';
        }
        
        return {
            status: 400,
            body: {
                success: false,
                message
            }
        };
    }

    static _handleNetworkError(err) {
        return {
            status: 503,
            body: {
                success: false,
                message: 'Service temporarily unavailable'
            }
        };
    }

    static _handleClientError(err) {
        return {
            status: err.statusCode || 400,
            body: {
                success: false,
                message: err.message || 'Bad request'
            }
        };
    }

    static _handleGenericError(err) {
        const isDevelopment = process.env.NODE_ENV === 'development';
        
        return {
            status: 500,
            body: {
                success: false,
                message: 'Internal server error',
                ...(isDevelopment && { 
                    error: err.message,
                    stack: err.stack 
                })
            }
        };
    }

    static asyncErrorHandler(fn) {
        return (req, res, next) => {
            Promise.resolve(fn(req, res, next)).catch(next);
        };
    }

    static rateLimitHandler(req, res) {
        logger.warn(`Rate limit exceeded: ${req.method} ${req.url}`, {
            ip: req.ip,
            userAgent: req.get('User-Agent')
        });
        
        res.status(429).json({
            success: false,
            message: 'Too many requests, please try again later'
        });
    }

    static corsErrorHandler(err, req, res, next) {
        if (err && err.message && err.message.includes('CORS')) {
            logger.warn(`CORS error: ${req.method} ${req.url}`, {
                origin: req.get('Origin'),
                referer: req.get('Referer')
            });
            
            return res.status(403).json({
                success: false,
                message: 'CORS policy violation'
            });
        }
        
        next(err);
    }
}

module.exports = ErrorMiddleware;