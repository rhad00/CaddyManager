# Backend Testing

Run unit tests:

# Backend Testing

Run unit tests:

```
cd backend
npm install
npm run test:unit
```

Run integration tests:

```
cd backend
npm run test:integration
```

Run all tests:

```
cd backend
npm test
```

Notes:
- Integration tests expect `NODE_ENV=test` and may use the local `database.sqlite` file. Configure test DB in `config` if needed.

---

Session changelog (2025-11-23):
- Added many unit tests for `caddyService` including handler ordering, path routing, and template application.
- Fixed `certificateService` temp directory initialization to avoid async logging during tests.
- Added integration tests using in-memory SQLite to validate `rebuildConfigFromDatabase` and backup/restore.
