process.env.FIREBASE_AUTH_EMULATOR_HOST ||= '127.0.0.1:9099';
process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8080';
process.env.FIREBASE_STORAGE_EMULATOR_HOST ||= '127.0.0.1:9199';

const projectId = process.env.FIREBASE_PROJECT_ID || 'aura-9c98c';
const authBase = process.env.AUTH_EMULATOR_URL || 'http://127.0.0.1:9099';
const apiBase =
  process.env.API_EMULATOR_URL ||
  `http://127.0.0.1:5002/${projectId}/us-central1/api`;

const { getApps, initializeApp } = await import('firebase-admin/app');
const { getAuth } = await import('firebase-admin/auth');
const { getFirestore } = await import('firebase-admin/firestore');

if (getApps().length === 0) {
  initializeApp({ projectId, storageBucket: `${projectId}.appspot.com` });
}

const suffix = Date.now();
const adminEmail = `admin-smoke-${suffix}@example.test`;
const memberEmail = `member-smoke-${suffix}@example.test`;
const password = 'LocalTestPassword123!';
let adminUser;
let memberId;
let packageId;
let classId;
let expenseId;

async function request(label, path, options = {}, expected = [200]) {
  const response = await fetch(`${apiBase}${path}`, options);
  const text = await response.text();
  let body = text;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    // Preserve a non-JSON response for the error message.
  }

  if (!expected.includes(response.status)) {
    throw new Error(
      `${label}: expected ${expected.join('/')} but received ${response.status}: ${text}`,
    );
  }
  console.log(`PASS ${label}`);
  return body;
}

async function signIn(email) {
  const response = await fetch(
    `${authBase}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=emulator`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    },
  );
  const body = await response.json();
  if (!response.ok)
    throw new Error(`Admin emulator sign-in failed: ${JSON.stringify(body)}`);
  return body.idToken;
}

try {
  adminUser = await getAuth().createUser({
    email: adminEmail,
    password,
    displayName: 'Smoke Admin',
    phoneNumber: '+96170900001',
  });
  await getAuth().setCustomUserClaims(adminUser.uid, { role: 'admin' });
  await getFirestore().collection('users').doc(adminUser.uid).set({
    id: adminUser.uid,
    uid: adminUser.uid,
    email: adminEmail,
    name: 'Smoke Admin',
    phoneNumber: '+96170900001',
    profilePicture: '',
    role: 'admin',
    barcode: 'none',
    privateSessions: 'none',
    membership: 'none',
    startDate: 'none',
    endDate: 'none',
  });

  const token = await signIn(adminEmail);
  const authenticated = (method, body) => ({
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  await request('admin user list', '/admin/users', authenticated('GET'));

  const createdMember = await request(
    'admin user creation',
    '/admin/users',
    authenticated('POST', {
      name: 'Smoke Member',
      email: memberEmail,
      password,
      phoneNumber: '+96170900002',
      membership: 'regular',
      privateSessions: '12',
      startDate: '2026-01-01T00:00:00.000Z',
      endDate: '2026-12-31T00:00:00.000Z',
    }),
    [201],
  );
  memberId = createdMember.user.id;

  const barcodeData =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
  const barcodeResult = await request(
    'admin barcode upload',
    `/admin/users/${memberId}/barcode`,
    authenticated('POST', {
      contentType: 'image/png',
      data: barcodeData,
    }),
    [201],
  );
  if (
    !barcodeResult.user.barcode.includes(
      encodeURIComponent(`barcodes/${memberId}/`),
    )
  ) {
    throw new Error(
      'admin barcode upload: response did not contain a managed barcode URL',
    );
  }

  const createdPackage = await request(
    'admin package creation',
    '/packages',
    authenticated('POST', {
      name: 'Smoke Package',
      description: 'Temporary test package',
      price: 25,
    }),
    [201],
  );
  packageId = createdPackage.id;

  const createdClass = await request(
    'admin class creation',
    '/classes',
    authenticated('POST', { name: 'Smoke Class', price: '15' }),
    [201],
  );
  classId = createdClass.id;

  const createdExpense = await request(
    'admin expense creation',
    '/expenses',
    authenticated('POST', { name: 'Smoke Expense', price: 5 }),
    [201],
  );
  expenseId = createdExpense.id;
  await request('admin expense list', '/expenses', authenticated('GET'));

  await request(
    'admin self-delete protection',
    `/admin/users/${adminUser.uid}`,
    authenticated('DELETE'),
    [400],
  );
  await request(
    'admin expense deletion',
    `/expenses/${expenseId}`,
    authenticated('DELETE'),
  );
  expenseId = undefined;
  await request(
    'admin package deletion',
    `/packages/${packageId}`,
    authenticated('DELETE'),
  );
  packageId = undefined;
  await request(
    'admin class deletion',
    `/classes/${classId}`,
    authenticated('DELETE'),
  );
  classId = undefined;
  await request(
    'admin user deletion',
    `/admin/users/${memberId}`,
    authenticated('DELETE'),
  );
  memberId = undefined;

  console.log('\nAdmin emulator smoke test passed.');
} finally {
  const firestore = getFirestore();
  if (expenseId)
    await firestore
      .collection('expenses')
      .doc(expenseId)
      .delete()
      .catch(() => undefined);
  if (packageId)
    await firestore
      .collection('packages')
      .doc(packageId)
      .delete()
      .catch(() => undefined);
  if (classId)
    await firestore
      .collection('classes')
      .doc(classId)
      .delete()
      .catch(() => undefined);
  if (memberId)
    await getAuth()
      .deleteUser(memberId)
      .catch(() => undefined);
  if (adminUser) {
    await firestore
      .collection('users')
      .doc(adminUser.uid)
      .delete()
      .catch(() => undefined);
    await getAuth()
      .deleteUser(adminUser.uid)
      .catch(() => undefined);
  }
}
