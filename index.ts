import { NestFactory } from '@nestjs/core';
import {
  ExpressAdapter,
  NestExpressApplication,
} from '@nestjs/platform-express';
import * as express from 'express';
import * as functions from 'firebase-functions/v1';
import { AppModule } from './src/app.module';
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
  .runWith({ memory: '512MB' })
  .region('us-central1')
  .https.onRequest(async (request, response) => {
    await initializeNestApplication();
    expressServer(request, response);
  });

export { updateExpiredMemberships } from './src/functions/updateExpiredMemberships';
export { cleanupDeletedUser } from './src/functions/cleanupDeletedUser';
