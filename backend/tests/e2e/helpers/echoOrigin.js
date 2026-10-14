/**
 * A general-purpose origin server. It records every request exactly as it arrived (raw header
 * names and values in order, the request target, the HTTP version, the peer) and answers with
 * whatever the test configured, so a test can compare what a client sent, what the origin
 * received and what the client got back.
 *
 *   origin.respond = ({ req, body }) => ({ status, headers, body })   // optional override
 *   GET /__echo   answers with the received request as JSON
 */
const http = require('http');
const https = require('https');
const crypto = require('crypto');

function createOrigin({ name = 'origin', tls = null } = {}) {
  const requests = [];
  const upgrades = [];
  const state = { respond: null, name };

  const readBody = (req) => new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });

  const handler = async (req, res) => {
    const body = await readBody(req);
    const record = {
      method: req.method,
      url: req.url,
      httpVersion: req.httpVersion,
      headers: req.headers,
      rawHeaders: req.rawHeaders,
      remoteAddress: req.socket.remoteAddress,
      body,
      bodySha256: crypto.createHash('sha256').update(body).digest('hex'),
      origin: name,
    };
    requests.push(record);

    const custom = state.respond ? await state.respond({ req, body, record }) : null;
    if (custom) {
      res.writeHead(custom.status || 200, custom.headers || {});
      res.end(custom.body === undefined ? '' : custom.body);
      return;
    }
    const echo = JSON.stringify({
      origin: name, method: req.method, url: req.url, httpVersion: req.httpVersion, headers: req.headers,
      rawHeaders: req.rawHeaders, bodyLength: body.length, bodySha256: record.bodySha256,
    });
    res.writeHead(200, { 'content-type': 'application/json', 'x-origin-name': name });
    res.end(echo);
  };

  const server = tls ? https.createServer(tls, handler) : http.createServer(handler);

  // closeAllConnections() does not reach upgraded (WebSocket) sockets, which would hold stop() open
  const sockets = new Set();
  server.on(tls ? 'secureConnection' : 'connection', (socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
  });

  // WebSocket: a hand-rolled handshake that echoes the first frame, enough to see the upgrade headers
  server.on('upgrade', (req, socket) => {
    upgrades.push({ url: req.url, headers: req.headers, rawHeaders: req.rawHeaders });
    const accept = crypto.createHash('sha1').update(`${req.headers['sec-websocket-key']}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest('base64');
    socket.write(['HTTP/1.1 101 Switching Protocols', 'Upgrade: websocket', 'Connection: Upgrade', `Sec-WebSocket-Accept: ${accept}`, '', ''].join('\r\n'));
    socket.on('data', (frame) => {
      // masked client frame -> unmasked server frame with the same payload
      const length = frame[1] & 0x7f;
      const mask = frame.subarray(2, 6);
      const payload = Buffer.from(frame.subarray(6, 6 + length).map((byte, i) => byte ^ mask[i % 4]));
      socket.write(Buffer.concat([Buffer.from([0x81, payload.length]), payload]));
    });
    socket.on('error', () => {});
  });

  return {
    name,
    requests,
    upgrades,
    get lastRequest() { return requests[requests.length - 1]; },
    set respond(fn) { state.respond = fn; },
    start: () => new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server.address().port))),
    stop: () => new Promise((resolve) => {
      server.close(() => resolve());
      sockets.forEach((socket) => socket.destroy());
    }),
    reset: () => { requests.length = 0; upgrades.length = 0; state.respond = null; },
  };
}

/** The raw header value list of a received request: [['Name', 'value'], ...] in arrival order */
const rawHeaderPairs = (rawHeaders) => {
  const pairs = [];
  for (let i = 0; i < rawHeaders.length; i += 2) pairs.push([rawHeaders[i], rawHeaders[i + 1]]);
  return pairs;
};

module.exports = { createOrigin, rawHeaderPairs };
