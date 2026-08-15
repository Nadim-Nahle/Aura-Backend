import { App, getApps, initializeApp } from 'firebase-admin/app';

export function initializeFirebaseAdmin(): App {
  return getApps()[0] ?? initializeApp();
}
