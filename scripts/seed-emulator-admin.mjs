process.env.FIREBASE_AUTH_EMULATOR_HOST ||= '127.0.0.1:9099';
process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8080';
process.env.FIREBASE_STORAGE_EMULATOR_HOST ||= '127.0.0.1:9199';

const { getApps, initializeApp } = await import('firebase-admin/app');
const { getAuth } = await import('firebase-admin/auth');
const { getFirestore } = await import('firebase-admin/firestore');

const projectId = process.env.FIREBASE_PROJECT_ID || 'aura-9c98c';
const email = process.env.EMULATOR_ADMIN_EMAIL || 'admin@example.test';
const password = process.env.EMULATOR_ADMIN_PASSWORD || 'AdminPassword123!';
const phoneNumber = '+96170123456';

if (getApps().length === 0) {
  initializeApp({ projectId, storageBucket: `${projectId}.appspot.com` });
}

const auth = getAuth();
let user;
try {
  user = await auth.getUserByEmail(email);
  await auth.updateUser(user.uid, {
    displayName: 'Local Admin',
    password,
    phoneNumber,
  });
} catch (error) {
  if (error?.code !== 'auth/user-not-found') throw error;
  user = await auth.createUser({
    displayName: 'Local Admin',
    email,
    password,
    phoneNumber,
  });
}

await auth.setCustomUserClaims(user.uid, { role: 'admin' });
await getFirestore().collection('users').doc(user.uid).set(
  {
    id: user.uid,
    uid: user.uid,
    email,
    name: 'Local Admin',
    phoneNumber,
    profilePicture: '',
    role: 'admin',
    barcode: 'none',
    privateSessions: 'none',
    membership: 'none',
    startDate: 'none',
    endDate: 'none',
  },
  { merge: true },
);

console.log(`Local admin ready: ${email} / ${password}`);
