import express, { type Request, type Response } from 'express';
import { sequelize } from '../../config/database';
import { authMiddleware } from '../../middleware/auth';
import { appVersion } from '../../utils/appVersion';

export const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: System
 *   description: Information about the running CaddyManager instance
 *
 * /system/info:
 *   get:
 *     summary: Get the running version and runtime
 *     description: What a bug report needs to name. Authenticated only, nothing environment specific is returned.
 *     tags: [System]
 *     security:
 *       - BearerAuth: []
 *       - ApiKeyAuth: []
 *     responses:
 *       200:
 *         description: Version, Node.js version, database type and uptime
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 info:
 *                   type: object
 *                   properties:
 *                     version: { type: string, example: "0.6.0" }
 *                     node: { type: string, example: "v24.0.0" }
 *                     database: { type: string, enum: [sqlite, postgres] }
 *                     uptimeSeconds: { type: integer }
 *       401:
 *         $ref: '#/components/schemas/Error'
 */
router.get('/info', authMiddleware, (_req: Request, res: Response) => {
  res.status(200).json({
    success: true,
    info: {
      version: appVersion(),
      node: process.version,
      database: sequelize.getDialect(),
      uptimeSeconds: Math.floor(process.uptime()),
    },
  });
});
