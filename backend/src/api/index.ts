/**
 * The API router, mounted by app.js under /api/v1 and /api (legacy).
 *
 * Administration areas are marked here, at mount time, with `adminScopeArea`: API keys
 * need the admin scope for every route behind it. Marking by mount (rather than parsing
 * the URL in the auth middleware) means whatever path Express routes into an area — any
 * letter case, either prefix — carries the area's rule.
 */
import express, { type RequestHandler, type Router } from 'express';
import { adminScopeArea } from '../middleware/auth';
import { router as authRouter } from './auth/routes';
import { router as proxiesRouter } from './proxies/routes';
import { router as templatesRouter } from './templates/routes';
import { router as usersRouter } from './users/routes';
import { router as backupsRouter } from './backups/routes';
import { router as certificatesRouter } from './certificates/routes';
import { router as metricsRouter } from './metrics/routes';
import { router as auditRouter } from './audit/routes';
import { router as featuresRouter } from './features/routes';
import { router as discoveryRouter } from './discovery/routes';
import { router as gitRouter } from './git/routes';
import { router as logsRouter } from './logs/routes';
import { router as alertsRouter } from './alerts/routes';
import { router as keysRouter } from './keys/routes';
import { router as systemRouter } from './system/routes';

/** A mount path, the router behind it and the area markers that go in front of it */
type Mount = [path: string, router: Router, ...marks: RequestHandler[]];

const ROUTES: Mount[] = [
  ['/auth', authRouter],
  ['/proxies', proxiesRouter],
  ['/templates', templatesRouter],
  ['/users', usersRouter, adminScopeArea],
  ['/backups', backupsRouter, adminScopeArea],
  ['/certificates', certificatesRouter],
  ['/metrics', metricsRouter],
  ['/audit', auditRouter, adminScopeArea],
  ['/features', featuresRouter],
  ['/discovery', discoveryRouter],
  ['/git', gitRouter, adminScopeArea],
  ['/logs', logsRouter],
  ['/alerts', alertsRouter, adminScopeArea],
  ['/keys', keysRouter, adminScopeArea],
  ['/system', systemRouter],
];

export function buildApiRouter(): Router {
  const router = express.Router();
  for (const [path, mounted, ...marks] of ROUTES) {
    router.use(path, ...marks, mounted);
  }
  return router;
}
