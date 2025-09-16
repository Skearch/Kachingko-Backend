const express = require('express');

class BaseRouter {
    constructor() {
        this.router = express.Router();
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

module.exports = BaseRouter;