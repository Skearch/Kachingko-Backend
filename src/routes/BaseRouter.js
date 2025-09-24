const express = require('express');
const logger = require('../utils/Logger');

class BaseRouter {
    constructor() {
        this.router = express.Router();
        this.routerName = this.constructor.name;
        this._setupDefaultMiddleware();
    }

    getRouter() {
        return this.router;
    }

    asyncHandler(fn) {
        return (req, res, next) => {
            Promise.resolve(fn(req, res, next)).catch(next);
        };
    }

    successResponse(data, message = 'Success') {
        return {
            success: true,
            message,
            data,
            timestamp: new Date().toISOString()
        };
    }

    errorResponse(message, error = null) {
        const response = {
            success: false,
            message,
            timestamp: new Date().toISOString()
        };

        if (error && process.env.NODE_ENV === 'development') {
            response.error = error?.message || error;
        }

        return response;
    }

    logRequest(req, res, next) {
        const startTime = Date.now();

        logger.info(`[${this.routerName}] ${req.method} ${req.originalUrl}`, {
            ip: req.ip,
            userAgent: req.get('User-Agent'),
            body: this._sanitizeRequestData(req.body),
            params: req.params,
            query: req.query
        });

        const originalSend = res.send;
        res.send = function (data) {
            const duration = Date.now() - startTime;
            logger.info(`[${this.routerName}] ${req.method} ${req.originalUrl} - ${res.statusCode} - ${duration}ms`);
            originalSend.call(this, data);
        };

        next();
    }

    validateContentType(allowedTypes = ['application/json']) {
        return (req, res, next) => {
            if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
                const contentType = req.get('Content-Type');

                if (!contentType || !allowedTypes.some(type => contentType.includes(type))) {
                    return res.status(415).json(
                        this.errorResponse(`Unsupported media type. Expected: ${allowedTypes.join(', ')}`)
                    );
                }
            }
            next();
        };
    }

    validateRequestSize(maxSize = '10mb') {
        return (req, res, next) => {
            const contentLength = req.get('Content-Length');
            const maxSizeBytes = this._parseSize(maxSize);

            if (contentLength && parseInt(contentLength) > maxSizeBytes) {
                return res.status(413).json(
                    this.errorResponse(`Request entity too large. Maximum size: ${maxSize}`)
                );
            }
            next();
        };
    }

    corsHandler(options = {}) {
        const defaultOptions = {
            origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
            methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
            allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
            credentials: true,
            maxAge: 86400
        };

        const corsOptions = { ...defaultOptions, ...options };

        return (req, res, next) => {
            const origin = req.get('Origin');

            if (corsOptions.origin === '*' ||
                (Array.isArray(corsOptions.origin) && corsOptions.origin.includes(origin))) {
                res.header('Access-Control-Allow-Origin', origin || '*');
            }

            res.header('Access-Control-Allow-Methods', corsOptions.methods.join(', '));
            res.header('Access-Control-Allow-Headers', corsOptions.allowedHeaders.join(', '));
            res.header('Access-Control-Allow-Credentials', corsOptions.credentials);
            res.header('Access-Control-Max-Age', corsOptions.maxAge);

            if (req.method === 'OPTIONS') {
                return res.status(200).end();
            }

            next();
        };
    }

    rateLimiter(options = {}) {
        const limits = new Map();
        const defaultOptions = {
            windowMs: 15 * 60 * 1000,
            max: 100,
            message: 'Too many requests from this IP, please try again later.',
            keyGenerator: (req) => req.ip
        };

        const limiterOptions = { ...defaultOptions, ...options };

        return (req, res, next) => {
            const key = limiterOptions.keyGenerator(req);
            const now = Date.now();
            const windowStart = now - limiterOptions.windowMs;

            if (!limits.has(key)) {
                limits.set(key, []);
            }

            const requests = limits.get(key);
            const validRequests = requests.filter(timestamp => timestamp > windowStart);

            if (validRequests.length >= limiterOptions.max) {
                const resetTime = Math.ceil((validRequests[0] + limiterOptions.windowMs - now) / 1000);

                res.set({
                    'X-RateLimit-Limit': limiterOptions.max,
                    'X-RateLimit-Remaining': 0,
                    'X-RateLimit-Reset': new Date(now + resetTime * 1000).toISOString()
                });

                return res.status(429).json(
                    this.errorResponse(limiterOptions.message)
                );
            }

            validRequests.push(now);
            limits.set(key, validRequests);

            res.set({
                'X-RateLimit-Limit': limiterOptions.max,
                'X-RateLimit-Remaining': limiterOptions.max - validRequests.length
            });

            next();
        };
    }

    healthCheck() {
        return (req, res) => {
            res.json(this.successResponse({
                status: 'healthy',
                router: this.routerName,
                timestamp: new Date().toISOString(),
                uptime: process.uptime(),
                memory: process.memoryUsage(),
                version: process.version
            }, 'Router is healthy'));
        };
    }

    notImplemented() {
        return (req, res) => {
            res.status(501).json(
                this.errorResponse('This endpoint is not yet implemented')
            );
        };
    }

    _setupDefaultMiddleware() {
        if (process.env.NODE_ENV !== 'production') {
            this.router.use(this.logRequest.bind(this));
        }

        this.router.use(this.validateContentType());
        this.router.use(this.corsHandler());
    }

    _sanitizeRequestData(data) {
        if (!data || typeof data !== 'object') {
            return data;
        }

        const sensitiveFields = ['password', 'pin', 'token', 'secret', 'key'];
        const sanitized = { ...data };

        Object.keys(sanitized).forEach(key => {
            if (sensitiveFields.some(field => key.toLowerCase().includes(field))) {
                sanitized[key] = '[REDACTED]';
            }
        });

        return sanitized;
    }

    _parseSize(size) {
        const units = {
            'b': 1,
            'kb': 1024,
            'mb': 1024 * 1024,
            'gb': 1024 * 1024 * 1024
        };

        const match = size.toString().toLowerCase().match(/^(\d+(?:\.\d+)?)(b|kb|mb|gb)?$/);
        if (!match) return 0;

        const value = parseFloat(match[1]);
        const unit = match[2] || 'b';

        return value * units[unit];
    }

    createRoute(method, path, ...middlewares) {
        const handler = middlewares.pop();
        const wrappedHandler = this.asyncHandler(handler);

        this.router[method.toLowerCase()](path, ...middlewares, wrappedHandler);

        logger.debug(`[${this.routerName}] Registered ${method.toUpperCase()} ${path}`);
    }

    get(path, ...middlewares) {
        this.createRoute('GET', path, ...middlewares);
    }

    post(path, ...middlewares) {
        this.createRoute('POST', path, ...middlewares);
    }

    put(path, ...middlewares) {
        this.createRoute('PUT', path, ...middlewares);
    }

    patch(path, ...middlewares) {
        this.createRoute('PATCH', path, ...middlewares);
    }

    delete(path, ...middlewares) {
        this.createRoute('DELETE', path, ...middlewares);
    }
}

module.exports = BaseRouter;