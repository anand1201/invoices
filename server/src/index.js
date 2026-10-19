/**
 * Server entry point.
 *
 * In development this runs on :4000 and Vite proxies /api to it. In production
 * `npm run build` emits client/dist and this same process serves it, so the
 * whole app is one deployable Node service on one port.
 */

import fs from 'node:fs';
import express from 'express';
import cors from 'cors';

import { config, isProduction } from './config.js';
import { initSchema, closePool } from './db.js';
import { mailStatus } from './mailer.js';
import router from './routes.js';

const app = express();

app.disable('x-powered-by');
app.set('trust proxy', 1);

app.use(
  cors({
    origin(origin, callback) {
      // No Origin header: same-origin requests, curl, health checks.
      if (!origin || config.corsOrigins.includes(origin)) return callback(null, true);
      callback(new Error(`Origin ${origin} is not allowed by CORS_ORIGIN.`));
    },
  }),
);

// Invoices are small documents; a 1 MB cap is generous and stops a junk body
// from being parsed at all.
app.use(express.json({ limit: '1mb' }));

app.use('/api', router);

// --- static client (production) --------------------------------------------
if (fs.existsSync(config.clientDist)) {
  app.use(express.static(config.clientDist, { index: false, maxAge: isProduction ? '1h' : 0 }));
  app.get(/^\/(?!api\/).*/, (req, res) => {
    res.sendFile('index.html', { root: config.clientDist });
  });
}

// --- errors ----------------------------------------------------------------
app.use((req, res) => {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'No such endpoint.' } });
});

// eslint-disable-next-line no-unused-vars -- Express needs the 4-arg signature
app.use((error, req, res, next) => {
  const status = error.statusCode || 500;
  if (status >= 500) console.error('[api]', error);
  res.status(status).json({
    error: {
      code: error.code || 'INTERNAL_ERROR',
      message: status >= 500 && isProduction ? 'Something went wrong.' : error.message,
      // Field-level map the editor turns into inline messages.
      ...(error.errors ? { errors: error.errors } : {}),
    },
  });
});

// --- boot ------------------------------------------------------------------
async function start() {
  try {
    await initSchema();
    console.log(`[db]   connected to ${config.db.host}:${config.db.port}/${config.db.database}`);
  } catch (error) {
    // A missing database should not silently look like a working app.
    console.error('\n[db]   FAILED to connect or create the schema.');
    console.error('       ', error.message);
    console.error('       Check DB_HOST/DB_PORT/DB_USER/DB_PASSWORD in your .env, then restart.\n');
    process.exitCode = 1;
    return;
  }

  const mail = mailStatus();
  console.log(
    `[mail] transport=${mail.transport}${mail.host ? ` host=${mail.host}` : ''}` +
      (mail.transport === 'ethereal' ? '  (dev preview only — no real delivery)' : ''),
  );

  const server = app.listen(config.port, () => {
    console.log(`[api]  listening on http://localhost:${config.port}`);
  });

  const shutdown = async (signal) => {
    console.log(`\n[api]  ${signal} received, shutting down`);
    server.close(async () => {
      await closePool().catch(() => {});
      process.exit(0);
    });
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

start();

export default app;
