import { getStorage } from 'firebase-admin/storage';

export async function deleteUserManagedImages(userId: string): Promise<void> {
  const bucket = getStorage().bucket();
  await Promise.all([
    bucket.deleteFiles({ prefix: `profile_pictures/${userId}/` }),
    bucket.deleteFiles({ prefix: `barcodes/${userId}/` }),
  ]);
}
