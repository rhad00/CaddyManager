const { AuditLog } = require('../models/auditLog');
const { User } = require('../models');

/**
 * Details to store: the caller's details plus the id of the affected resource (the audit
 * table has no column for it)
 * @param {*} details
 * @param {string|number|undefined} resourceId
 */
const withResourceId = (details, resourceId) => {
    if (resourceId === undefined || resourceId === null) return details;
    if (details === undefined || details === null) return { resource_id: resourceId };
    if (typeof details === 'object' && !Array.isArray(details)) return { ...details, resource_id: resourceId };
    return { message: details, resource_id: resourceId };
};

/**
 * Log an audit event
 * @param {Object} params - Log parameters
 * @param {Number|string} [params.userId] - User ID (optional)
 * @param {String} params.action - Action name (e.g., 'LOGIN', 'CREATE_PROXY')
 * @param {String} params.resource - Resource affected (e.g., 'auth', 'proxy:example.com')
 * @param {String|Number} [params.resourceId] - Id of the affected resource (kept in the details)
 * @param {*} [params.details] - Additional details (optional)
 * @param {String} [params.status] - Status of the action ('success', 'failure')
 * @param {import('express').Request|null} [req] - Express request object (optional, for IP/UserAgent)
 */
const logAction = async ({ userId, action, resource, resourceId, details, status = 'success' }, req = null) => {
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
            details: withResourceId(details, resourceId),
            status
        };

        if (req) {
            logData.ip_address = req.ip || req.connection.remoteAddress;
            logData.user_agent = req.get('User-Agent');
        }

        try {
            await AuditLog.create(logData);
        } catch (err) {
            // If foreign key constraint fails (e.g. user_id mismatch), try logging without user_id
            if (err.name === 'SequelizeForeignKeyConstraintError') {
                console.warn('AuditLog creation failed due to FK constraint. Retrying without user_id.', err.message);
                logData.user_id = null;
                await AuditLog.create(logData);
            } else {
                throw err;
            }
        }
    } catch (error) {
        console.error('Failed to create audit log:', error);
        // Don't throw error to prevent disrupting the main flow
    }
};

module.exports = {
    logAction
};
