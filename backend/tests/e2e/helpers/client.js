/**
 * An HTTP client that sends exactly what it is told: the Host header and header names as
 * given, the path untouched (no normalisation), no automatic Accept-Encoding, no redirects,
 * no connection reuse. The tests use it as the "S3 client" or the browser in front of Caddy.
 */
const http = require('http');
const https = require('https');

function request({
  port, host, path = '/', method = 'GET', headers = {}, body, tls = false, servername, timeout = 20000,
}) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? undefined : (Buffer.isBuffer(body) ? body : Buffer.from(body));
    const sent = { ...headers };
    if (host !== undefined) sent.Host = host;
    const lowerNames = Object.keys(sent).map((n) => n.toLowerCase());
    if (payload && !lowerNames.includes('content-length') && !lowerNames.includes('transfer-encoding')) {
      sent['Content-Length'] = payload.length;
    }

    const transport = tls ? https : http;
    const req = transport.request({
      host: '127.0.0.1',
      port,
      path,
      method,
      headers: sent,
      setHost: false,
      agent: false,
      ...(tls ? { rejectUnauthorized: false, servername: servername || String(host).replace(/:\d+$/, '') } : {}),
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const buffer = Buffer.concat(chunks);
        resolve({
          status: res.statusCode,
          headers: res.headers,
          rawHeaders: res.rawHeaders,
          httpVersion: res.httpVersion,
          body: buffer,
          text: () => buffer.toString('utf8'),
          json: () => JSON.parse(buffer.toString('utf8')),
        });
      });
      res.on('error', reject);
    });
    req.on('error', reject);
    req.setTimeout(timeout, () => req.destroy(new Error(`request timed out: ${method} ${path}`)));
    if (payload) req.write(payload);
    req.end();
  });
}

/** Send a request and read the upgrade handshake (WebSocket) */
function upgrade({ port, host, path = '/', headers = {} }) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: '127.0.0.1', port, path, method: 'GET', setHost: false, agent: false,
      headers: { Host: host, Connection: 'Upgrade', Upgrade: 'websocket', 'Sec-WebSocket-Version': '13', 'Sec-WebSocket-Key': 'dGhlIHNhbXBsZSBub25jZQ==', ...headers },
    });
    req.on('upgrade', (res, socket) => resolve({ status: res.statusCode, headers: res.headers, socket }));
    req.on('response', (res) => resolve({ status: res.statusCode, headers: res.headers, socket: null }));
    req.on('error', reject);
    req.setTimeout(10000, () => req.destroy(new Error('upgrade timed out')));
    req.end();
  });
}

module.exports = { request, upgrade };
