import fs from 'fs';

export interface PostgresSsl {
  require: true;
  rejectUnauthorized: boolean;
  ca?: string;
}

/**
 * TLS options for the PostgreSQL connection.
 *
 * - DB_SSL=true                      encrypt, certificate not verified (the historical behaviour,
 *                                    kept so existing deployments with private CAs keep working)
 * - DB_SSL_REJECT_UNAUTHORIZED=true  also verify the server certificate against the system CAs
 * - DB_SSL_CA=/path/ca.pem           verify against this CA (implies verification)
 */
export function postgresSsl(env: NodeJS.ProcessEnv): PostgresSsl | false {
  if (env.DB_SSL !== 'true') return false;

  const options: PostgresSsl = { require: true, rejectUnauthorized: env.DB_SSL_REJECT_UNAUTHORIZED === 'true' };
  if (env.DB_SSL_CA) {
    try {
      options.ca = fs.readFileSync(env.DB_SSL_CA, 'utf8');
    } catch (error) {
      throw new Error(`DB_SSL_CA could not be read (${env.DB_SSL_CA}): ${(error as Error).message}`);
    }
    options.rejectUnauthorized = true;
  }
  if (!options.rejectUnauthorized) {
    console.warn('WARNING: DB_SSL is on but the PostgreSQL certificate is not verified. Set DB_SSL_CA or DB_SSL_REJECT_UNAUTHORIZED=true.');
  }
  return options;
}
