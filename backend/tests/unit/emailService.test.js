const { sendPasswordResetEmail } = require('../../src/services/emailService');

describe('emailService', () => {
  let infoSpy, warnSpy;

  beforeEach(() => {
    jest.clearAllMocks();
    infoSpy = jest.spyOn(console, 'info').mockImplementation(() => {});
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    // Reset transporter so SMTP_HOST is re-evaluated
    delete process.env.SMTP_HOST;
  });

  afterEach(() => {
    infoSpy.mockRestore();
    warnSpy.mockRestore();
  });

  test('logs the reset link when SMTP is not configured', async () => {
    await sendPasswordResetEmail('user@example.com', 'abc123');

    expect(infoSpy).toHaveBeenCalledWith(
      expect.stringContaining('user@example.com')
    );
    expect(infoSpy).toHaveBeenCalledWith(
      expect.stringContaining('abc123')
    );
  });

  test('warns about missing SMTP_HOST', async () => {
    await sendPasswordResetEmail('user@example.com', 'tok');

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('SMTP_HOST not configured')
    );
  });
});
