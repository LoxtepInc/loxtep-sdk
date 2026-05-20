import { deleteCredentials } from '../credentials.js';

/**
 * Run logout: remove stored credentials file.
 */
export async function runLogout(): Promise<void> {
  await deleteCredentials();
  console.log('Logged out.');
}
