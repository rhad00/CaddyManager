import { Router, Request, Response, NextFunction } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { authenticate } from '../../middleware/authMiddleware';
import { headerMiddlewareService } from '../../services/headerMiddlewareService';

// Validation middleware
const validate = (req: Request, res: Response, next: NextFunction) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Validation failed',
      details: errors.array(),
    });
  }
  next();
};

const router = Router();

// Apply auth middleware to all routes
router.use(authenticate);

// Header Management Routes
router.post(
  '/headers',
  [
    body('proxyId').isUUID().withMessage('Valid proxy ID is required'),
    body('name').trim().isLength({ min: 1 }).withMessage('Header name is required'),
    body('value').trim().isLength({ min: 1 }).withMessage('Header value is required'),
    body('type')
      .isIn(['request', 'response', 'custom'])
      .withMessage('Valid header type is required'),
    body('isActive').optional().isBoolean().withMessage('isActive must be a boolean'),
  ],
  validate,
  async (req: Request, res: Response) => {
    try {
      const header = await headerMiddlewareService.createHeader(req.body);
      res.status(201).json(header);
    } catch (error) {
      res.status(400).json({
        error: error instanceof Error ? error.message : 'Failed to create header',
      });
    }
  },
);

router.get(
  '/headers',
  [query('proxyId').isUUID().withMessage('Valid proxy ID is required')],
  validate,
  async (req: Request, res: Response) => {
    try {
      const headers = await headerMiddlewareService.getHeadersByProxy(req.query.proxyId as string);
      res.json(headers);
    } catch (error) {
      res.status(400).json({
        error: error instanceof Error ? error.message : 'Failed to fetch headers',
      });
    }
  },
);

router.put(
  '/headers/:id',
  [
    param('id').isUUID().withMessage('Valid header ID is required'),
    body('name').optional().trim().isLength({ min: 1 }).withMessage('Header name cannot be empty'),
    body('value')
      .optional()
      .trim()
      .isLength({ min: 1 })
      .withMessage('Header value cannot be empty'),
    body('type')
      .optional()
      .isIn(['request', 'response', 'custom'])
      .withMessage('Valid header type is required'),
    body('isActive').optional().isBoolean().withMessage('isActive must be a boolean'),
  ],
  validate,
  async (req: Request, res: Response) => {
    try {
      const header = await headerMiddlewareService.updateHeader(req.params.id, req.body);
      res.json(header);
    } catch (error) {
      res.status(400).json({
        error: error instanceof Error ? error.message : 'Failed to update header',
      });
    }
  },
);

router.delete(
  '/headers/:id',
  [param('id').isUUID().withMessage('Valid header ID is required')],
  validate,
  async (req: Request, res: Response) => {
    try {
      await headerMiddlewareService.deleteHeader(req.params.id);
      res.status(204).send();
    } catch (error) {
      res.status(400).json({
        error: error instanceof Error ? error.message : 'Failed to delete header',
      });
    }
  },
);

// Security Header Routes
router.post(
  '/security-headers',
  [
    body('proxyId').isUUID().withMessage('Valid proxy ID is required'),
    body('cspEnabled').optional().isBoolean().withMessage('cspEnabled must be a boolean'),
    body('cspPolicy').optional().isString().withMessage('CSP policy must be a string'),
    body('xssProtection').optional().isBoolean().withMessage('xssProtection must be a boolean'),
    body('hstsEnabled').optional().isBoolean().withMessage('hstsEnabled must be a boolean'),
    body('hstsMaxAge')
      .optional()
      .isInt({ min: 0 })
      .withMessage('HSTS max age must be a positive integer'),
    body('hstsIncludeSubdomains')
      .optional()
      .isBoolean()
      .withMessage('hstsIncludeSubdomains must be a boolean'),
    body('hstsPreload').optional().isBoolean().withMessage('hstsPreload must be a boolean'),
    body('frameOptions')
      .optional()
      .isIn(['DENY', 'SAMEORIGIN', 'ALLOW-FROM'])
      .withMessage('Invalid frame options value'),
    body('frameOptionsUri').optional().isURL().withMessage('Frame options URI must be a valid URL'),
    body('contentTypeNosniff')
      .optional()
      .isBoolean()
      .withMessage('contentTypeNosniff must be a boolean'),
    body('referrerPolicy').optional().isString().withMessage('Referrer policy must be a string'),
  ],
  validate,
  async (req: Request, res: Response) => {
    try {
      const securityHeader = await headerMiddlewareService.createOrUpdateSecurityHeader(req.body);
      res.json(securityHeader);
    } catch (error) {
      res.status(400).json({
        error: error instanceof Error ? error.message : 'Failed to create/update security headers',
      });
    }
  },
);

