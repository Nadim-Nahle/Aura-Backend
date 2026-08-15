import { existsSync } from 'fs';
import { resolve } from 'path';
import { spawnSync } from 'child_process';

const mode = process.argv[2] || 'start';
const environment = {
  ...process.env,
  FUNCTIONS_DISCOVERY_TIMEOUT: '60',
};

if (process.platform === 'win32') {
  const programFiles = process.env.ProgramFiles || 'C:\\Program Files';
  const bundledJdk = resolve(programFiles, 'Java', 'jdk-24');
  if (existsSync(resolve(bundledJdk, 'bin', 'java.exe'))) {
    environment.JAVA_HOME = bundledJdk;
    const pathKey =
      Object.keys(environment).find((key) => key.toLowerCase() === 'path') ||
      'PATH';
    environment[pathKey] =
      `${resolve(bundledJdk, 'bin')};${environment[pathKey] || ''}`;
  }
}

const firebaseCli = resolve(
  'node_modules',
  'firebase-tools',
  'lib',
  'bin',
  'firebase.js',
);
const commonArguments = [
  '--only',
  'auth,functions,firestore,storage',
  '--project',
  'aura-9c98c',
];

const commands = {
  start: ['emulators:start', ...commonArguments],
  'self-test': [
    'emulators:exec',
    ...commonArguments,
    `"${process.execPath}" test/emulator-smoke.mjs`,
  ],
  'admin-test': [
    'emulators:exec',
    ...commonArguments,
    `"${process.execPath}" test/admin-emulator-smoke.mjs`,
  ],
};

if (!commands[mode]) {
  console.error(`Unknown emulator mode: ${mode}`);
  process.exitCode = 1;
} else {
  const result = spawnSync(process.execPath, [firebaseCli, ...commands[mode]], {
    cwd: process.cwd(),
    env: environment,
    stdio: 'inherit',
  });
  process.exitCode = result.status ?? 1;
}
