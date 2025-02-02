import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

admin.initializeApp();

export const updateExpiredMemberships = functions.pubsub
  .schedule('59 23 * * *') // Every day at 11:59 PM UTC
  .timeZone('UTC') // Set the time zone to UTC
  .onRun(async () => {
    console.log('Running scheduled task to update expired memberships');

    const firestore = admin.firestore();
    const usersRef = firestore.collection('users');
    const snapshot = await usersRef.get();
    const currentDate = new Date();

    const usersToUpdate: any[] = [];

    snapshot.forEach((doc) => {
      const user = doc.data();
      const endDate = user.endDate;

      // Skip users with 'none' as the endDate
      if (endDate === 'none') {
        return;
      }

      // Convert the endDate string to a Date object
      const endDateObj = new Date(endDate);

      // If the end date has passed and membership is not already 'none', update the membership type
      if (endDateObj < currentDate && user.membership !== 'none') {
        usersToUpdate.push(doc.id);
      }
    });

    const updatePromises = usersToUpdate.map((userId) => {
      return usersRef.doc(userId).update({ membership: 'none' });
    });

    await Promise.all(updatePromises);

    console.log(
      `Updated ${usersToUpdate.length} users' membership types to 'none'`,
    );
  });
