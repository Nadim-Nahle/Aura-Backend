import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ApiExceptionFilter } from './common/filters/api-exception.filter';
import { createCorsOptions } from './config/cors.config';

export function configureApplication(app: NestExpressApplication): void {
  app.useBodyParser('json', { limit: '7mb' });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      validationError: {
        target: false,
        value: false,
      },
    }),
  );
  app.useGlobalFilters(new ApiExceptionFilter());
  app.enableCors(createCorsOptions());
}
