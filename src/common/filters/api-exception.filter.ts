import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';

type ErrorMessage = string | string[];

interface NormalizedError {
  statusCode: number;
  message: ErrorMessage;
  error: string;
}

const FIREBASE_ERRORS: Record<string, NormalizedError> = {
  'auth/user-not-found': {
    statusCode: HttpStatus.NOT_FOUND,
    message: 'User not found',
    error: 'Not Found',
  },
  'auth/email-already-exists': {
    statusCode: HttpStatus.CONFLICT,
    message: 'Email address is already in use',
    error: 'Conflict',
  },
  'auth/phone-number-already-exists': {
    statusCode: HttpStatus.CONFLICT,
    message: 'Phone number is already in use',
    error: 'Conflict',
  },
  'auth/invalid-email': {
    statusCode: HttpStatus.BAD_REQUEST,
    message: 'Email address is invalid',
    error: 'Bad Request',
  },
  'auth/invalid-phone-number': {
    statusCode: HttpStatus.BAD_REQUEST,
    message: 'Phone number is invalid',
    error: 'Bad Request',
  },
};

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const request = context.getRequest<Request>();
    const response = context.getResponse<Response>();
    const normalized = this.normalize(exception);

    if (normalized.statusCode >= HttpStatus.INTERNAL_SERVER_ERROR) {
      const error = exception as { code?: unknown; name?: unknown };
      console.error({
        event: 'unhandled_api_error',
        method: request.method,
        path: request.originalUrl,
        errorName:
          typeof error?.name === 'string' ? error.name : 'UnknownError',
        errorCode: typeof error?.code === 'string' ? error.code : undefined,
      });
    }

    response.status(normalized.statusCode).json({
      statusCode: normalized.statusCode,
      message: normalized.message,
      error: normalized.error,
      path: request.originalUrl,
      timestamp: new Date().toISOString(),
    });
  }

  private normalize(exception: unknown): NormalizedError {
    if (exception instanceof HttpException) {
      const statusCode = exception.getStatus();
      if (statusCode >= HttpStatus.INTERNAL_SERVER_ERROR) {
        return this.internalServerError();
      }

      const body = exception.getResponse();
      if (typeof body === 'string') {
        return {
          statusCode,
          message: body,
          error: exception.name.replace(/Exception$/, '') || 'Request Error',
        };
      }

      const responseBody = body as { message?: ErrorMessage; error?: string };
      return {
        statusCode,
        message: responseBody.message ?? exception.message,
        error: responseBody.error ?? 'Request Error',
      };
    }

    const code = (exception as { code?: unknown })?.code;
    if (code === 'LIMIT_FILE_SIZE') {
      return {
        statusCode: HttpStatus.PAYLOAD_TOO_LARGE,
        message: 'Uploaded image must be 5 MB or smaller',
        error: 'Payload Too Large',
      };
    }
    if (typeof code === 'string' && FIREBASE_ERRORS[code]) {
      return FIREBASE_ERRORS[code];
    }

    return this.internalServerError();
  }

  private internalServerError(): NormalizedError {
    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Internal server error',
      error: 'Internal Server Error',
    };
  }
}