router.get(
  '/security-headers/:proxyId',
  [param('proxyId').isUUID().withMessage('Valid proxy ID is required')],
  validate,
  async (req: Request, res: Response) => {
    try {
      const securityHeader = await headerMiddlewareService.getSecurityHeaderByProxy(
        req.params.proxyId,
      );
      res.json(securityHeader);
    } catch (error) {
      res.status(400).json({
        error: error instanceof Error ? error.message : 'Failed to fetch security headers',
      });
    }
  },
);

router.delete(
  '/security-headers/:proxyId',
  [param('proxyId').isUUID().withMessage('Valid proxy ID is required')],
  validate,
  async (req: Request, res: Response) => {
    try {
      await headerMiddlewareService.deleteSecurityHeader(req.params.proxyId);
      res.status(204).send();
    } catch (error) {
      res.status(400).json({
        error: error instanceof Error ? error.message : 'Failed to delete security headers',
      });
    }
  },
);

// Rate Limit Routes
router.post(
  '/rate-limits',
  [
    body('proxyId').isUUID().withMessage('Valid proxy ID is required'),
    body('enabled').isBoolean().withMessage('enabled is required and must be a boolean'),
    body('requestsPerMinute')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Requests per minute must be a positive integer'),
    body('requestsPerHour')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Requests per hour must be a positive integer'),
    body('requestsPerDay')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Requests per day must be a positive integer'),
    body('burstSize')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Burst size must be a positive integer'),
    body('keyType')
      .optional()
      .isIn(['ip', 'header', 'query', 'cookie'])
      .withMessage('Invalid key type'),
    body('keyName').optional().isString().withMessage('Key name must be a string'),
    body('responseCode')
      .optional()
      .isInt({ min: 400, max: 599 })
      .withMessage('Response code must be between 400-599'),
    body('responseMessage').optional().isString().withMessage('Response message must be a string'),
  ],
  validate,
  async (req: Request, res: Response) => {
    try {
      const rateLimit = await headerMiddlewareService.createOrUpdateRateLimit(req.body);
      res.json(rateLimit);
    } catch (error) {
      res.status(400).json({
        error: error instanceof Error ? error.message : 'Failed to create/update rate limit',
      });
    }
  },
);

router.get(
  '/rate-limits/:proxyId',
  [param('proxyId').isUUID().withMessage('Valid proxy ID is required')],
  validate,
  async (req: Request, res: Response) => {
    try {
      const rateLimit = await headerMiddlewareService.getRateLimitByProxy(req.params.proxyId);
      res.json(rateLimit);
    } catch (error) {
      res.status(400).json({
        error: error instanceof Error ? error.message : 'Failed to fetch rate limit',
      });
    }
  },
);

router.delete(
  '/rate-limits/:proxyId',
  [param('proxyId').isUUID().withMessage('Valid proxy ID is required')],
  validate,
  async (req: Request, res: Response) => {
    try {
      await headerMiddlewareService.deleteRateLimit(req.params.proxyId);
      res.status(204).send();
    } catch (error) {
      res.status(400).json({
        error: error instanceof Error ? error.message : 'Failed to delete rate limit',
      });
    }
  },
);

// IP Restriction Routes
router.post(
  '/ip-restrictions',
  [
    body('proxyId').isUUID().withMessage('Valid proxy ID is required'),
    body('type').isIn(['allow', 'block']).withMessage("Type must be 'allow' or 'block'"),
    body('ipAddress').isIP().withMessage('Valid IP address is required'),
    body('cidrMask')
      .optional()
      .isInt({ min: 0, max: 32 })
      .withMessage('CIDR mask must be between 0-32'),
    body('description').optional().isString().withMessage('Description must be a string'),
    body('isActive').optional().isBoolean().withMessage('isActive must be a boolean'),
  ],
  validate,
  async (req: Request, res: Response) => {
    try {
      const ipRestriction = await headerMiddlewareService.createIpRestriction(req.body);
      res.status(201).json(ipRestriction);
    } catch (error) {
      res.status(400).json({
        error: error instanceof Error ? error.message : 'Failed to create IP restriction',
      });
    }
  },
);

