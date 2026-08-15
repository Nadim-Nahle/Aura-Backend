import { getStorage } from 'firebase-admin/storage';
import { deleteUserManagedImages } from '../common/storage/profile-picture-storage';

jest.mock('firebase-admin/storage', () => ({
  getStorage: jest.fn(),
}));

describe('deleteUserProfilePictures', () => {
  const deleteFiles = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    deleteFiles.mockResolvedValue(undefined);
    (getStorage as jest.Mock).mockReturnValue({
      bucket: () => ({ deleteFiles }),
    });
  });

  it('deletes the removed user profile-picture and barcode folders', async () => {
    await deleteUserManagedImages('user-1');

    expect(deleteFiles).toHaveBeenCalledWith({
      prefix: 'profile_pictures/user-1/',
    });
    expect(deleteFiles).toHaveBeenCalledWith({
      prefix: 'barcodes/user-1/',
    });
  });
});
