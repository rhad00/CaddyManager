const AuditLog = require('../models/auditLog');

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
        const logData = {
            user_id: userId,
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
