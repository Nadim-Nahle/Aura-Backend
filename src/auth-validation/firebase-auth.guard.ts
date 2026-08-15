import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { getAuth } from 'firebase-admin/auth';
import { AuthenticatedRequest } from './authenticated-request.interface';
import { IS_PUBLIC_KEY } from './public.decorator';

@Injectable()
export class FirebaseAuthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const authorization = request.header('authorization');
    const [scheme, token, extra] = authorization?.trim().split(/\s+/) ?? [];

    if (scheme?.toLowerCase() !== 'bearer' || !token || extra) {
      throw new UnauthorizedException('A valid Firebase ID token is required');
    }

    const startedAt = performance.now();
    try {
      request.user = await getAuth().verifyIdToken(token, true);
      return true;
    } catch {
      throw new UnauthorizedException(
        'The Firebase ID token is invalid, expired, or revoked',
      );
    } finally {
      request.serverTimings ??= {};
      request.serverTimings.auth = performance.now() - startedAt;
    }
  }
}
