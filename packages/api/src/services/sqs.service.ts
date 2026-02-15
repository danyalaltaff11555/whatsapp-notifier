import { SQSClient, SendMessageCommand, SendMessageBatchCommand } from '@aws-sdk/client-sqs';
import { logger } from '@whatsapp-notif/shared';
import { config } from '../config';

/**
 * SQS service for publishing notification messages
 */

const sqsClient = new SQSClient({
  region: config.aws.region,
  endpoint: config.aws.sqsEndpoint,
  credentials: {
    accessKeyId: config.aws.accessKeyId,
    secretAccessKey: config.aws.secretAccessKey,
  },
});

export interface SQSMessage {
  id: string;
  body: string;
  deduplicationId?: string;
  groupId?: string;
}

/**
 * Publish single message to SQS
 */
export async function publishMessage(message: SQSMessage): Promise<string> {
  try {
    const command = new SendMessageCommand({
      QueueUrl: config.aws.queueUrl,
      MessageBody: message.body,
      MessageDeduplicationId: message.deduplicationId || message.id,
      MessageGroupId: message.groupId || 'default',
    });

    const response = await sqsClient.send(command);

    logger.info('Message published to SQS', {
      messageId: response.MessageId,
      notificationId: message.id,
    });

    return response.MessageId!;
  } catch (error) {
    logger.error('Failed to publish message to SQS', {
      error,
      notificationId: message.id,
    });
    throw new Error('Failed to publish message to queue');
  }
}

/**
 * Publish batch of messages to SQS (max 10 per batch)
 */
export async function publishBatch(messages: SQSMessage[]): Promise<{
  successful: string[];
  failed: Array<{ id: string; error: string }>;
}> {
  if (messages.length === 0) {
    return { successful: [], failed: [] };
  }

  if (messages.length > 10) {
    throw new Error('Batch size cannot exceed 10 messages');
  }

  try {
    const command = new SendMessageBatchCommand({
      QueueUrl: config.aws.queueUrl,
      Entries: messages.map((msg, index) => ({
        Id: index.toString(),
        MessageBody: msg.body,
        MessageDeduplicationId: msg.deduplicationId || msg.id,
        MessageGroupId: msg.groupId || 'default',
      })),
    });

    const response = await sqsClient.send(command);

    const successful = (response.Successful || []).map(
      (s) => messages[parseInt(s.Id!)].id
    );
    const failed = (response.Failed || []).map((f) => ({
      id: messages[parseInt(f.Id!)].id,
      error: f.Message || 'Unknown error',
    }));

    logger.info('Batch published to SQS', {
      total: messages.length,
      successful: successful.length,
      failed: failed.length,
    });

    return { successful, failed };
  } catch (error) {
    logger.error('Failed to publish batch to SQS', {
      error,
      messageCount: messages.length,
    });
    throw new Error('Failed to publish batch to queue');
  }
}
