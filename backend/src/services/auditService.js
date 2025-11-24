const AuditLog = require('../models/auditLog');
const { User } = require('../models');

/**
 * Log an audit event
 * @param {Object} params - Log parameters
 * @param {Number} params.userId - User ID (optional)
 * @param {String} params.action - Action name (e.g., 'LOGIN', 'CREATE_PROXY')
 * @param {String} params.resource - Resource affected (e.g., 'auth', 'proxy:example.com')
 * @param {Object} params.details - Additional details (optional)
 * @param {Object} req - Express request object (optional, for IP/UserAgent)
 * @param {String} params.status - Status of the action ('success', 'failure')
 */
const logAction = async ({ userId, action, resource, details, status = 'success' }, req = null) => {
    try {
            // Resolve userId against DB to ensure foreign key validity
            let creatorId = null;
            try {
                const candidateId = userId || (req && req.user && req.user.id);
                if (candidateId) {
                    const dbUser = await User.findByPk(candidateId);
                    if (dbUser) creatorId = dbUser.id;
                }
            } catch (err) {
                console.error('Failed to resolve user for audit log:', err.message);
            }

            const logData = {
                user_id: creatorId,
                action,
                resource,
                details,
                status
            };

        if (req) {
            logData.ip_address = req.ip || req.connection.remoteAddress;
            logData.user_agent = req.get('User-Agent');
        }

        await AuditLog.create(logData);
    } catch (error) {
        console.error('Failed to create audit log:', error);
        // Don't throw error to prevent disrupting the main flow
    }
};

module.exports = {
    logAction
};
