import { Test, TestingModule } from '@nestjs/testing';
import { NestExpressApplication } from '@nestjs/platform-express';
import * as request from 'supertest';
import { getAuth } from 'firebase-admin/auth';
import { AppModule } from './../src/app.module';
import { configureApplication } from './../src/bootstrap';

jest.mock('firebase-admin/auth', () => ({
  getAuth: jest.fn(),
}));

describe('AppController (e2e)', () => {
  let app: NestExpressApplication;

  beforeEach(async () => {
    (getAuth as jest.Mock).mockReturnValue({
      verifyIdToken: jest.fn().mockImplementation(async (token: string) => ({
        uid: 'token-user',
        role: token === 'admin-token' ? 'admin' : 'user',
      })),
    });

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication<NestExpressApplication>();
    configureApplication(app);
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('/ (GET)', () => {
    return request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect('Hello World!!!');
  });

  it('/health (GET)', () => {
    return request(app.getHttpServer())
      .get('/health')
      .expect(200)
      .expect({ status: 'ok' });
  });

  it('/users/me (GET) rejects requests without a Firebase token', () => {
    return request(app.getHttpServer()).get('/users/me').expect(401);
  });

  it('/users (POST) no longer exposes unauthenticated signup', () => {
    return request(app.getHttpServer()).post('/users').send({}).expect(404);
  });

  it('/admin/users (GET) rejects a non-admin token', () => {
    return request(app.getHttpServer())
      .get('/admin/users')
      .set('Authorization', 'Bearer user-token')
      .expect(403);
  });

  it('/admin/reports/summary (GET) rejects a non-admin token', () => {
    return request(app.getHttpServer())
      .get('/admin/reports/summary')
      .set('Authorization', 'Bearer valid-token')
      .expect(403);
  });

  it('/users/me rejects privileged profile fields', () => {
    return request(app.getHttpServer())
      .post('/users/me')
      .set('Authorization', 'Bearer user-token')
      .send({
        name: 'Test User',
        phoneNumber: '+96170123456',
        role: 'admin',
      })
      .expect(400);
  });
});
