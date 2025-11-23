const express = require('express');
const Template = require('../../models/template');
const { authMiddleware, roleMiddleware } = require('../../middleware/auth');
const caddyService = require('../../services/caddyService');
const Proxy = require('../../models/proxy');
const { logAction } = require('../../services/auditService');
const router = express.Router();

/**
 * @route GET /api/templates
 * @desc Get all templates
 * @access Private
 */
router.get('/', authMiddleware, async (req, res) => {
  try {
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
 * @route GET /api/templates/:id
 * @desc Get template by ID
 * @access Private
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
 * @route POST /api/templates
 * @desc Create a new template
 * @access Private (Admin only)
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
 * @route PUT /api/templates/:id
 * @desc Update a template
 * @access Private (Admin only)
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
 * @route DELETE /api/templates/:id
 * @desc Delete a template
 * @access Private (Admin only)
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
 * @route POST /api/templates/:id/apply/:proxyId
 * @desc Apply a template to a proxy
 * @access Private (Admin only)
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
      message: `Server error while applying template: ${error.message}` 
    });
  }
});

module.exports = router;
