const express = require('express');
const gitService = require('../../services/gitService');
const { GitRepository, ConfigChange } = require('../../models');
const { authMiddleware, roleMiddleware } = require('../../middleware/auth');
const { body, validationResult } = require('express-validator');
const router = express.Router();

/**
 * @route GET /api/git/repositories
 * @desc Get all Git repositories
 * @access Private
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
 * @route GET /api/git/repositories/:id
 * @desc Get single repository details
 * @access Private
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
 * @route POST /api/git/repositories
 * @desc Create new Git repository connection
 * @access Private (Admin only)
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
        message: `Failed to clone repository: ${error.message}`
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
 * @route PUT /api/git/repositories/:id
 * @desc Update repository settings
 * @access Private (Admin only)
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
 * @route DELETE /api/git/repositories/:id
 * @desc Delete repository connection
 * @access Private (Admin only)
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
 * @route POST /api/git/repositories/:id/sync
 * @desc Manually trigger sync from Git
 * @access Private (Admin only)
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
      message: error.message || 'Server error while syncing repository'
    });
  }
});

/**
 * @route POST /api/git/repositories/:id/test
 * @desc Test repository connection
 * @access Private (Admin only)
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
 * @route GET /api/git/history
 * @desc Get commit history (optionally filtered by resource)
 * @access Private
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
 * @route GET /api/git/repositories/:id/diff
 * @desc Get diff between commits
 * @access Private
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
 * @route POST /api/git/repositories/:id/rollback
 * @desc Rollback to specific commit
 * @access Private (Admin only)
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
      message: error.message || 'Server error while rolling back'
    });
  }
});

/**
 * @route POST /api/git/repositories/:id/export
 * @desc Manually export current configuration to Git
 * @access Private (Admin only)
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
