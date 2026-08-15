import {
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { getAuth } from 'firebase-admin/auth';
import { FirebaseAuthGuard } from './firebase-auth.guard';
import { RolesGuard } from './roles.guard';

jest.mock('firebase-admin/auth', () => ({
  getAuth: jest.fn(),
}));

const createContext = (request: Record<string, any>): ExecutionContext =>
  ({
    getHandler: jest.fn(),
    getClass: jest.fn(),
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  }) as unknown as ExecutionContext;

describe('FirebaseAuthGuard', () => {
  const getAllAndOverride = jest.fn();
  const reflector = { getAllAndOverride } as unknown as Reflector;
  const guard = new FirebaseAuthGuard(reflector);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('allows explicitly public routes without a token', async () => {
    getAllAndOverride.mockReturnValue(true);

    await expect(
      guard.canActivate(createContext({ header: jest.fn() })),
    ).resolves.toBe(true);
    expect(getAuth).not.toHaveBeenCalled();
  });

  it('rejects a protected route without a bearer token', async () => {
    getAllAndOverride.mockReturnValue(false);

    await expect(
      guard.canActivate(
        createContext({ header: jest.fn().mockReturnValue(undefined) }),
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('verifies the token and attaches the decoded identity', async () => {
    const decodedToken = { uid: 'user-1', role: 'user' };
    const verifyIdToken = jest.fn().mockResolvedValue(decodedToken);
    (getAuth as jest.Mock).mockReturnValue({ verifyIdToken });
    getAllAndOverride.mockReturnValue(false);
    const request = {
      header: jest.fn().mockReturnValue('Bearer valid-token'),
    };

    await expect(guard.canActivate(createContext(request))).resolves.toBe(true);
    expect(verifyIdToken).toHaveBeenCalledWith('valid-token', true);
    expect(request).toHaveProperty('user', decodedToken);
  });

  it('rejects invalid, expired, or revoked tokens', async () => {
    const verifyIdToken = jest.fn().mockRejectedValue(new Error('expired'));
    (getAuth as jest.Mock).mockReturnValue({ verifyIdToken });
    getAllAndOverride.mockReturnValue(false);

    await expect(
      guard.canActivate(
        createContext({
          header: jest.fn().mockReturnValue('Bearer invalid-token'),
        }),
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});

describe('RolesGuard', () => {
  const getAllAndOverride = jest.fn();
  const guard = new RolesGuard({ getAllAndOverride } as unknown as Reflector);

  beforeEach(() => {
    jest.clearAllMocks();
    getAllAndOverride.mockReturnValue(['admin']);
  });

  it('allows a user with the required custom claim', () => {
    expect(
      guard.canActivate(
        createContext({ user: { uid: 'admin-1', role: 'admin' } }),
      ),
    ).toBe(true);
  });

  it('rejects a user without the required custom claim', () => {
    expect(() =>
      guard.canActivate(
        createContext({ user: { uid: 'user-1', role: 'user' } }),
      ),
    ).toThrow(ForbiddenException);
  });
});
