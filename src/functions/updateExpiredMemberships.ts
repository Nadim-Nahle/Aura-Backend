import { getFirestore } from 'firebase-admin/firestore';
import * as functions from 'firebase-functions/v1';

export const updateExpiredMemberships = functions
  .region('us-central1')
  .pubsub.schedule('59 23 * * *')
  .timeZone('UTC')
  .onRun(async () => {
    const usersRef = getFirestore().collection('users');
    const snapshot = await usersRef.get();
    const currentDate = new Date();

    const usersToUpdate: string[] = [];
    snapshot.forEach((doc) => {
      const user = doc.data();
      if (user.endDate === 'none') {
        return;
      }

      if (new Date(user.endDate) < currentDate && user.membership !== 'none') {
        usersToUpdate.push(doc.id);
      }
    });

    await Promise.all(
      usersToUpdate.map((userId) =>
        usersRef.doc(userId).update({
          membership: 'none',
          privateSessions: '0',
        }),
      ),
    );

    console.log(`Updated ${usersToUpdate.length} expired memberships`);
  });
