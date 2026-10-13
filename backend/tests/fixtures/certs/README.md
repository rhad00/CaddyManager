# Test-only certificate fixtures

Self-signed, throwaway material for unit, integration and contract tests. Never trusted
anywhere; do not reuse.

- `app.cert.pem` / `app.key.pem`: EC P-256, CN `app.example.com`,
  SANs `app.example.com`, `*.apps.example.com`, valid until 2126.
- `other.key.pem`: an unrelated EC key, used to test key/certificate mismatch.

Regenerate with:

```bash
openssl req -x509 -newkey ec -pkeyopt ec_paramgen_curve:P-256 -nodes \
  -keyout app.key.pem -out app.cert.pem -days 36500 -subj "/CN=app.example.com" \
  -addext "subjectAltName=DNS:app.example.com,DNS:*.apps.example.com"
openssl genpkey -algorithm EC -pkeyopt ec_paramgen_curve:P-256 -out other.key.pem
```
