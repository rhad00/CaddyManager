const express = require('express');
const gitService = require('../../services/gitService');
const { GitRepository, ConfigChange } = require('../../models');
const { authMiddleware, roleMiddleware } = require('../../middleware/auth');
const { body, validationResult } = require('express-validator');
const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Git
 *   description: Git repository integration for config versioning
 *
 * /git/repositories:
 *   get:
 *     summary: List all connected Git repositories
 *     tags: [Git]
 *     security:
 *       - BearerAuth: []
 *       - ApiKeyAuth: []
 *     responses:
 *       200:
 *         description: Array of repository objects
 *       401:
 *         $ref: '#/components/schemas/Error'
 */
router.get('/repositories', authMiddleware, async (req, res) => {
  try {
    const repos = await GitRepository.findAll({
      attributes: { exclude: ['access_token', 'ssh_key'] },
      order: [['createdAt', 'DESC']]
    });

    res.status(200).json({
      success: true,
      repositories: repos
    });
  } catch (error) {
    console.error('Get repositories error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while retrieving repositories'
    });
  }
});

/**
 * @swagger
 * /git/repositories/{id}:
 *   get:
 *     summary: Get repository details with recent commit history
 *     tags: [Git]
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
 *         description: Repository object with last 10 config changes
 *       404:
 *         $ref: '#/components/schemas/Error'
 */
router.get('/repositories/:id', authMiddleware, async (req, res) => {
  try {
    const repo = await GitRepository.findByPk(req.params.id, {
      attributes: { exclude: ['access_token', 'ssh_key'] },
      include: [{
        model: ConfigChange,
        as: 'changes',
        limit: 10,
        order: [['committed_at', 'DESC']]
      }]
    });

    if (!repo) {
      return res.status(404).json({
        success: false,
        message: 'Repository not found'
      });
    }

    res.status(200).json({
      success: true,
      repository: repo
    });
  } catch (error) {
    console.error('Get repository error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while retrieving repository'
    });
  }
});

/**
 * @swagger
 * /git/repositories:
 *   post:
 *     summary: Connect a new Git repository
 *     tags: [Git]
 *     security:
 *       - BearerAuth: []
 *       - ApiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, provider, repository_url, access_token]
 *             properties:
 *               name: { type: string }
 *               provider: { type: string, enum: [github, gitlab, gitea, bitbucket] }
 *               repository_url: { type: string, format: uri }
 *               branch: { type: string, default: main }
 *               access_token: { type: string }
 *               auto_commit: { type: boolean, default: true }
 *               auto_sync: { type: boolean, default: false }
 *               sync_interval: { type: integer, default: 300 }
 *     responses:
 *       201:
 *         description: Repository connected
 *       400:
 *         $ref: '#/components/schemas/Error'
 */
router.post('/repositories', [
  authMiddleware,
  roleMiddleware('admin'),
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('provider').isIn(['github', 'gitlab', 'gitea', 'bitbucket']).withMessage('Invalid provider'),
  body('repository_url').isURL().withMessage('Valid repository URL is required'),
  body('access_token').notEmpty().withMessage('Access token is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const {
      name,
      provider,
      repository_url,
      branch,
      access_token,
      auto_commit,
      auto_sync,
      sync_interval,
      commit_message_template
    } = req.body;

    // Encrypt the access token
    const encryptedToken = gitService.encrypt(access_token);

    // Create repository record
    const repo = await GitRepository.create({
      name,
      provider,
      repository_url,
      branch: branch || 'main',
      access_token: encryptedToken,
      auto_commit: auto_commit !== false,
      auto_sync: auto_sync === true,
      sync_interval: sync_interval || 300,
      commit_message_template: commit_message_template || undefined
    });

    // Test connection
    const connectionTest = await gitService.testConnection(repo);
    if (!connectionTest.success) {
      // Delete the repo if connection fails
      await repo.destroy();
      return res.status(400).json({
        success: false,
        message: `Connection test failed: ${connectionTest.message}`
      });
    }

    // Initial clone
    try {
      await gitService.cloneOrUpdateRepo(repo);
    } catch (error) {
      await repo.destroy();
      return res.status(400).json({
        success: false,
        message: 'Failed to clone repository'
      });
    }

    // Start auto-sync if enabled
    if (repo.auto_sync) {
      gitService.startAutoSync(repo);
    }

    // Return without sensitive data
    const repoData = repo.toJSON();
    delete repoData.access_token;
    delete repoData.ssh_key;

    res.status(201).json({
      success: true,
      repository: repoData,
      message: 'Repository connected successfully'
    });
  } catch (error) {
    console.error('Create repository error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while creating repository'
    });
  }
});

