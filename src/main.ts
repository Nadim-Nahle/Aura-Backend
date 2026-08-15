import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { configureApplication } from './bootstrap';
import { initializeFirebaseAdmin } from './firebase-admin';

async function bootstrap() {
  initializeFirebaseAdmin();
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  configureApplication(app);
  await app.listen(Number(process.env.PORT) || 3000);
}
bootstrap();
