const express = require('express');
const Template = require('../../models/template');
const { authMiddleware, roleMiddleware } = require('../../middleware/auth');
const caddyService = require('../../services/caddyService');
const Proxy = require('../../models/proxy');
const { logAction } = require('../../services/auditService');
const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Templates
 *   description: Proxy configuration templates
 *
 * /templates:
 *   get:
 *     summary: List all templates
 *     tags: [Templates]
 *     security:
 *       - BearerAuth: []
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 25 }
 *     responses:
 *       200:
 *         description: Array of template objects
 *       401:
 *         $ref: '#/components/schemas/Error'
 */
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { page, limit } = req.query;

    if (page || limit) {
      const pageNum = Math.max(1, parseInt(page) || 1);
      const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 25));
      const offset = (pageNum - 1) * limitNum;

      const { count, rows: templates } = await Template.findAndCountAll({
        limit: limitNum,
        offset,
        order: [['createdAt', 'DESC']],
      });

      return res.status(200).json({
        success: true,
        templates,
        pagination: {
          total: count,
          page: pageNum,
          limit: limitNum,
          totalPages: Math.ceil(count / limitNum),
        },
      });
    }

    const templates = await Template.findAll();
    
    res.status(200).json({
      success: true,
      templates
    });
  } catch (error) {
    console.error('Get templates error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error while retrieving templates' 
    });
  }
});

/**
 * @swagger
 * /templates/{id}:
 *   get:
 *     summary: Get a template by ID
 *     tags: [Templates]
 *     security:
 *       - BearerAuth: []
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Template object
 *       404:
 *         $ref: '#/components/schemas/Error'
 */
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const template = await Template.findByPk(req.params.id);
    
    if (!template) {
      return res.status(404).json({ 
        success: false, 
        message: 'Template not found' 
      });
    }
    
    res.status(200).json({
      success: true,
      template
    });
  } catch (error) {
    console.error('Get template error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error while retrieving template' 
    });
  }
});

/**
 * @swagger
 * /templates:
 *   post:
 *     summary: Create a new template
 *     tags: [Templates]
 *     security:
 *       - BearerAuth: []
 *       - ApiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name: { type: string }
 *               description: { type: string }
 *               headers:
 *                 type: array
 *                 items: { type: object }
 *               middleware:
 *                 type: array
 *                 items: { type: object }
 *     responses:
 *       201:
 *         description: Template created
 *       400:
 *         $ref: '#/components/schemas/Error'
 */
router.post('/', [authMiddleware, roleMiddleware('admin')], async (req, res) => {
  try {
    const { name, description, headers, middleware } = req.body;
    
    // Validate input
    if (!name) {
      return res.status(400).json({ 
        success: false, 
        message: 'Please provide a template name' 
      });
    }
    
    // Create template
    const template = await Template.create({
      name,
      description,
      headers: headers || [],
      middleware: middleware || []
    });
    
    // Log template creation
    await logAction({
      userId: req.user.id,
      action: 'TEMPLATE_CREATED',
      resource: 'template',
      resourceId: template.id,
      details: {
        name: template.name,
        description: template.description
      },
      status: 'success'
    }, req);
    
    res.status(201).json({
      success: true,
      template
    });
  } catch (error) {
    console.error('Create template error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error during template creation' 
    });
  }
});

/**
 * @swagger
 * /templates/{id}:
 *   put:
 *     summary: Update a template
 *     tags: [Templates]
 *     security:
 *       - BearerAuth: []
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name: { type: string }
 *               description: { type: string }
 *               headers:
 *                 type: array
 *                 items: { type: object }
 *               middleware:
 *                 type: array
 *                 items: { type: object }
 *     responses:
 *       200:
 *         description: Template updated
 *       404:
 *         $ref: '#/components/schemas/Error'
 */
router.put('/:id', [authMiddleware, roleMiddleware('admin')], async (req, res) => {
  try {
    const template = await Template.findByPk(req.params.id);
    
    if (!template) {
      return res.status(404).json({ 
        success: false, 
        message: 'Template not found' 
      });
    }
    
    // Update template fields
    const updatableFields = ['name', 'description', 'headers', 'middleware'];
    
    updatableFields.forEach(field => {
      if (req.body[field] !== undefined) {
        template[field] = req.body[field];
      }
    });
    
    await template.save();
    
    // Log template update
    await logAction({
      userId: req.user.id,
      action: 'TEMPLATE_UPDATED',
      resource: 'template',
      resourceId: template.id,
      details: {
        name: template.name,
        description: template.description
      },
      status: 'success'
    }, req);
    
    res.status(200).json({
      success: true,
      template
    });
  } catch (error) {
    console.error('Update template error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error during template update' 
    });
  }
});

/**
 * @swagger
 * /templates/{id}:
 *   delete:
 *     summary: Delete a template
 *     tags: [Templates]
 *     security:
 *       - BearerAuth: []
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Template deleted
 *       404:
 *         $ref: '#/components/schemas/Error'
 */
router.delete('/:id', [authMiddleware, roleMiddleware('admin')], async (req, res) => {
  try {
    const template = await Template.findByPk(req.params.id);
    
    if (!template) {
      return res.status(404).json({ 
        success: false, 
        message: 'Template not found' 
      });
    }
    
    // Log template deletion
    await logAction({
      userId: req.user.id,
      action: 'TEMPLATE_DELETED',
      resource: 'template',
      resourceId: template.id,
      details: {
        name: template.name
      },
      status: 'success'
    }, req);
    
    await template.destroy();
    
    res.status(200).json({
      success: true,
      message: 'Template deleted successfully'
    });
  } catch (error) {
    console.error('Delete template error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error during template deletion' 
    });
  }
});

/**
 * @swagger
 * /templates/{id}/apply/{proxyId}:
 *   post:
 *     summary: Apply a template to a proxy
 *     tags: [Templates]
 *     security:
 *       - BearerAuth: []
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *       - in: path
 *         name: proxyId
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Template applied to proxy
 *       404:
 *         $ref: '#/components/schemas/Error'
 */
router.post('/:id/apply/:proxyId', [authMiddleware, roleMiddleware('admin')], async (req, res) => {
  try {
    const template = await Template.findByPk(req.params.id);
    
    if (!template) {
      return res.status(404).json({ 
        success: false, 
        message: 'Template not found' 
      });
    }
    
    const proxy = await Proxy.findByPk(req.params.proxyId);
    
    if (!proxy) {
      return res.status(404).json({ 
        success: false, 
        message: 'Proxy not found' 
      });
    }
    
    // Apply template to proxy
    const result = await caddyService.applyTemplate(proxy, template);
    
    // Log template application
    await logAction({
      userId: req.user.id,
      action: 'TEMPLATE_APPLIED',
      resource: 'template',
      resourceId: template.id,
      details: {
        templateName: template.name,
        proxyId: proxy.id,
        proxyName: proxy.name
      },
      status: 'success'
    }, req);
    
    res.status(200).json({
      success: true,
      message: 'Template applied successfully',
      result
    });
  } catch (error) {
    console.error('Apply template error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error while applying template' 
    });
  }
});

module.exports = router;
