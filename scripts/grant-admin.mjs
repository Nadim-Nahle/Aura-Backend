import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const projectId =
  process.env.GCLOUD_PROJECT ||
  process.env.GOOGLE_CLOUD_PROJECT ||
  'aura-9c98c';

const resolveCredential = async () => {
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    return applicationDefault();
  }

  const cliAuth = require('firebase-tools/lib/auth');
  const cliApi = require('firebase-tools/lib/apiv2');
  const account = cliAuth.getProjectDefaultAccount(process.cwd());
  if (!account?.tokens?.refresh_token) {
    throw new Error(
      'No Google application credentials or Firebase CLI login found.',
    );
  }
  cliAuth.setRefreshToken(account.tokens.refresh_token);
  return {
    async getAccessToken() {
      return {
        access_token: await cliApi.getAccessToken(),
        expires_in: 3600,
      };
    },
  };
};

const email = process.argv[2]?.trim().toLowerCase();
if (!email) {
  console.error('Usage: npm run admin:grant -- admin@example.com');
  process.exitCode = 1;
} else {
  const credential = await resolveCredential();
  if (getApps().length === 0) {
    initializeApp({ credential, projectId });
  }

  const user = await getAuth().getUserByEmail(email);
  await getAuth().setCustomUserClaims(user.uid, {
    ...(user.customClaims ?? {}),
    role: 'admin',
  });
  const { access_token: accessToken } = await credential.getAccessToken();
  const firestoreUrl =
    `https://firestore.googleapis.com/v1/projects/${projectId}` +
    `/databases/(default)/documents/users/${encodeURIComponent(user.uid)}` +
    '?updateMask.fieldPaths=role';
  const response = await fetch(firestoreUrl, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ fields: { role: { stringValue: 'admin' } } }),
  });
  if (!response.ok) {
    throw new Error(
      `Failed to update the Firestore role (${response.status}): ${await response.text()}`,
    );
  }

  console.log(`Granted admin access to ${email} (${user.uid}).`);
  console.log('The user must sign out and sign in again to refresh the token.');
}
