/**
 * The fields of Caddy's access log that the traffic analytics read. The lines are real Caddy 2.10
 * output with the hosts and addresses replaced.
 */
const { parseLine } = require('../../src/services/logService');

const h2 = '{"level":"info","ts":1793702153.9436738,"logger":"http.log.access.access","msg":"handled request","request":{"remote_ip":"172.16.1.65","remote_port":"33164","client_ip":"203.0.113.65","proto":"HTTP/2.0","method":"GET","host":"app.example.com","uri":"/","headers":{"Accept":["*/*"],"User-Agent":["curl/7.81.0"],"Referer":["https://news.example.org/post?token=abc"]},"tls":{"resumed":false,"version":772,"cipher_suite":4865,"proto":"h2","server_name":"app.example.com"}},"bytes_read":42,"user_id":"","duration":0.009729537,"size":187,"status":200,"resp_headers":{"Alt-Svc":["h3=\\":443\\"; ma=2592000"],"Content-Type":["application/xml; charset=utf-8"],"Server":["Ceph Object Gateway (squid)"]}}';
const plainHttp = '{"level":"info","ts":1793702053.1,"logger":"http.log.access.access","msg":"handled request","request":{"remote_ip":"203.0.113.9","client_ip":"203.0.113.9","proto":"HTTP/1.1","method":"DELETE","host":"app.example.com","uri":"/x.bin","headers":{"Authorization":["REDACTED"]}},"bytes_read":0,"duration":0.0126,"size":0,"status":204,"resp_headers":{"Via":["1.1 Caddy"]}}';

test('reads the protocol, TLS, client, referrer, content type and bytes in', () => {
  const e = parseLine(h2);
  expect(e.proto).toBe('HTTP/2.0');
  expect(e.tls_version).toBe(772);
  expect(e.tls_cipher).toBe(4865);
  expect(e.client_ip).toBe('203.0.113.65');
  expect(e.referer).toBe('https://news.example.org/post?token=abc');
  expect(e.content_type).toBe('application/xml; charset=utf-8');
  expect(e.bytes_read).toBe(42);
  expect(e.status).toBe(200);
});

test('a request without TLS, referrer or content type leaves those fields out', () => {
  const e = parseLine(plainHttp);
  expect(e.proto).toBe('HTTP/1.1');
  expect(e.tls_version).toBeUndefined();
  expect(e.referer).toBeUndefined();
  expect(e.content_type).toBeUndefined();
  expect(e.bytes_read).toBe(0);
});

test('the client is the real client behind a trusted proxy, and falls back to the peer address', () => {
  const noClient = plainHttp.replace('"client_ip":"203.0.113.9",', '');
  expect(parseLine(noClient).client_ip).toBe('203.0.113.9');
});

test('the existing fields are unchanged', () => {
  const e = parseLine(h2);
  expect(e).toMatchObject({ method: 'GET', host: 'app.example.com', uri: '/', remote_ip: '172.16.1.65', user_agent: 'curl/7.81.0', size: 187 });
});
