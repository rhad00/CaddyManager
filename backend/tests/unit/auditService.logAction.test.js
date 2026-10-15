/**
 * logAction used to ignore the `resourceId` that 19 call sites pass: the audit table has
 * no such column, so the id of the affected proxy/template/key never reached the log.
 */
jest.mock('../../src/models/auditLog', () => ({ AuditLog: { create: jest.fn().mockResolvedValue({}) } }));
jest.mock('../../src/models', () => ({ User: { findByPk: jest.fn().mockResolvedValue(null) } }));

const { AuditLog } = require('../../src/models/auditLog');
const { logAction } = require('../../src/services/auditService');

const stored = () => AuditLog.create.mock.calls[0][0];

beforeEach(() => jest.clearAllMocks());

describe('logAction', () => {
  test('keeps the id of the affected resource in the details', async () => {
    await logAction({ userId: 1, action: 'PROXY_UPDATED', resource: 'proxy', resourceId: 'p-1', details: { name: 'app' } });

    expect(stored()).toMatchObject({ action: 'PROXY_UPDATED', resource: 'proxy', details: { name: 'app', resource_id: 'p-1' } });
  });

  test('works without details', async () => {
    await logAction({ action: 'TEMPLATE_DELETED', resource: 'template', resourceId: 't-1' });

    expect(stored().details).toEqual({ resource_id: 't-1' });
  });

  test('wraps details that are not an object', async () => {
    await logAction({ action: 'X', resource: 'y', resourceId: 'r-1', details: 'plain text' });

    expect(stored().details).toEqual({ message: 'plain text', resource_id: 'r-1' });
  });

  test('leaves details alone when there is no resource id', async () => {
    await logAction({ action: 'LOGIN', resource: 'auth', details: { email: 'a@b.c' } });

    expect(stored().details).toEqual({ email: 'a@b.c' });
  });

  test('records the status, success by default', async () => {
    await logAction({ action: 'LOGIN', resource: 'auth' });
    await logAction({ action: 'LOGIN', resource: 'auth', status: 'failure' });

    expect(AuditLog.create.mock.calls.map(([data]) => data.status)).toEqual(['success', 'failure']);
  });
});
