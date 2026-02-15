import request from 'supertest';
import { buildApp } from '../app';
import { FastifyInstance } from 'fastify';

describe('Notification Routes', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /v1/notifications', () => {
    it('should reject requests without API key', async () => {
      await request(app.server)
        .post('/v1/notifications')
        .send({
          event_type: 'order.placed',
          recipient: { phone_number: '+14155552671' },
          template: { name: 'order_confirmation', language: 'en' },
        })
        .expect(401);
    });

    it('should reject invalid phone numbers', async () => {
      await request(app.server)
        .post('/v1/notifications')
        .set('X-API-Key', 'test-key')
        .send({
          event_type: 'order.placed',
          recipient: { phone_number: 'invalid' },
          template: { name: 'order_confirmation', language: 'en' },
        })
        .expect(400);
    });

    it('should validate required fields', async () => {
      await request(app.server)
        .post('/v1/notifications')
        .set('X-API-Key', 'test-key')
        .send({
          event_type: 'order.placed',
          // Missing recipient
        })
        .expect(400);
    });
  });

  describe('GET /v1/notifications/:id/status', () => {
    it('should reject requests without API key', async () => {
      await request(app.server)
        .get('/v1/notifications/test-id/status')
        .expect(401);
    });

    it('should return 404 for non-existent notification', async () => {
      await request(app.server)
        .get('/v1/notifications/non-existent/status')
        .set('X-API-Key', 'test-key')
        .expect(404);
    });
  });
});
