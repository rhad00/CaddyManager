const fs = require('fs');
const os = require('os');
const path = require('path');
const { postgresSsl } = require('../../src/config/dbSsl');

describe('postgresSsl', () => {
  test('is off unless DB_SSL=true', () => {
    expect(postgresSsl({})).toBe(false);
    expect(postgresSsl({ DB_SSL: 'false' })).toBe(false);
  });

  test('keeps the historical behaviour (encrypted, certificate not verified) by default', () => {
    expect(postgresSsl({ DB_SSL: 'true' })).toEqual({ require: true, rejectUnauthorized: false });
  });

  test('verifies the server certificate when asked to', () => {
    expect(postgresSsl({ DB_SSL: 'true', DB_SSL_REJECT_UNAUTHORIZED: 'true' }))
      .toEqual({ require: true, rejectUnauthorized: true });
  });

  test('a CA file turns verification on and is trusted', () => {
    const file = path.join(os.tmpdir(), `cm-ca-${process.pid}.pem`);
    fs.writeFileSync(file, 'PEM-DATA');
    try {
      expect(postgresSsl({ DB_SSL: 'true', DB_SSL_CA: file }))
        .toEqual({ require: true, rejectUnauthorized: true, ca: 'PEM-DATA' });
    } finally {
      fs.rmSync(file, { force: true });
    }
  });

  test('an unreadable CA file is an error, not a silent downgrade', () => {
    expect(() => postgresSsl({ DB_SSL: 'true', DB_SSL_CA: '/nonexistent/ca.pem' })).toThrow(/DB_SSL_CA/);
  });
});
