# Test-only certificate fixtures

`generate.js` creates throwaway, self-signed material with the openssl CLI the first time a test asks for it, in a
scratch directory under the system temp directory. No key is stored in the repository. Never trusted anywhere.

- `app.cert.pem` / `app.key.pem`: EC P-256, CN `app.example.com`,
  SANs `app.example.com`, `*.apps.example.com`, valid until 2126.
- `other.key.pem`: an unrelated EC key, used to test key/certificate mismatch.

```js
const dir = require('../fixtures/certs/generate')(); // directory containing the three files
```
