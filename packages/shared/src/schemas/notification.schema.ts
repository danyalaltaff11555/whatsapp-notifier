import { z } from 'zod';

/**
 * Validation schemas for notification requests
 */

// E.164 phone number format validation
const phoneNumberRegex = /^\+[1-9]\d{1,14}$/;

export const recipientSchema = z.object({
    phone_number: z
        .string()
        .regex(phoneNumberRegex, 'Phone number must be in E.164 format'),
    country_code: z.string().length(2).optional(),
});

export const templateParameterSchema = z.object({
    type: z.enum(['text', 'currency', 'date_time']),
    value: z.string(),
});

export const templateMessageSchema = z.object({
    name: z.string().min(1).max(255),
    language: z.string().length(2), // ISO 639-1
    parameters: z.array(templateParameterSchema).optional(),
});

export const textMessageSchema = z.object({
    text: z.string().min(1).max(4096),
});

export const notificationRequestSchema = z
    .object({
        event_type: z.string().min(1).max(100),
        recipient: recipientSchema,
        template: templateMessageSchema.optional(),
        message: textMessageSchema.optional(),
        metadata: z.record(z.unknown()).optional(),
        priority: z.enum(['high', 'normal', 'low']).default('normal'),
        scheduled_for: z.string().datetime().optional(),
    })
    .refine((data) => data.template || data.message, {
        message: "Either 'template' or 'message' must be provided",
    });

export const bulkNotificationRequestSchema = z.object({
    notifications: z.array(notificationRequestSchema).min(1).max(100),
    batch_id: z.string().optional(),
});

export type NotificationRequest = z.infer<typeof notificationRequestSchema>;
export type BulkNotificationRequest = z.infer<
    typeof bulkNotificationRequestSchema
>;
