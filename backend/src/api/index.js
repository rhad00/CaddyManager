/**
 * The API router, mounted by app.js under /api/v1 and /api (legacy).
 *
 * Administration areas are marked here, at mount time, with `adminScopeArea`: API keys
 * need the admin scope for every route behind it. Marking by mount (rather than parsing
 * the URL in the auth middleware) means whatever path Express routes into an area — any
 * letter case, either prefix — carries the area's rule.
 */
const express = require('express');
const { adminScopeArea } = require('../middleware/auth');

const ROUTES = [
  ['/auth', './auth/routes'],
  ['/proxies', './proxies/routes'],
  ['/templates', './templates/routes'],
  ['/users', './users/routes', adminScopeArea],
  ['/backups', './backups/routes', adminScopeArea],
  ['/certificates', './certificates/routes'],
  ['/metrics', './metrics/routes'],
  ['/audit', './audit/routes', adminScopeArea],
  ['/features', './features/routes'],
  ['/discovery', './discovery/routes'],
  ['/git', './git/routes', adminScopeArea],
  ['/logs', './logs/routes'],
  ['/alerts', './alerts/routes', adminScopeArea],
  ['/keys', './keys/routes', adminScopeArea],
];

/** @returns {import('express').Router} */
function buildApiRouter() {
  const router = express.Router();
  for (const [path, module, ...marks] of ROUTES) {
    router.use(path, ...marks, require(module));
  }
  return router;
}

module.exports = { buildApiRouter };
