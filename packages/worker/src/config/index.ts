/**
 * Worker configuration
 */

export const workerConfig = {
  // Server
  port: parseInt(process.env.WORKER_PORT || '3001', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  logLevel: process.env.LOG_LEVEL || 'info',

  // Database
  databaseUrl: process.env.DATABASE_URL || '',

  // AWS SQS
  aws: {
    region: process.env.AWS_REGION || 'us-east-1',
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || 'test',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || 'test',
    sqsEndpoint: process.env.SQS_ENDPOINT || 'http://localhost:4566',
    queueUrl:
      process.env.SQS_QUEUE_URL ||
      'http://localhost:4566/000000000000/whatsapp-notifications',
  },

  // WhatsApp API
  whatsapp: {
    apiUrl: process.env.WHATSAPP_API_URL || 'https://graph.facebook.com',
    apiVersion: process.env.WHATSAPP_API_VERSION || 'v18.0',
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || '',
    accessToken: process.env.WHATSAPP_ACCESS_TOKEN || '',
    timeout: parseInt(process.env.WHATSAPP_TIMEOUT || '30000', 10),
  },

  // Worker settings
  worker: {
    maxConcurrency: parseInt(process.env.WORKER_MAX_CONCURRENCY || '10', 10),
    pollInterval: parseInt(process.env.WORKER_POLL_INTERVAL || '1000', 10),
    visibilityTimeout: parseInt(process.env.WORKER_VISIBILITY_TIMEOUT || '30', 10),
    maxReceiveCount: parseInt(process.env.WORKER_MAX_RECEIVE_COUNT || '3', 10),
  },
};
