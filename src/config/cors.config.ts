import { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';

const DEVELOPMENT_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:8081',
  'http://localhost:19006',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:8081',
  'http://127.0.0.1:19006',
];

export function getAllowedOrigins(
  configuredOrigins = process.env.ALLOWED_ORIGINS,
  environment = process.env.NODE_ENV,
): Set<string> {
  const origins = (configuredOrigins ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (environment !== 'production') {
    origins.push(...DEVELOPMENT_ORIGINS);
  }

  return new Set(origins);
}

export function createCorsOptions(): CorsOptions {
  const allowedOrigins = getAllowedOrigins();

  return {
    origin: (origin, callback) => {
      callback(null, !origin || allowedOrigins.has(origin));
    },
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type', 'X-Firebase-AppCheck'],
    exposedHeaders: [
      'X-Total-Count',
      'X-Page-Limit',
      'X-Next-Page-Token',
      'Server-Timing',
    ],
    credentials: false,
    maxAge: 86400,
  };
}