/**
 * @swagger
 * /git/repositories/{id}:
 *   put:
 *     summary: Update repository settings
 *     tags: [Git]
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
 *               branch: { type: string }
 *               access_token: { type: string }
 *               auto_commit: { type: boolean }
 *               auto_sync: { type: boolean }
 *               sync_interval: { type: integer }
 *               enabled: { type: boolean }
 *     responses:
 *       200:
 *         description: Repository updated
 *       404:
 *         $ref: '#/components/schemas/Error'
 */
router.put('/repositories/:id', [
  authMiddleware,
  roleMiddleware('admin')
], async (req, res) => {
  try {
    const repo = await GitRepository.findByPk(req.params.id);
    if (!repo) {
      return res.status(404).json({
        success: false,
        message: 'Repository not found'
      });
    }

    const {
      name,
      branch,
      access_token,
      auto_commit,
      auto_sync,
      sync_interval,
      commit_message_template,
      enabled
    } = req.body;

    // Update fields
    if (name) repo.name = name;
    if (branch) repo.branch = branch;
    if (access_token) repo.access_token = gitService.encrypt(access_token);
    if (typeof auto_commit === 'boolean') repo.auto_commit = auto_commit;
    if (typeof auto_sync === 'boolean') repo.auto_sync = auto_sync;
    if (sync_interval) repo.sync_interval = sync_interval;
    if (commit_message_template) repo.commit_message_template = commit_message_template;
    if (typeof enabled === 'boolean') repo.enabled = enabled;

    await repo.save();

    // Restart auto-sync if settings changed
    if (repo.auto_sync && repo.enabled) {
      gitService.startAutoSync(repo);
    }

    const repoData = repo.toJSON();
    delete repoData.access_token;
    delete repoData.ssh_key;

    res.status(200).json({
      success: true,
      repository: repoData,
      message: 'Repository updated successfully'
    });
  } catch (error) {
    console.error('Update repository error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while updating repository'
    });
  }
});

/**
 * @swagger
 * /git/repositories/{id}:
 *   delete:
 *     summary: Delete a Git repository connection
 *     tags: [Git]
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
 *         description: Repository deleted
 *       404:
 *         $ref: '#/components/schemas/Error'
 */
router.delete('/repositories/:id', [
  authMiddleware,
  roleMiddleware('admin')
], async (req, res) => {
  try {
    const repo = await GitRepository.findByPk(req.params.id);
    if (!repo) {
      return res.status(404).json({
        success: false,
        message: 'Repository not found'
      });
    }

    await repo.destroy();

    res.status(200).json({
      success: true,
      message: 'Repository deleted successfully'
    });
  } catch (error) {
    console.error('Delete repository error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while deleting repository'
    });
  }
});

/**
 * @swagger
 * /git/repositories/{id}/sync:
 *   post:
 *     summary: Manually trigger sync from Git
 *     tags: [Git]
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
 *         description: Sync completed
 *       404:
 *         $ref: '#/components/schemas/Error'
 */
router.post('/repositories/:id/sync', [
  authMiddleware,
  roleMiddleware('admin')
], async (req, res) => {
  try {
    const repo = await GitRepository.findByPk(req.params.id);
    if (!repo) {
      return res.status(404).json({
        success: false,
        message: 'Repository not found'
      });
    }

    const result = await gitService.syncFromGit(repo.id);

    res.status(200).json({
      success: true,
      ...result
    });
  } catch (error) {
    console.error('Sync repository error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while syncing repository'
    });
  }
});

/**
 * @swagger
 * /git/repositories/{id}/test:
 *   post:
 *     summary: Test Git repository connection
 *     tags: [Git]
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
 *         description: Connection test result
 *       404:
 *         $ref: '#/components/schemas/Error'
 */
