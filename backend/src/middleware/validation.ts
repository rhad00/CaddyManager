import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { body, validationResult, type ValidationChain } from 'express-validator';

/** A route's validation: the rules, then the handler that rejects a request that broke them */
export type ValidationRules = Array<ValidationChain | RequestHandler>;

/**
 * Middleware to check for validation errors
 */
const validate = (req: Request, res: Response, next: NextFunction): void | Response => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            success: false,
            message: 'Validation error',
            errors: errors.array()
        });
    }
    next();
};

/**
 * Validation rules for login
 */
export const loginValidation: ValidationRules = [
    body('email')
        .trim()
        .isEmail()
        .withMessage('Please provide a valid email address')
        .normalizeEmail(),
    body('password')
        .trim()
        .notEmpty()
        .withMessage('Password is required'),
    validate
];

/**
 * Validation rules for user registration/creation
 */
export const userValidation: ValidationRules = [
    body('email')
        .trim()
        .isEmail()
        .withMessage('Please provide a valid email address')
        .normalizeEmail(),
    body('password')
        .trim()
        .isLength({ min: 8 })
        .withMessage('Password must be at least 8 characters long')
        .matches(/[A-Z]/)
        .withMessage('Password must contain at least one uppercase letter')
        .matches(/[a-z]/)
        .withMessage('Password must contain at least one lowercase letter')
        .matches(/[0-9]/)
        .withMessage('Password must contain at least one number')
        .matches(/[^A-Za-z0-9]/)
        .withMessage('Password must contain at least one symbol'),
    body('username')
        .trim()
        .notEmpty()
        .withMessage('Username is required')
        .isLength({ min: 3 })
        .withMessage('Username must be at least 3 characters long')
        .escape(),
    validate
];
