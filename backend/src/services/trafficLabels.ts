/** Readable names for the raw values of an access log line */

const TLS_VERSIONS: Record<number, string> = {
  768: 'SSL 3.0',
  769: 'TLS 1.0',
  770: 'TLS 1.1',
  771: 'TLS 1.2',
  772: 'TLS 1.3',
};

export const NO_TLS = 'No TLS (plain HTTP)';

/** Caddy logs the version as a number: 772 is TLS 1.3 */
export const tlsVersionLabel = (version: number | undefined): string =>
  version === undefined ? NO_TLS : TLS_VERSIONS[version] ?? `TLS 0x${version.toString(16)}`;

const CIPHERS: Record<number, string> = {
  4865: 'TLS_AES_128_GCM_SHA256',
  4866: 'TLS_AES_256_GCM_SHA384',
  4867: 'TLS_CHACHA20_POLY1305_SHA256',
  49195: 'ECDHE-ECDSA-AES128-GCM-SHA256',
  49196: 'ECDHE-ECDSA-AES256-GCM-SHA384',
  49199: 'ECDHE-RSA-AES128-GCM-SHA256',
  49200: 'ECDHE-RSA-AES256-GCM-SHA384',
  52392: 'ECDHE-RSA-CHACHA20-POLY1305',
  52393: 'ECDHE-ECDSA-CHACHA20-POLY1305',
  49161: 'ECDHE-ECDSA-AES128-SHA',
  49171: 'ECDHE-RSA-AES128-SHA',
  47: 'RSA-AES128-SHA',
  53: 'RSA-AES256-SHA',
};

export const cipherLabel = (cipher: number): string => CIPHERS[cipher] ?? `0x${cipher.toString(16)}`;

/** "HTTP/2.0" is shown as "HTTP/2", like browsers and Cloudflare do */
export const protoLabel = (proto: string | undefined): string => {
  if (!proto) return 'Unknown';
  const m = /^HTTP\/(\d)(?:\.(\d))?$/.exec(proto);
  if (!m) return proto;
  return m[1] === '1' ? `HTTP/1.${m[2] ?? '1'}` : `HTTP/${m[1]}`;
};

/** A coarse kind of content, from the response Content-Type */
export const contentCategory = (contentType: string | undefined): string => {
  if (!contentType) return 'None';
  const type = contentType.split(';')[0].trim().toLowerCase();
  if (type === 'text/html' || type === 'application/xhtml+xml') return 'HTML';
  if (type.includes('json')) return 'JSON';
  if (type.includes('xml')) return 'XML';
  if (type === 'text/css') return 'CSS';
  if (type.includes('javascript') || type.includes('ecmascript')) return 'JavaScript';
  if (type.startsWith('image/')) return 'Images';
  if (type.startsWith('video/')) return 'Video';
  if (type.startsWith('audio/')) return 'Audio';
  if (type.startsWith('font/') || type.includes('font')) return 'Fonts';
  if (type.startsWith('text/')) return 'Text';
  return 'Other';
};

/** The part of a URI before the query string, which can carry tokens */
export const pathOf = (uri: string | undefined): string => {
  if (!uri) return '/';
  const q = uri.indexOf('?');
  return (q === -1 ? uri : uri.slice(0, q)) || '/';
};

const normalHost = (host: string): string => host.toLowerCase().replace(/:\d+$/, '');

/**
 * The site a visitor came from: the host of the Referer, never its path or query (a query can carry
 * a token). Null when there is none or it is the site itself.
 */
export function referrerHost(referer: string | undefined, ownHost: string | undefined): string | null {
  if (!referer) return null;
  try {
    const host = new URL(referer).hostname.toLowerCase();
    if (!host || (ownHost && host === normalHost(ownHost))) return null;
    return host;
  } catch {
    return null;
  }
}
