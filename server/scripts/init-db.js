/**
 * One-shot schema setup: `npm run db:init`.
 *
 * The server also calls `initSchema()` on boot, so this script is mostly a
 * convenience for CI and for checking credentials without starting the API.
 */

import { config } from '../src/config.js';
import { initSchema, closePool, query } from '../src/db.js';

try {
  await initSchema();
  const [{ invoices }] = await query('SELECT COUNT(*) AS invoices FROM invoices');
  console.log(
    `OK  ${config.db.user}@${config.db.host}:${config.db.port}/${config.db.database} ` +
      `— schema ready, ${invoices} invoice(s) stored.`,
  );
} catch (error) {
  console.error('FAILED to initialise the database.');
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await closePool().catch(() => {});
}
