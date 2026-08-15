const projectId = process.env.FIREBASE_PROJECT_ID || 'aura-9c98c';
const authBase = process.env.AUTH_EMULATOR_URL || 'http://127.0.0.1:9099';
const apiBase =
  process.env.API_EMULATOR_URL ||
  `http://127.0.0.1:5002/${projectId}/us-central1/api`;
const storageBase = process.env.STORAGE_EMULATOR_URL || 'http://127.0.0.1:9199';
const bucket =
  process.env.FIREBASE_STORAGE_BUCKET || `${projectId}.appspot.com`;

const email = `phase7-${Date.now()}@example.test`;
const password = 'LocalTestPassword123!';
let idToken;

async function request(label, url, options = {}, expectedStatuses = [200]) {
  const response = await fetch(url, options);
  const text = await response.text();
  let body = text;

  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    // Keep non-JSON responses available in failure output.
  }

  if (!expectedStatuses.includes(response.status)) {
    throw new Error(
      `${label}: expected ${expectedStatuses.join('/')} but received ${response.status}: ${text}`,
    );
  }

  console.log(`PASS ${label}`);
  return body;
}

function apiOptions(method, body) {
  return {
    method,
    headers: {
      Authorization: `Bearer ${idToken}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  };
}

async function removeTestAuthUser() {
  if (!idToken) return;

  await fetch(
    `${authBase}/identitytoolkit.googleapis.com/v1/accounts:delete?key=emulator`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken }),
    },
  ).catch(() => undefined);
}

try {
  await request('public health endpoint', `${apiBase}/health`);
  await request(
    'protected endpoint rejects missing token',
    `${apiBase}/users/me`,
    {},
    [401],
  );

  const signup = await request(
    'Auth emulator signup',
    `${authBase}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=emulator`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    },
  );
  idToken = signup.idToken;
  const userId = signup.localId;

  await request(
    'self-profile creation',
    `${apiBase}/users/me`,
    apiOptions('POST', {
      name: 'Phase Seven Tester',
      phoneNumber: '+96170123456',
    }),
    [201],
  );

  await request(
    'non-admin cannot list users',
    `${apiBase}/admin/users`,
    apiOptions('GET'),
    [403],
  );

  await request(
    'privileged self-update field is rejected',
    `${apiBase}/users/me`,
    apiOptions('PUT', { role: 'admin' }),
    [400],
  );

  await request(
    'birth date update',
    `${apiBase}/users/me`,
    apiOptions('PUT', { birthDate: '1995-06-15' }),
  );
  const profile = await request(
    'updated profile retrieval',
    `${apiBase}/users/me`,
    apiOptions('GET'),
  );
  if (profile.birthDate !== '1995-06-15') {
    throw new Error('updated profile retrieval: birth date was not persisted');
  }

  const pictureName = `profile_pictures/${userId}/smoke-test.png`;
  const encodedPictureName = encodeURIComponent(pictureName);
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    'base64',
  );
  const uploadMetadata = await request(
    'owner profile-picture upload',
    `${storageBase}/v0/b/${bucket}/o?uploadType=media&name=${encodedPictureName}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Firebase ${idToken}`,
        'Content-Type': 'image/png',
      },
      body: png,
    },
  );
  const objectMetadataUrl =
    uploadMetadata.selfLink ||
    `${storageBase}/storage/v1/b/${bucket}/o/${encodedPictureName}`;
  await request('uploaded profile picture exists', objectMetadataUrl);

  await request(
    'cross-user profile-picture upload is rejected',
    `${storageBase}/v0/b/${bucket}/o?uploadType=media&name=${encodeURIComponent('profile_pictures/another-user/blocked.png')}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Firebase ${idToken}`,
        'Content-Type': 'image/png',
      },
      body: png,
    },
    [403],
  );

  await request(
    'non-image profile upload is rejected',
    `${storageBase}/v0/b/${bucket}/o?uploadType=media&name=${encodeURIComponent(`profile_pictures/${userId}/blocked.txt`)}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Firebase ${idToken}`,
        'Content-Type': 'text/plain',
      },
      body: 'not an image',
    },
    [403],
  );

  await request(
    'self account deletion',
    `${apiBase}/users/me`,
    apiOptions('DELETE'),
  );

  let deleted = false;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const response = await fetch(objectMetadataUrl);
    if (response.status === 404) {
      deleted = true;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  if (!deleted) {
    throw new Error(
      'deleted-user storage cleanup did not finish within 20 seconds',
    );
  }
  console.log('PASS deleted-user storage cleanup');

  await request(
    'deleted Auth account cannot sign in',
    `${authBase}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=emulator`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    },
    [400],
  );

  console.log('\nPhase 7 emulator smoke test passed.');
} catch (error) {
  await removeTestAuthUser();
  console.error(`\nPhase 7 emulator smoke test failed: ${error.message}`);
  process.exitCode = 1;
}
