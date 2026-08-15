import { NestFactory } from '@nestjs/core';
import {
  ExpressAdapter,
  NestExpressApplication,
} from '@nestjs/platform-express';
import * as express from 'express';
import * as functions from 'firebase-functions/v1';
import { AppModule } from './src/app.module';
import { AuthenticatedRequest } from './src/auth-validation/authenticated-request.interface';
import { configureApplication } from './src/bootstrap';
import { initializeFirebaseAdmin } from './src/firebase-admin';

const expressServer = express();
let nestInitialization: Promise<void> | undefined;

initializeFirebaseAdmin();

const initializeNestApplication = (): Promise<void> => {
  if (!nestInitialization) {
    nestInitialization = (async () => {
      const app = await NestFactory.create<NestExpressApplication>(
        AppModule,
        new ExpressAdapter(expressServer),
      );
      configureApplication(app);
      await app.init();
    })().catch((error) => {
      nestInitialization = undefined;
      throw error;
    });
  }

  return nestInitialization;
};

export const api = functions
  .runWith({ memory: '512MB', minInstances: 1 })
  .region('us-central1')
  .https.onRequest(async (request, response) => {
    const startedAt = performance.now();
    const timedRequest = request as unknown as AuthenticatedRequest;
    response.on('finish', () => {
      const timings = timedRequest.serverTimings ?? {};
      console.log({
        event: 'api_request_timing',
        method: request.method,
        path: request.path,
        statusCode: response.statusCode,
        totalMs: Number((performance.now() - startedAt).toFixed(1)),
        timings: Object.fromEntries(
          Object.entries(timings).map(([name, duration]) => [
            name,
            Number(duration.toFixed(1)),
          ]),
        ),
      });
    });

    const nestStartedAt = performance.now();
    await initializeNestApplication();
    timedRequest.serverTimings ??= {};
    timedRequest.serverTimings.nest_init = performance.now() - nestStartedAt;
    expressServer(request, response);
  });

export { updateExpiredMemberships } from './src/functions/updateExpiredMemberships';
export { cleanupDeletedUser } from './src/functions/cleanupDeletedUser';
