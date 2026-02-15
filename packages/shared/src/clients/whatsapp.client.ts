import axios, { AxiosInstance, AxiosError } from 'axios';
import { logger } from '@whatsapp-notif/shared';
import {
  WhatsAppMessage,
  WhatsAppSendMessageResponse,
  WhatsAppErrorResponse,
} from '@whatsapp-notif/shared';

/**
 * WhatsApp Business API Client
 */

export interface WhatsAppConfig {
  apiUrl: string;
  apiVersion: string;
  phoneNumberId: string;
  accessToken: string;
  timeout: number;
}

export class WhatsAppClient {
  private client: AxiosInstance;
  private config: WhatsAppConfig;

  constructor(config: WhatsAppConfig) {
    this.config = config;
    this.client = axios.create({
      baseURL: `${config.apiUrl}/${config.apiVersion}`,
      timeout: config.timeout,
      headers: {
        Authorization: `Bearer ${config.accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    // Request interceptor for logging
    this.client.interceptors.request.use(
      (config) => {
        logger.debug('WhatsApp API Request', {
          method: config.method,
          url: config.url,
          data: config.data,
        });
        return config;
      },
      (error) => {
        logger.error('WhatsApp API Request Error', { error });
        return Promise.reject(error);
      }
    );

    // Response interceptor for logging
    this.client.interceptors.response.use(
      (response) => {
        logger.debug('WhatsApp API Response', {
          status: response.status,
          data: response.data,
        });
        return response;
      },
      (error) => {
        this.handleError(error);
        return Promise.reject(error);
      }
    );
  }

  /**
   * Send a WhatsApp message
   */
  async sendMessage(message: WhatsAppMessage): Promise<WhatsAppSendMessageResponse> {
    try {
      const response = await this.client.post<WhatsAppSendMessageResponse>(
        `/${this.config.phoneNumberId}/messages`,
        message
      );

      logger.info('WhatsApp message sent', {
        messageId: response.data.messages[0]?.id,
        recipient: message.to,
      });

      return response.data;
    } catch (error) {
      logger.error('Failed to send WhatsApp message', {
        error,
        recipient: message.to,
      });
      throw error;
    }
  }

  /**
   * Send template message
   */
  async sendTemplateMessage(
    to: string,
    templateName: string,
    languageCode: string,
    components?: any[]
  ): Promise<WhatsAppSendMessageResponse> {
    const message: WhatsAppMessage = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'template',
      template: {
        name: templateName,
        language: {
          code: languageCode,
        },
        components,
      },
    };

    return this.sendMessage(message);
  }

  /**
   * Send text message
   */
  async sendTextMessage(to: string, text: string): Promise<WhatsAppSendMessageResponse> {
    const message: WhatsAppMessage = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'text',
      text: {
        body: text,
      },
    };

    return this.sendMessage(message);
  }

  /**
   * Handle API errors
   */
  private handleError(error: AxiosError<WhatsAppErrorResponse>): void {
    if (error.response?.data?.error) {
      const whatsappError = error.response.data.error;
      logger.error('WhatsApp API Error', {
        code: whatsappError.code,
        type: whatsappError.type,
        message: whatsappError.message,
        subcode: whatsappError.error_subcode,
        traceId: whatsappError.fbtrace_id,
      });
    }
  }

  /**
   * Check if error is retryable
   */
  isRetryableError(error: AxiosError<WhatsAppErrorResponse>): boolean {
    // Network errors
    if (!error.response) {
      return true;
    }

    const status = error.response.status;
    const errorCode = error.response.data?.error?.code;

    // Retryable status codes
    if ([408, 429, 500, 502, 503, 504].includes(status)) {
      return true;
    }

    // Retryable WhatsApp error codes
    const retryableCodes = [
      1, // Temporary error
      2, // Temporary error
      4, // Rate limit
      80007, // Temporary error
    ];

    return retryableCodes.includes(errorCode || 0);
  }
}

/**
 * Create WhatsApp client instance
 */
export function createWhatsAppClient(config: WhatsAppConfig): WhatsAppClient {
  return new WhatsAppClient(config);
}
