/**
 * Configuration management for API service
 */

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  host: process.env.HOST || '0.0.0.0',
  nodeEnv: process.env.NODE_ENV || 'development',
  logLevel: process.env.LOG_LEVEL || 'info',

  databaseUrl: process.env.DATABASE_URL || '',
  redisUrl: process.env.REDIS_URL || '',

  // AWS Configuration
  aws: {
    region: process.env.AWS_REGION || 'us-east-1',
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || 'test',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || 'test',
    sqsEndpoint: process.env.SQS_ENDPOINT || 'http://localhost:4566',
    queueUrl:
      process.env.SQS_QUEUE_URL ||
      'http://localhost:4566/000000000000/whatsapp-notifications',
  },

  // API Configuration
  api: {
    corsOrigin: process.env.CORS_ORIGIN || '*',
    apiKeys: (process.env.API_KEYS || 'test-key').split(','),
  },

  // Rate limiting
  rateLimitTenantPerMinute: parseInt(
    process.env.RATE_LIMIT_TENANT_PER_MINUTE || '100',
    10
  ),
  rateLimitRecipientPerHour: parseInt(
    process.env.RATE_LIMIT_RECIPIENT_PER_HOUR || '10',
    10
  ),
};