router.get(
  '/ip-restrictions',
  [query('proxyId').isUUID().withMessage('Valid proxy ID is required')],
  validate,
  async (req: Request, res: Response) => {
    try {
      const ipRestrictions = await headerMiddlewareService.getIpRestrictionsByProxy(
        req.query.proxyId as string,
      );
      res.json(ipRestrictions);
    } catch (error) {
      res.status(400).json({
        error: error instanceof Error ? error.message : 'Failed to fetch IP restrictions',
      });
    }
  },
);

router.put(
  '/ip-restrictions/:id',
  [
    param('id').isUUID().withMessage('Valid IP restriction ID is required'),
    body('type').optional().isIn(['allow', 'block']).withMessage("Type must be 'allow' or 'block'"),
    body('ipAddress').optional().isIP().withMessage('Valid IP address is required'),
    body('cidrMask')
      .optional()
      .isInt({ min: 0, max: 32 })
      .withMessage('CIDR mask must be between 0-32'),
    body('description').optional().isString().withMessage('Description must be a string'),
    body('isActive').optional().isBoolean().withMessage('isActive must be a boolean'),
  ],
  validate,
  async (req: Request, res: Response) => {
    try {
      const ipRestriction = await headerMiddlewareService.updateIpRestriction(
        req.params.id,
        req.body,
      );
      res.json(ipRestriction);
    } catch (error) {
      res.status(400).json({
        error: error instanceof Error ? error.message : 'Failed to update IP restriction',
      });
    }
  },
);

router.delete(
  '/ip-restrictions/:id',
  [param('id').isUUID().withMessage('Valid IP restriction ID is required')],
  validate,
  async (req: Request, res: Response) => {
    try {
      await headerMiddlewareService.deleteIpRestriction(req.params.id);
      res.status(204).send();
    } catch (error) {
      res.status(400).json({
        error: error instanceof Error ? error.message : 'Failed to delete IP restriction',
      });
    }
  },
);

// Path Rule Routes
router.post(
  '/path-rules',
  [
    body('proxyId').isUUID().withMessage('Valid proxy ID is required'),
    body('pathPattern').trim().isLength({ min: 1 }).withMessage('Path pattern is required'),
    body('ruleType')
      .isIn(['proxy', 'redirect', 'rewrite'])
      .withMessage("Rule type must be 'proxy', 'redirect', or 'rewrite'"),
    body('targetUrl').optional().isURL().withMessage('Target URL must be valid'),
    body('redirectCode')
      .optional()
      .isInt({ min: 300, max: 399 })
      .withMessage('Redirect code must be between 300-399'),
    body('rewritePattern').optional().isString().withMessage('Rewrite pattern must be a string'),
    body('priority')
      .optional()
      .isInt({ min: 0 })
      .withMessage('Priority must be a non-negative integer'),
    body('isActive').optional().isBoolean().withMessage('isActive must be a boolean'),
  ],
  validate,
  async (req: Request, res: Response) => {
    try {
      const pathRule = await headerMiddlewareService.createPathRule(req.body);
      res.status(201).json(pathRule);
    } catch (error) {
      res.status(400).json({
        error: error instanceof Error ? error.message : 'Failed to create path rule',
      });
    }
  },
);

router.get(
  '/path-rules',
  [query('proxyId').isUUID().withMessage('Valid proxy ID is required')],
  validate,
  async (req: Request, res: Response) => {
    try {
      const pathRules = await headerMiddlewareService.getPathRulesByProxy(
        req.query.proxyId as string,
      );
      res.json(pathRules);
    } catch (error) {
      res.status(400).json({
        error: error instanceof Error ? error.message : 'Failed to fetch path rules',
      });
    }
  },
);