router.post('/repositories/:id/test', [
  authMiddleware,
  roleMiddleware('admin')
], async (req, res) => {
  try {
    const repo = await GitRepository.findByPk(req.params.id);
    if (!repo) {
      return res.status(404).json({
        success: false,
        message: 'Repository not found'
      });
    }

    const result = await gitService.testConnection(repo);

    res.status(200).json(result);
  } catch (error) {
    console.error('Test connection error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while testing connection'
    });
  }
});

/**
 * @swagger
 * /git/history:
 *   get:
 *     summary: Get commit history
 *     tags: [Git]
 *     security:
 *       - BearerAuth: []
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: query
 *         name: resource_type
 *         schema: { type: string }
 *       - in: query
 *         name: resource_id
 *         schema: { type: string }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 50 }
 *     responses:
 *       200:
 *         description: Array of commit history entries
 */
router.get('/history', authMiddleware, async (req, res) => {
  try {
    const { resource_type, resource_id, limit } = req.query;

    const history = await gitService.getCommitHistory(
      resource_type,
      resource_id,
      parseInt(limit) || 50
    );

    res.status(200).json({
      success: true,
      history
    });
  } catch (error) {
    console.error('Get history error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while retrieving history'
    });
  }
});

/**
 * @swagger
 * /git/repositories/{id}/diff:
 *   get:
 *     summary: "Get diff between commits"
 *     tags: [Git]
 *     security:
 *       - BearerAuth: []
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: from
 *         required: true
 *         schema: { type: string }
 *         description: Base commit SHA
 *       - in: query
 *         name: to
 *         schema: { type: string }
 *         description: Target commit SHA (defaults to HEAD)
 *     responses:
 *       200:
 *         description: Diff output
 *       400:
 *         $ref: '#/components/schemas/Error'
 */
router.get('/repositories/:id/diff', authMiddleware, async (req, res) => {
  try {
    const { from, to } = req.query;

    if (!from) {
      return res.status(400).json({
        success: false,
        message: 'From commit is required'
      });
    }

    const diff = await gitService.getDiff(req.params.id, from, to);

    res.status(200).json({
      success: true,
      diff
    });
  } catch (error) {
    console.error('Get diff error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while retrieving diff'
    });
  }
});

/**
 * @swagger
 * /git/repositories/{id}/rollback:
 *   post:
 *     summary: Rollback configuration to a specific commit
 *     tags: [Git]
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
 *             required: [commit_sha]
 *             properties:
 *               commit_sha: { type: string }
 *     responses:
 *       200:
 *         description: Rolled back to specified commit
 *       400:
 *         $ref: '#/components/schemas/Error'
 */
router.post('/repositories/:id/rollback', [
  authMiddleware,
  roleMiddleware('admin'),
  body('commit_sha').notEmpty().withMessage('Commit SHA is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { commit_sha } = req.body;
    const result = await gitService.rollbackToCommit(req.params.id, commit_sha);

    res.status(200).json({
      success: true,
      ...result,
      message: `Rolled back to commit ${commit_sha.substr(0, 7)}`
    });
  } catch (error) {
    console.error('Rollback error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while rolling back'
    });
  }
});

/**
 * @swagger
 * /git/repositories/{id}/export:
 *   post:
 *     summary: Manually export current configuration to Git
 *     tags: [Git]
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
 *         description: Configuration exported or no changes to export
 *       404:
 *         $ref: '#/components/schemas/Error'
 */
router.post('/repositories/:id/export', [
  authMiddleware,
  roleMiddleware('admin')
], async (req, res) => {
  try {
    const repo = await GitRepository.findByPk(req.params.id);
    if (!repo) {
      return res.status(404).json({
        success: false,
        message: 'Repository not found'
      });
    }

    // Manually trigger an export and commit
    const result = await gitService.commitConfigChange(
      repo.id,
      'manual',
      'config',
      null,
      req.user.id,
      null,
      { exported_at: new Date() }
    );

    if (result) {
      res.status(200).json({
        success: true,
        commit_sha: result.commit_sha,
        message: 'Configuration exported successfully'
      });
    } else {
      res.status(200).json({
        success: true,
        message: 'No changes to export'
      });
    }
  } catch (error) {
    console.error('Export error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while exporting configuration'
    });
  }
});

module.exports = router;
