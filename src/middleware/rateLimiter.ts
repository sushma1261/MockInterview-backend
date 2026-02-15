import rateLimit from 'express-rate-limit';
import { config } from '../config/env';

/**
 * General API rate limiter
 * Applied to all /api routes
 */
export const generalLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs, // 15 minutes
  max: config.rateLimit.maxRequests, // 100 requests per windowMs
  message: {
    error: 'Too many requests from this IP, please try again later.',
    retryAfter: 'Check the Retry-After header',
  },
  standardHeaders: true, // Return rate limit info in `RateLimit-*` headers
  legacyHeaders: false, // Disable `X-RateLimit-*` headers
  // Store in memory - for production, use Redis store
  // store: new RedisStore({ client: redis }),
});

/**
 * Strict rate limiter for file uploads
 * Prevents abuse of upload endpoints
 */
export const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // 5 uploads per hour
  message: {
    error: 'Too many file uploads, please try again later.',
    limit: '5 uploads per hour',
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false, // Count all requests
});

/**
 * Chat/Interview rate limiter
 * Balanced to allow conversations while preventing spam
 */
export const chatLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 20, // 20 chat messages per minute
  message: {
    error: 'Too many chat requests, please slow down.',
    limit: '20 messages per minute',
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipFailedRequests: true, // Don't count failed requests
});

/**
 * Authentication rate limiter
 * Strict limits to prevent brute force
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 attempts per 15 minutes
  message: {
    error: 'Too many authentication attempts, please try again later.',
    limit: '10 attempts per 15 minutes',
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // Don't count successful logins
});

/**
 * Resume screening rate limiter
 * AI-intensive operation, needs stricter limits
 */
export const screeningLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // 10 screening operations per hour
  message: {
    error: 'Too many screening requests, please try again later.',
    limit: '10 screening operations per hour',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Public endpoints rate limiter
 * More lenient for health checks, etc.
 */
export const publicLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60, // 60 requests per minute
  message: {
    error: 'Too many requests',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Create a custom rate limiter with specific options
 */
export const createRateLimiter = (options: {
  windowMs: number;
  max: number;
  message?: string;
}) => {
  return rateLimit({
    windowMs: options.windowMs,
    max: options.max,
    message: {
      error: options.message || 'Too many requests, please try again later.',
    },
    standardHeaders: true,
    legacyHeaders: false,
  });
};
