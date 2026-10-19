/**
 * PM2 process definition.
 *
 * One Node process serves both the API and the built client out of
 * `client/dist`, so Apache only has to reverse-proxy a single port.
 *
 * Bound to 127.0.0.1 by the app's own listen call is NOT the default, so the
 * port is kept off the public interface by the firewall + the fact that only
 * Apache talks to it. Change PORT here and in the Apache vhost together.
 */

module.exports = {
  apps: [
    {
      name: 'invoice-studio',
      cwd: '/var/www/invoice.nextolive.com',
      script: 'server/src/index.js',
      exec_mode: 'fork',
      instances: 1,
      // Secrets are NOT here — the server reads server/.env itself, so this
      // file stays safe to commit.
      env: {
        NODE_ENV: 'production',
        PORT: 4700,
      },
      max_memory_restart: '400M',
      autorestart: true,
      // Don't thrash if the DB is down at boot; back off instead.
      restart_delay: 3000,
      max_restarts: 10,
      out_file: '/var/log/pm2/invoice-studio-out.log',
      error_file: '/var/log/pm2/invoice-studio-error.log',
      merge_logs: true,
      time: true,
    },
  ],
};
