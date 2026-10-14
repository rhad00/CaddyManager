/**
 * The header rules the "Amazon S3" template shipped with before it was repaired. Every rule broke
 * SigV4 against a strict origin (Ceph radosgw, MinIO, AWS): `Host: {http.request.host}` drops the
 * port the client signed, and the self-passthrough rules set empty Content-MD5 / X-Amz-Acl headers
 * on requests that never had them. Kept so the repair migration only removes rules that came from
 * the old template.
 */
export interface LegacyHeaderRule {
  header_type: 'request';
  header_name: string;
  header_value: string;
}

const passthrough = (name: string): LegacyHeaderRule => ({
  header_type: 'request',
  header_name: name,
  header_value: `{http.request.header.${name}}`,
});

export const LEGACY_S3_HEADERS: readonly LegacyHeaderRule[] = [
  { header_type: 'request', header_name: 'Host', header_value: '{http.request.host}' },
  passthrough('Authorization'),
  passthrough('Content-Type'),
  passthrough('Content-Length'),
  passthrough('Content-MD5'),
  passthrough('X-Amz-Date'),
  passthrough('X-Amz-Content-Sha256'),
  passthrough('X-Amz-Acl'),
];

export const S3_TEMPLATE_NAME = 'Amazon S3';
export const S3_TEMPLATE_DESCRIPTION =
  'S3-compatible storage (AWS SigV4): no header rewrites, Host, Authorization and every x-amz-* header reach the origin untouched';
