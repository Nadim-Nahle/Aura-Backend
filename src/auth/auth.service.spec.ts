import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { AuthService } from './auth.service';

jest.mock('firebase-admin/auth', () => ({
  getAuth: jest.fn(),
}));
jest.mock('firebase-admin/firestore', () => ({
  getFirestore: jest.fn(),
  FieldValue: { delete: jest.fn(() => 'DELETE_FIELD') },
  FieldPath: { documentId: jest.fn(() => 'DOCUMENT_ID') },
}));

describe('AuthService consistency', () => {
  const auth = {
    createUser: jest.fn(),
    getUser: jest.fn(),
    getUsers: jest.fn(),
    updateUser: jest.fn(),
    setCustomUserClaims: jest.fn(),
    deleteUser: jest.fn(),
  };
  const userRef = {
    get: jest.fn(),
    set: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };
  const pageQuery = {
    startAfter: jest.fn(),
    select: jest.fn(),
    limit: jest.fn(),
    get: jest.fn(),
  };
  const countQuery = {
    get: jest.fn(),
  };
  const usersCollection = {
    doc: jest.fn(() => userRef),
    get: jest.fn(),
    orderBy: jest.fn(() => pageQuery),
    count: jest.fn(() => countQuery),
  };
  const firestore = {
    collection: jest.fn(() => usersCollection),
  };
  const originalAuthUser = {
    uid: 'user-1',
    email: 'user@example.com',
    displayName: 'Original Name',
    phoneNumber: '+96170111111',
    customClaims: { role: 'user', plan: 'existing' },
  };
  let service: AuthService;

  beforeEach(() => {
    jest.clearAllMocks();
    (getAuth as jest.Mock).mockReturnValue(auth);
    (getFirestore as jest.Mock).mockReturnValue(firestore);
    auth.getUser.mockResolvedValue(originalAuthUser);
    auth.getUsers.mockResolvedValue({ users: [] });
    auth.createUser.mockResolvedValue(originalAuthUser);
    auth.updateUser.mockResolvedValue(originalAuthUser);
    auth.setCustomUserClaims.mockResolvedValue(undefined);
    auth.deleteUser.mockResolvedValue(undefined);
    userRef.get.mockResolvedValue({ exists: true, data: () => ({}) });
    userRef.set.mockResolvedValue(undefined);
    userRef.update.mockResolvedValue(undefined);
    userRef.delete.mockResolvedValue(undefined);
    usersCollection.get.mockResolvedValue({ docs: [] });
    pageQuery.startAfter.mockReturnValue(pageQuery);
    pageQuery.select.mockReturnValue(pageQuery);
    pageQuery.limit.mockReturnValue(pageQuery);
    pageQuery.get.mockResolvedValue({ docs: [] });
    countQuery.get.mockResolvedValue({ data: () => ({ count: 0 }) });
    (FieldValue.delete as jest.Mock).mockReturnValue('DELETE_FIELD');
    service = new AuthService();
  });

  it('restores Auth fields and claims when profile creation fails', async () => {
    userRef.get.mockResolvedValue({ exists: false, data: () => undefined });
    userRef.set.mockRejectedValue(new Error('firestore unavailable'));

    await expect(
      service.createSelfProfile('user-1', {
        name: 'New Name',
        phoneNumber: '+96170222222',
        birthDate: '1990-05-20',
      }),
    ).rejects.toThrow('firestore unavailable');

    expect(auth.updateUser).toHaveBeenNthCalledWith(1, 'user-1', {
      displayName: 'New Name',
      phoneNumber: '+96170222222',
    });
    expect(auth.updateUser).toHaveBeenNthCalledWith(2, 'user-1', {
      displayName: 'Original Name',
      phoneNumber: '+96170111111',
    });
    expect(auth.setCustomUserClaims).toHaveBeenLastCalledWith('user-1', {
      role: 'user',
      plan: 'existing',
    });
  });

  it('creates an Auth user, admin claim, and matching profile as admin', async () => {
    auth.createUser.mockResolvedValue({ ...originalAuthUser, uid: 'new-user' });

    const user = await service.createUserAsAdmin({
      name: ' New User ',
      email: 'NEW@EXAMPLE.COM',
      password: 'Password123!',
      phoneNumber: ' +96170222222 ',
      role: 'user',
      membership: 'regular',
    });

    expect(auth.createUser).toHaveBeenCalledWith({
      displayName: 'New User',
      email: 'new@example.com',
      password: 'Password123!',
      phoneNumber: '+96170222222',
    });
    expect(auth.setCustomUserClaims).toHaveBeenCalledWith('new-user', {
      role: 'user',
    });
    expect(userRef.set).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'new-user',
        email: 'new@example.com',
        membership: 'regular',
      }),
    );
    expect(user.id).toBe('new-user');
  });

  it('deletes a partially created Auth user when profile creation fails', async () => {
    auth.createUser.mockResolvedValue({ ...originalAuthUser, uid: 'new-user' });
    userRef.set.mockRejectedValue(new Error('firestore unavailable'));

    await expect(
      service.createUserAsAdmin({
        name: 'New User',
        email: 'new@example.com',
        password: 'Password123!',
        phoneNumber: '+96170222222',
      }),
    ).rejects.toThrow('firestore unavailable');

    expect(auth.deleteUser).toHaveBeenCalledWith('new-user');
  });

  it('restores Auth fields when a self-profile Firestore update fails', async () => {
    userRef.update.mockRejectedValue(new Error('firestore unavailable'));

    await expect(
      service.updateSelfProfile('user-1', {
        name: '  Updated Name  ',
        phoneNumber: '  +96170333333  ',
      }),
    ).rejects.toThrow('firestore unavailable');

    expect(auth.updateUser).toHaveBeenNthCalledWith(1, 'user-1', {
      displayName: 'Updated Name',
      phoneNumber: '+96170333333',
    });
    expect(auth.updateUser).toHaveBeenNthCalledWith(2, 'user-1', {
      displayName: 'Original Name',
      phoneNumber: '+96170111111',
    });
  });

  it('restores custom claims when an admin profile update fails', async () => {
    userRef.update.mockRejectedValue(new Error('firestore unavailable'));

    await expect(
      service.updateUserAsAdmin('user-1', { role: 'admin' }),
    ).rejects.toThrow('firestore unavailable');

    expect(auth.setCustomUserClaims).toHaveBeenNthCalledWith(1, 'user-1', {
      role: 'admin',
      plan: 'existing',
    });
    expect(auth.setCustomUserClaims).toHaveBeenNthCalledWith(2, 'user-1', {
      role: 'user',
      plan: 'existing',
    });
  });

  it('restores the Firestore profile when Auth deletion fails', async () => {
    const profile = { id: 'user-1', name: 'Original Name' };
    userRef.get.mockResolvedValue({ exists: true, data: () => profile });
    auth.deleteUser.mockRejectedValue(new Error('auth unavailable'));

    await expect(service.deleteUser('user-1')).rejects.toThrow(
      'auth unavailable',
    );

    expect(userRef.delete).toHaveBeenCalled();
    expect(userRef.set).toHaveBeenCalledWith(profile);
  });

  it('finishes profile cleanup when the Auth user is already absent', async () => {
    userRef.get.mockResolvedValue({
      exists: true,
      data: () => ({ id: 'user-1' }),
    });
    auth.deleteUser.mockRejectedValue({ code: 'auth/user-not-found' });

    await expect(service.deleteUser('user-1')).resolves.toBeUndefined();

    expect(userRef.delete).toHaveBeenCalled();
    expect(userRef.set).not.toHaveBeenCalled();
  });

  it('uses Auth custom claims as the authoritative role', async () => {
    userRef.get.mockResolvedValue({
      exists: true,
      data: () => ({
        id: 'user-1',
        email: 'user@example.com',
        name: 'Original Name',
        role: 'admin',
      }),
    });

    const user = await service.getUserById('user-1');

    expect(user.role).toBe('user');
  });

  it('loads one Firestore page with authoritative Auth roles', async () => {
    const docs = Array.from({ length: 51 }, (_, index) => ({
      id: `user-${index}`,
      data: () => ({
        email: `profile-${index}@example.com`,
        name: `Profile ${index}`,
        role: index === 0 ? 'admin' : 'user',
      }),
    }));
    pageQuery.get.mockResolvedValue({ docs });
    countQuery.get.mockResolvedValue({ data: () => ({ count: 101 }) });
    auth.getUsers.mockResolvedValue({
      users: docs.slice(0, 50).map((doc, index) => ({
        uid: doc.id,
        email: `auth-${index}@example.com`,
        customClaims: index === 0 ? { role: 'user' } : {},
      })),
    });

    const page = await service.getUsersPage(50);

    expect(pageQuery.limit).toHaveBeenCalledWith(51);
    expect(pageQuery.select).toHaveBeenCalledWith(
      'email',
      'phoneNumber',
      'name',
      'role',
      'profilePicture',
      'barcode',
      'privateSessions',
      'membership',
      'startDate',
      'endDate',
      'birthDate',
    );
    expect(auth.getUsers).toHaveBeenCalledTimes(1);
    expect(auth.getUsers.mock.calls[0][0]).toHaveLength(50);
    expect(auth.getUser).not.toHaveBeenCalled();
    expect(page.users).toHaveLength(50);
    expect(page.total).toBe(101);
    expect(page.nextPageToken).toBeDefined();
    expect(page.users[0]).toEqual(
      expect.objectContaining({
        id: 'user-0',
        email: 'auth-0@example.com',
        role: 'user',
      }),
    );
  });

  it('filters the directory before paginating search results', async () => {
    const docs = [
      {
        id: 'user-1',
        data: () => ({ name: 'Nadim Nahle', email: 'nadim@example.com' }),
      },
      {
        id: 'user-2',
        data: () => ({ name: 'Another Member', email: 'other@example.com' }),
      },
    ];
    pageQuery.get.mockResolvedValue({ docs });
    auth.getUsers.mockResolvedValue({
      users: [
        {
          uid: 'user-1',
          email: 'nadim@example.com',
          customClaims: { role: 'admin' },
        },
      ],
    });

    const page = await service.getUsersPage(50, undefined, '  NADIM  ');

    expect(page.total).toBe(1);
    expect(page.users).toHaveLength(1);
    expect(page.users[0]).toEqual(
      expect.objectContaining({ id: 'user-1', role: 'admin' }),
    );
    expect(countQuery.get).not.toHaveBeenCalled();
  });

  it('continues a user page from an opaque cursor', async () => {
    const token = Buffer.from(
      JSON.stringify({ version: 1, userId: 'user-49' }),
      'utf8',
    ).toString('base64url');

    await service.getUsersPage(50, token);

    expect(pageQuery.startAfter).toHaveBeenCalledWith('user-49');
  });

  it('reuses a recent directory page without another Firestore read', async () => {
    await service.getUsersPage(50);
    await service.getUsersPage(50);

    expect(pageQuery.get).toHaveBeenCalledTimes(1);
    expect(countQuery.get).toHaveBeenCalledTimes(1);
  });

  it('invalidates cached directory pages after a profile update', async () => {
    await service.getUsersPage(50);
    await service.updateSelfProfile('user-1', { name: 'Updated Name' });
    await service.getUsersPage(50);

    expect(pageQuery.get).toHaveBeenCalledTimes(2);
    expect(countQuery.get).toHaveBeenCalledTimes(2);
  });

  it('rejects malformed user page cursors', async () => {
    await expect(service.getUsersPage(50, 'not-a-valid-token')).rejects.toThrow(
      'The page token is invalid',
    );
    expect(pageQuery.get).not.toHaveBeenCalled();
  });
});
