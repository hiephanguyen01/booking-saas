import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadEnvFile } from 'node:process';

/** The monorepo has exactly one dotenv file, at the workspace root. */
export const rootEnvPath = resolve(__dirname, '../../../../.env');

// Production containers commonly inject process env without mounting a file.
// Existing process variables keep precedence over values loaded from `.env`.
if (existsSync(rootEnvPath)) {
  loadEnvFile(rootEnvPath);
}
