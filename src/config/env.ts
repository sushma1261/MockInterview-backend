/**
 * Centralized Environment Configuration
 * All environment variables accessed through this module
 */

export const config = {
  server: {
    port: parseInt(process.env.PORT || '8080'),
    baseUrl: process.env.BASE_URL || 'http://localhost',
    nodeEnv: process.env.NODE_ENV || 'development',
  },
  
  auth: {
    enabled: process.env.AUTH_ENABLED === 'true',
  },
  
  database: {
    host: process.env.POSTGRES_HOST || 'localhost',
    port: parseInt(process.env.POSTGRES_PORT || '5432'),
    user: process.env.POSTGRES_USER || '',
    password: process.env.POSTGRES_PASSWORD || '',
    database: process.env.POSTGRES_DB || '',
    url: process.env.DATABASE_URL,
    pool: {
      max: parseInt(process.env.DB_POOL_MAX || '20'),
      min: parseInt(process.env.DB_POOL_MIN || '5'),
      idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT || '30000'),
      connectionTimeoutMillis: parseInt(process.env.DB_CONNECTION_TIMEOUT || '2000'),
    },
  },
  
  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
    sessionTtl: parseInt(process.env.REDIS_SESSION_TTL || String(7 * 24 * 60 * 60)), // 7 days
  },
  
  ai: {
    googleApiKey: process.env.GEMINI_API_KEY || '',
    disabled: process.env.AI_DISABLED === 'true',
  },
  
  firebase: {
    projectId: process.env.FIREBASE_PROJECT_ID || '',
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL || '',
    privateKey: process.env.FIREBASE_PRIVATE_KEY || '',
  },
  
  cors: {
    allowedOrigins: process.env.ALLOWED_ORIGINS?.split(',') || [
      'http://localhost:3000',
      'http://localhost:5173', // Vite
      'http://localhost:4200', // Angular
    ],
  },
  
  upload: {
    maxFileSize: parseInt(process.env.MAX_FILE_SIZE || String(10 * 1024 * 1024)), // 10MB
    allowedMimeTypes: ['application/pdf'],
  },
  
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW || String(15 * 60 * 1000)), // 15 min
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX || '100'),
  },
} as const;

/**
 * Validate required environment variables on startup
 */
export function validateConfig(): void {
  const errors: string[] = [];
  
  // Required for production
  if (config.server.nodeEnv === 'production') {
    const requiredProd = {
      'POSTGRES_USER': config.database.user,
      'POSTGRES_PASSWORD': config.database.password,
      'POSTGRES_DB': config.database.database,
      'GEMINI_API_KEY': config.ai.googleApiKey,
      'FIREBASE_PROJECT_ID': config.firebase.projectId,
      'FIREBASE_CLIENT_EMAIL': config.firebase.clientEmail,
      'FIREBASE_PRIVATE_KEY': config.firebase.privateKey,
    };
    
    Object.entries(requiredProd).forEach(([key, value]) => {
      if (!value) {
        errors.push(`Missing required environment variable: ${key}`);
      }
    });
  }
  
  // Validate numeric values
  if (isNaN(config.server.port) || config.server.port < 1 || config.server.port > 65535) {
    errors.push('PORT must be a valid port number (1-65535)');
  }
  
  if (errors.length > 0) {
    console.error('❌ Configuration validation failed:');
    errors.forEach(error => console.error(`  - ${error}`));
    throw new Error('Invalid configuration');
  }
  
  console.log('✅ Configuration validated successfully');
}

/**
 * Check if running in production
 */
export const isProduction = (): boolean => config.server.nodeEnv === 'production';

/**
 * Check if running in development
 */
export const isDevelopment = (): boolean => config.server.nodeEnv === 'development';

/**
 * Check if running in test environment
 */
export const isTest = (): boolean => config.server.nodeEnv === 'test';
