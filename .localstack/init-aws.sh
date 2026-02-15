#!/bin/bash

# Wait for LocalStack to be ready
echo "Waiting for LocalStack to be ready..."
sleep 10

# Set AWS CLI to use LocalStack
export AWS_ACCESS_KEY_ID=test
export AWS_SECRET_ACCESS_KEY=test
export AWS_DEFAULT_REGION=us-east-1

# Create SQS queues
echo "Creating SQS queues..."

# Create Dead Letter Queue
aws --endpoint-url=http://localhost:4566 sqs create-queue \
  --queue-name whatsapp-notifications-dlq \
  --attributes VisibilityTimeout=300,MessageRetentionPeriod=1209600

# Get DLQ ARN
DLQ_ARN=$(aws --endpoint-url=http://localhost:4566 sqs get-queue-attributes \
  --queue-url http://localhost:4566/000000000000/whatsapp-notifications-dlq \
  --attribute-names QueueArn \
  --query 'Attributes.QueueArn' \
  --output text)

echo "DLQ ARN: $DLQ_ARN"

# Create main queue with DLQ redrive policy
aws --endpoint-url=http://localhost:4566 sqs create-queue \
  --queue-name whatsapp-notifications-queue \
  --attributes \
    VisibilityTimeout=300,\
    MessageRetentionPeriod=1209600,\
    ReceiveMessageWaitTimeSeconds=20,\
    RedrivePolicy="{\"deadLetterTargetArn\":\"$DLQ_ARN\",\"maxReceiveCount\":3}"

echo "SQS queues created successfully!"

# List queues to verify
echo "Available queues:"
aws --endpoint-url=http://localhost:4566 sqs list-queues

echo "LocalStack initialization complete!"
