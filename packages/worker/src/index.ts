import { logger, disconnectDatabase, initSentry, addCloudWatchLogging } from '@whatsapp-notif/shared';
import { SQSConsumer } from './services/sqs.consumer';
import { MessageProcessor } from './services/message.processor';
import { RetryScheduler } from './services/retry.scheduler';
import { ScheduledProcessor } from './services/scheduled.processor';
import { workerConfig } from './config';

/**
 * Worker entry point
 */

async function main() {
  // Initialize monitoring
  initSentry(process.env.SENTRY_DSN, workerConfig.nodeEnv);
  
  // Add CloudWatch logging in production
  if (workerConfig.nodeEnv === 'production') {
    addCloudWatchLogging(logger as any, true, {
      logGroupName: '/whatsapp-notif/worker',
      logStreamName: `worker-${new Date().toISOString().split('T')[0]}`,
      awsRegion: workerConfig.aws.region,
    });
  }

  logger.info('Starting WhatsApp Notification Worker', {
    nodeEnv: workerConfig.nodeEnv,
    queueUrl: workerConfig.aws.queueUrl,
  });

  const consumer = new SQSConsumer();
  const processor = new MessageProcessor();
  const retryScheduler = new RetryScheduler(60000); // Check every minute
  const scheduledProcessor = new ScheduledProcessor(30000); // Check every 30 seconds

  // Handle graceful shutdown
  const shutdown = async () => {
    logger.info('Shutting down worker...');
    consumer.stop();
    retryScheduler.stop();
    scheduledProcessor.stop();
    await disconnectDatabase();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  // Start all processors
  try {
    retryScheduler.start();
    scheduledProcessor.start();
    await consumer.start((message) => processor.processMessage(message));
  } catch (error) {
    logger.error('Worker crashed', { error });
    await disconnectDatabase();
    process.exit(1);
  }
}

main().catch((error) => {
  logger.error('Failed to start worker', { error });
  process.exit(1);
});