router.put(
  '/path-rules/:id',
  [
    param('id').isUUID().withMessage('Valid path rule ID is required'),
    body('pathPattern')
      .optional()
      .trim()
      .isLength({ min: 1 })
      .withMessage('Path pattern cannot be empty'),
    body('ruleType')
      .optional()
      .isIn(['proxy', 'redirect', 'rewrite'])
      .withMessage("Rule type must be 'proxy', 'redirect', or 'rewrite'"),
    body('targetUrl').optional().isURL().withMessage('Target URL must be valid'),
    body('redirectCode')
      .optional()
      .isInt({ min: 300, max: 399 })
      .withMessage('Redirect code must be between 300-399'),
    body('rewritePattern').optional().isString().withMessage('Rewrite pattern must be a string'),
    body('priority')
      .optional()
      .isInt({ min: 0 })
      .withMessage('Priority must be a non-negative integer'),
    body('isActive').optional().isBoolean().withMessage('isActive must be a boolean'),
  ],
  validate,
  async (req: Request, res: Response) => {
    try {
      const pathRule = await headerMiddlewareService.updatePathRule(req.params.id, req.body);
      res.json(pathRule);
    } catch (error) {
      res.status(400).json({
        error: error instanceof Error ? error.message : 'Failed to update path rule',
      });
    }
  },
);

router.delete(
  '/path-rules/:id',
  [param('id').isUUID().withMessage('Valid path rule ID is required')],
  validate,
  async (req: Request, res: Response) => {
    try {
      await headerMiddlewareService.deletePathRule(req.params.id);
      res.status(204).send();
    } catch (error) {
      res.status(400).json({
        error: error instanceof Error ? error.message : 'Failed to delete path rule',
      });
    }
  },
);

// Basic Auth Routes
router.post(
  '/basic-auth',
  [
    body('proxyId').isUUID().withMessage('Valid proxy ID is required'),
    body('enabled').isBoolean().withMessage('enabled is required and must be a boolean'),
    body('realm').optional().isString().withMessage('Realm must be a string'),
    body('username').optional().isString().withMessage('Username must be a string'),
    body('password').optional().isString().withMessage('Password must be a string'),
    body('pathPattern').optional().isString().withMessage('Path pattern must be a string'),
  ],
  validate,
  async (req: Request, res: Response) => {
    try {
      const basicAuth = await headerMiddlewareService.createOrUpdateBasicAuth(req.body);
      res.json(basicAuth.toSafeJSON());
    } catch (error) {
      res.status(400).json({
        error: error instanceof Error ? error.message : 'Failed to create/update basic auth',
      });
    }
  },
);

router.get(
  '/basic-auth/:proxyId',
  [param('proxyId').isUUID().withMessage('Valid proxy ID is required')],
  validate,
  async (req: Request, res: Response) => {
    try {
      const basicAuth = await headerMiddlewareService.getBasicAuthByProxy(req.params.proxyId);
      res.json(basicAuth?.toSafeJSON() || null);
    } catch (error) {
      res.status(400).json({
        error: error instanceof Error ? error.message : 'Failed to fetch basic auth',
      });
    }
  },
);

router.delete(
  '/basic-auth/:proxyId',
  [param('proxyId').isUUID().withMessage('Valid proxy ID is required')],
  validate,
  async (req: Request, res: Response) => {
    try {
      await headerMiddlewareService.deleteBasicAuth(req.params.proxyId);
      res.status(204).send();
    } catch (error) {
      res.status(400).json({
        error: error instanceof Error ? error.message : 'Failed to delete basic auth',
      });
    }
  },
);

// Get all middleware for a proxy
router.get(
  '/middleware/:proxyId',
  [param('proxyId').isUUID().withMessage('Valid proxy ID is required')],
  validate,
  async (req: Request, res: Response) => {
    try {
      const middleware = await headerMiddlewareService.getAllMiddlewareByProxy(req.params.proxyId);
      res.json(middleware);
    } catch (error) {
      res.status(400).json({
        error: error instanceof Error ? error.message : 'Failed to fetch middleware',
      });
    }
  },
);

// Validate middleware configuration
router.post(
  '/middleware/:proxyId/validate',
  [param('proxyId').isUUID().withMessage('Valid proxy ID is required')],
  validate,
  async (req: Request, res: Response) => {
    try {
      const validation = await headerMiddlewareService.validateMiddlewareConfiguration(
        req.params.proxyId,
      );
      res.json(validation);
    } catch (error) {
      res.status(400).json({
        error:
          error instanceof Error ? error.message : 'Failed to validate middleware configuration',
      });
    }
  },
);

export default router;
