import { NextFunction, Request, Response } from 'express';
import { z, ZodError, ZodSchema } from 'zod';

/**
 * Generic validation middleware factory
 * Validates request body, query, or params against a Zod schema
 */
export const validate = (schema: ZodSchema, source: 'body' | 'query' | 'params' = 'body') => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = source === 'body' ? req.body : source === 'query' ? req.query : req.params;
      schema.parse(data);
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({
          error: 'Validation failed',
          details: error.errors.map(err => ({
            field: err.path.join('.'),
            message: err.message,
          })),
        });
      }
      next(error);
    }
  };
};

/**
 * Validation schemas for common request types
 */

// Chat request validation
export const chatRequestSchema = z.object({
  action: z.enum(['start', 'continue', 'end']).optional(),
  message: z.string().min(1, 'Message is required').max(5000, 'Message too long'),
  job_description: z.string().max(10000, 'Job description too long').optional(),
  resume_id: z.number().int().positive().optional(),
  job_title: z.string().max(255).optional(),
  company_name: z.string().max(255).optional(),
});

// User profile update validation
export const updateProfileSchema = z.object({
  display_name: z.string().min(1).max(255).optional(),
  photo_url: z.string().url().optional(),
});

// User preferences validation
export const updatePreferencesSchema = z.object({
  interview_difficulty: z.enum(['easy', 'medium', 'hard']).optional(),
  interview_duration: z.number().int().min(15).max(180).optional(),
  preferred_languages: z.array(z.string()).optional(),
  theme: z.enum(['light', 'dark']).optional(),
});

// Resume update validation
export const updateResumeSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  is_primary: z.boolean().optional(),
});

// Job description validation
export const createJobSchema = z.object({
  title: z.string().min(1).max(255),
  company_name: z.string().max(255).optional(),
  description: z.string().min(10),
  requirements: z.string().optional(),
  required_skills: z.array(z.string()).optional(),
  required_experience_years: z.number().int().min(0).optional(),
  positions_available: z.number().int().min(1).optional(),
  status: z.enum(['draft', 'active', 'closed', 'on_hold']).optional(),
  screening_config: z.object({
    max_candidates: z.number().int().min(1).max(100).optional(),
    similarity_threshold: z.number().min(0).max(1).optional(),
    application_threshold: z.number().min(0).max(100).optional(),
  }).optional(),
});

export const updateJobSchema = createJobSchema.partial();

// Application update validation
export const updateApplicationSchema = z.object({
  screening_status: z.enum(['screened', 'shortlisted', 'rejected', 'interviewed', 'hired']).optional(),
  hr_status: z.enum(['pending', 'reviewing', 'approved', 'rejected', 'on_hold']).optional(),
  hr_notes: z.string().max(2000).optional(),
});

// Role assignment validation
export const assignRoleSchema = z.object({
  userId: z.number().int().positive(),
  role: z.enum(['admin', 'hr', 'candidate', 'interviewer', 'hiring_manager']),
  department: z.string().max(100).optional(),
});

// Pagination validation
export const paginationSchema = z.object({
  page: z.string().regex(/^\d+$/).transform(Number).optional(),
  limit: z.string().regex(/^\d+$/).transform(Number).optional(),
});

// ID parameter validation
export const idParamSchema = z.object({
  id: z.string().regex(/^\d+$/).transform(Number),
});

export const sessionIdParamSchema = z.object({
  sessionId: z.string().regex(/^\d+$/).transform(Number),
});

export const userIdParamSchema = z.object({
  userId: z.string().regex(/^\d+$/).transform(Number),
});

/**
 * Helper to validate file uploads
 */
export const validateFile = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  // Validate file type
  if (req.file.mimetype !== 'application/pdf') {
    return res.status(400).json({ error: 'Only PDF files are allowed' });
  }

  // Validate file size (10MB)
  const maxSize = 10 * 1024 * 1024;
  if (req.file.size > maxSize) {
    return res.status(400).json({ 
      error: 'File too large',
      maxSize: '10MB',
      receivedSize: `${(req.file.size / (1024 * 1024)).toFixed(2)}MB`
    });
  }

  next();
};

/**
 * Sanitize input to prevent XSS
 */
export const sanitizeInput = (input: any): any => {
  if (typeof input === 'string') {
    return input
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;')
      .replace(/\//g, '&#x2F;');
  }
  if (Array.isArray(input)) {
    return input.map(sanitizeInput);
  }
  if (typeof input === 'object' && input !== null) {
    const sanitized: any = {};
    for (const key in input) {
      sanitized[key] = sanitizeInput(input[key]);
    }
    return sanitized;
  }
  return input;
};
