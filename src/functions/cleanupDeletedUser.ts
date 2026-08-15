import * as functions from 'firebase-functions/v1';
import { deleteUserManagedImages } from '../common/storage/profile-picture-storage';

export const cleanupDeletedUser = functions
  .runWith({ failurePolicy: true })
  .region('us-central1')
  .auth.user()
  .onDelete(async (user) => {
    await deleteUserManagedImages(user.uid);
  });
