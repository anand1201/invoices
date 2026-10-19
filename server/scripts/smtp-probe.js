/**
 * SMTP connectivity probe: `npm run smtp:probe --workspace server`
 *
 * Reads credentials from the server's own .env (never from argv, so a password
 * never lands in shell history) and works out which port/TLS combination the
 * host accepts.
 *
 * Deliberately split into two phases. Phase 1 tests the *transport* only —
 * connect, greet, STARTTLS — with no credentials at all. Phase 2 then makes a
 * single authenticated attempt against the one configuration that worked.
 *
 * That split matters: cPanel/HostGator hosts run cPHulk, which blocks the
 * source IP after a handful of failed logins. A naive probe that tries four
 * ports x two TLS modes would spend eight auth attempts and get the developer
 * banned while they are still debugging a typo.
 */

import nodemailer from 'nodemailer';
import { config } from '../src/config.js';

const { host, user, password } = config.mail;

if (!host) {
  console.error('SMTP_HOST is not set in server/.env — nothing to probe.');
  process.exit(1);
}

const candidates = [
  { port: 465, secure: true, label: '465  implicit TLS' },
  { port: 587, secure: false, label: '587  STARTTLS   ' },
  { port: 25, secure: false, label: '25   STARTTLS   ' },
  { port: 2525, secure: false, label: '2525 STARTTLS   ' },
];

const transportFor = (candidate, strictTls, withAuth) =>
  nodemailer.createTransport({
    host,
    port: candidate.port,
    secure: candidate.secure,
    auth: withAuth && user ? { user, pass: password } : undefined,
    connectionTimeout: 12_000,
    greetingTimeout: 8_000,
    socketTimeout: 12_000,
    tls: strictTls ? undefined : { rejectUnauthorized: false },
  });

const firstLine = (error) => `${error.code || ''} ${String(error.message).split('\n')[0]}`.trim();

// --- phase 1: transport only, no credentials -------------------------------
console.log(`Phase 1 — transport reachability for ${host} (no credentials sent)\n`);

let chosen = null;

for (const candidate of candidates) {
  if (chosen) break;
  for (const strictTls of [true, false]) {
    const transporter = transportFor(candidate, strictTls, false);
    const tlsLabel = strictTls ? 'strict TLS ' : 'relaxed TLS';
    try {
      await transporter.verify();
      console.log(`  OK    ${candidate.label}  ${tlsLabel}`);
      chosen = { ...candidate, strictTls };
      transporter.close();
      break;
    } catch (error) {
      console.log(`  fail  ${candidate.label}  ${tlsLabel}  ${firstLine(error)}`);
      transporter.close();
    }
  }
}

if (!chosen) {
  console.log('\nNo port accepted a connection. Either the hostname is wrong, or');
  console.log('outbound SMTP is blocked on this network.');
  process.exit(1);
}

// --- phase 2: exactly one authenticated attempt ----------------------------
console.log(`\nPhase 2 — one authenticated attempt on port ${chosen.port} as ${user}\n`);

const authTransport = transportFor(chosen, chosen.strictTls, true);
let authOk = false;
try {
  await authTransport.verify();
  authOk = true;
  console.log('  OK    credentials accepted');
} catch (error) {
  console.log(`  fail  ${firstLine(error)}`);
  if (error.responseCode === 535 || /535|authentication failed/i.test(String(error.message))) {
    console.log('\n  535 means the transport is fine and the username/password pair was');
    console.log('  rejected. Check the mailbox password in cPanel. Not retrying — repeated');
    console.log('  failures trip cPHulk and get this IP blocked.');
  }
} finally {
  authTransport.close();
}

console.log('\nValues for server/.env:');
console.log(`  SMTP_HOST=${host}`);
console.log(`  SMTP_PORT=${chosen.port}`);
console.log(`  SMTP_SECURE=${chosen.secure}`);
console.log(`  SMTP_ALLOW_SELF_SIGNED=${chosen.strictTls ? 'false' : 'true'}`);

process.exit(authOk ? 0 : 1);
