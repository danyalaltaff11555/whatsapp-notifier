import {
  SQSClient,
  ReceiveMessageCommand,
  DeleteMessageCommand,
  ChangeMessageVisibilityCommand,
  Message,
} from '@aws-sdk/client-sqs';
import { logger } from '@whatsapp-notif/shared';
import { workerConfig } from '../config';

/**
 * SQS Consumer for processing notification messages
 */

export class SQSConsumer {
  private client: SQSClient;
  private queueUrl: string;
  private isRunning: boolean = false;

  constructor() {
    this.client = new SQSClient({
      region: workerConfig.aws.region,
      endpoint: workerConfig.aws.sqsEndpoint,
      credentials: {
        accessKeyId: workerConfig.aws.accessKeyId,
        secretAccessKey: workerConfig.aws.secretAccessKey,
      },
    });
    this.queueUrl = workerConfig.aws.queueUrl;
  }

  /**
   * Start consuming messages
   */
  async start(messageHandler: (message: Message) => Promise<void>): Promise<void> {
    this.isRunning = true;
    logger.info('SQS Consumer started', { queueUrl: this.queueUrl });

    while (this.isRunning) {
      try {
        await this.poll(messageHandler);
      } catch (error) {
        logger.error('Error in SQS consumer loop', { error });
        await this.sleep(5000); // Wait before retrying
      }
    }
  }

  /**
   * Stop consuming messages
   */
  stop(): void {
    this.isRunning = false;
    logger.info('SQS Consumer stopped');
  }

  /**
   * Poll for messages
   */
  private async poll(messageHandler: (message: Message) => Promise<void>): Promise<void> {
    const command = new ReceiveMessageCommand({
      QueueUrl: this.queueUrl,
      MaxNumberOfMessages: workerConfig.worker.maxConcurrency,
      WaitTimeSeconds: 20, // Long polling
      VisibilityTimeout: workerConfig.worker.visibilityTimeout,
    });

    const response = await this.client.send(command);

    if (!response.Messages || response.Messages.length === 0) {
      return;
    }

    logger.debug('Received messages from SQS', { count: response.Messages.length });

    // Process messages concurrently
    await Promise.allSettled(
      response.Messages.map((message) => this.processMessage(message, messageHandler))
    );
  }

  /**
   * Process a single message
   */
  private async processMessage(
    message: Message,
    messageHandler: (message: Message) => Promise<void>
  ): Promise<void> {
    const startTime = Date.now();

    try {
      logger.info('Processing message', { messageId: message.MessageId });

      await messageHandler(message);

      // Delete message after successful processing
      await this.deleteMessage(message);

      const duration = Date.now() - startTime;
      logger.info('Message processed successfully', {
        messageId: message.MessageId,
        duration,
      });
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error('Failed to process message', {
        messageId: message.MessageId,
        error,
        duration,
      });

      // Message will become visible again after visibility timeout
      // and will be retried or moved to DLQ based on maxReceiveCount
    }
  }

  /**
   * Delete message from queue
   */
  private async deleteMessage(message: Message): Promise<void> {
    if (!message.ReceiptHandle) {
      return;
    }

    const command = new DeleteMessageCommand({
      QueueUrl: this.queueUrl,
      ReceiptHandle: message.ReceiptHandle,
    });

    await this.client.send(command);
  }

  /**
   * Change message visibility timeout
   */
  async changeVisibility(message: Message, visibilityTimeout: number): Promise<void> {
    if (!message.ReceiptHandle) {
      return;
    }

    const command = new ChangeMessageVisibilityCommand({
      QueueUrl: this.queueUrl,
      ReceiptHandle: message.ReceiptHandle,
      VisibilityTimeout: visibilityTimeout,
    });

    await this.client.send(command);
  }

  /**
   * Sleep helper
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
