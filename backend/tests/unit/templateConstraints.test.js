const { constraintsFor, lockedOptions, forcedProxyValues } = require('../../src/utils/templateConstraints');

describe('templateConstraints', () => {
  test('Amazon S3 locks compression and basic auth off', () => {
    const options = constraintsFor('Amazon S3').map((c) => c.option).sort();
    expect(options).toEqual(['basic_auth', 'compression_enabled']);
    for (const c of constraintsFor('Amazon S3')) expect(c.reason).toMatch(/SigV4|Authorization|ETag/i);
  });

  test('templates without constraints, custom templates and null names lock nothing', () => {
    expect(constraintsFor('Grafana')).toEqual([]);
    expect(constraintsFor('My own template')).toEqual([]);
    expect(constraintsFor(undefined)).toEqual([]);
  });

  test('lockedOptions lists the option names', () => {
    expect(lockedOptions('Amazon S3').sort()).toEqual(['basic_auth', 'compression_enabled']);
  });

  test('forcedProxyValues gives the proxy fields to reset', () => {
    expect(forcedProxyValues('Amazon S3')).toEqual({ compression_enabled: false, basic_auth: null });
    expect(forcedProxyValues('Grafana')).toEqual({});
  });
});
