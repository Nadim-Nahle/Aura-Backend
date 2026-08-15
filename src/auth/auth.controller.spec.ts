import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { User } from './user.entity';

jest.mock('firebase-admin/auth', () => ({
  getAuth: jest.fn(),
}));
jest.mock('firebase-admin/firestore', () => ({
  getFirestore: jest.fn(),
  FieldValue: { delete: jest.fn() },
}));

describe('AuthController user scoping', () => {
  const user: User = {
    id: 'token-user',
    uid: 'token-user',
    email: 'user@example.com',
    name: 'Test User',
    phoneNumber: '+96170123456',
    profilePicture: '',
    role: 'user',
    barcode: 'none',
    privateSessions: 'none',
    membership: 'none',
    startDate: 'none',
    endDate: 'none',
  };
  const authService = {
    createUserAsAdmin: jest.fn(),
    getUserById: jest.fn(),
    updateUserAsAdmin: jest.fn(),
    updateSelfProfile: jest.fn(),
    deleteUser: jest.fn(),
  } as unknown as AuthService;
  const controller = new AuthController(authService);
  const request = { user: { uid: 'token-user' } } as any;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('loads the profile belonging to the verified token', async () => {
    (authService.getUserById as jest.Mock).mockResolvedValue(user);

    await controller.getMyProfile(request);

    expect(authService.getUserById).toHaveBeenCalledWith('token-user');
  });

  it('updates the profile belonging to the verified token', async () => {
    const update = { name: 'Updated User' };
    (authService.updateSelfProfile as jest.Mock).mockResolvedValue({
      ...user,
      ...update,
    });

    await controller.updateMyProfile(request, update);

    expect(authService.updateSelfProfile).toHaveBeenCalledWith(
      'token-user',
      update,
    );
  });

  it('deletes the account belonging to the verified token', async () => {
    (authService.deleteUser as jest.Mock).mockResolvedValue(undefined);

    await controller.deleteMyAccount(request);

    expect(authService.deleteUser).toHaveBeenCalledWith('token-user');
  });

  it('prevents an administrator from deleting their own account', async () => {
    await expect(
      controller.deleteUserAsAdmin(request, 'token-user'),
    ).rejects.toThrow('You cannot delete your own administrator account');

    expect(authService.deleteUser).not.toHaveBeenCalled();
  });

  it('prevents an administrator from removing their own role', async () => {
    await expect(
      controller.updateUserAsAdmin(request, 'token-user', { role: 'user' }),
    ).rejects.toThrow('You cannot remove your own administrator access');

    expect(authService.updateUserAsAdmin).not.toHaveBeenCalled();
  });
});
