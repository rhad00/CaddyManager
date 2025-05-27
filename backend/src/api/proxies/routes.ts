import { Router } from 'express';
import { z } from 'zod';
import { ProxyService } from '../../services/proxyService';
import { validateBody } from '../../middleware/validation';
import { authenticate } from '../../middleware/authMiddleware';
import { createError } from '../../middleware/errorHandler';

const router = Router();

// Validation schemas
const domainConfigSchema = z.object({
  name: z.string().min(1),
  ssl_type: z.enum(['acme', 'custom', 'none']),
  custom_cert_id: z.string().optional(),
});

const upstreamConfigSchema = z.object({
  url: z.string().url(),
  headers: z.record(z.string()).optional(),
});

const proxyConfigSchema = z.object({
  domains: z.array(domainConfigSchema).min(1),
  upstream: upstreamConfigSchema,
  http_to_https: z.boolean().default(true),
  compression: z.boolean().default(true),
  cache_enabled: z.boolean().default(false),
  cache_duration: z.string().optional(),
  custom_headers: z.record(z.string()).optional(),
});

const createProxySchema = z.object({
  name: z.string().min(3).max(255),
  config: proxyConfigSchema,
});

const updateProxySchema = z.object({
  name: z.string().min(3).max(255).optional(),
  config: proxyConfigSchema.optional(),
  isActive: z.boolean().optional(),
});

// Routes
router.use(authenticate); // All proxy routes require authentication

// List proxies
router.get('/', async (req, res, next) => {
  try {
    const { limit, offset, isActive } = req.query;
    const options = {
      limit: Number(limit) || 10,
      offset: Number(offset) || 0,
      isActive: isActive ? isActive === 'true' : undefined,
      userId: req.user?.role === 'admin' ? undefined : req.user?.id,
    };

    const proxies = await ProxyService.listProxies(options);
    res.json(proxies);
  } catch (error) {
    next(error);
  }
});

// Get single proxy
router.get('/:id', async (req, res, next) => {
  try {
    const proxy = await ProxyService.getProxy(req.params.id);
    if (req.user?.role !== 'admin' && proxy.createdById !== req.user?.id) {
      throw createError('Unauthorized', 403);
    }
    res.json(proxy);
  } catch (error) {
    next(error);
  }
});

// Create proxy
router.post('/', validateBody(createProxySchema), async (req, res, next) => {
  try {
    await ProxyService.validateProxyConfig(req.body.config);
    const proxy = await ProxyService.createProxy({
      ...req.body,
      createdById: req.user!.id,
    });
    res.status(201).json(proxy);
  } catch (error) {
    next(error);
  }
});

// Update proxy
router.put('/:id', validateBody(updateProxySchema), async (req, res, next) => {
  try {
    const proxy = await ProxyService.getProxy(req.params.id);
    if (req.user?.role !== 'admin' && proxy.createdById !== req.user?.id) {
      throw createError('Unauthorized', 403);
    }

    if (req.body.config) {
      await ProxyService.validateProxyConfig(req.body.config);
    }

    const updated = await ProxyService.updateProxy(req.params.id, req.body);
    res.json(updated);
  } catch (error) {
    next(error);
  }
});

// Delete proxy
router.delete('/:id', async (req, res, next) => {
  try {
    const proxy = await ProxyService.getProxy(req.params.id);
    if (req.user?.role !== 'admin' && proxy.createdById !== req.user?.id) {
      throw createError('Unauthorized', 403);
    }

    await ProxyService.deleteProxy(req.params.id);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

// Toggle proxy active state
router.post('/:id/toggle', async (req, res, next) => {
  try {
    const proxy = await ProxyService.getProxy(req.params.id);
    if (req.user?.role !== 'admin' && proxy.createdById !== req.user?.id) {
      throw createError('Unauthorized', 403);
    }

    const updated = await ProxyService.toggleProxy(req.params.id);
    res.json(updated);
  } catch (error) {
    next(error);
  }
});

export default router;
