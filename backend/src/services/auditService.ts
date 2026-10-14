import type { Request } from 'express';
import type { CreationAttributes } from 'sequelize';
import { AuditLog, type AuditDetails } from '../models/auditLog';
import { User } from '../models';

/**
 * Details to store: the caller's details plus the id of the affected resource (the audit
 * table has no column for it)
 */
const withResourceId = (details: unknown, resourceId: string | number | null | undefined): unknown => {
    if (resourceId === undefined || resourceId === null) return details;
    if (details === undefined || details === null) return { resource_id: resourceId };
    if (typeof details === 'object' && !Array.isArray(details)) return { ...details, resource_id: resourceId };
    return { message: details, resource_id: resourceId };
};

export interface AuditEvent {
    /** User ID (optional) */
    userId?: string | number;
    /** Action name (e.g., 'LOGIN', 'CREATE_PROXY') */
    action: string;
    /** Resource affected (e.g., 'auth', 'proxy:example.com') */
    resource?: string;
    /** Id of the affected resource (kept in the details) */
    resourceId?: string | number | null;
    /** Additional details (optional) */
    details?: unknown;
    /** Status of the action ('success', 'failure') */
    status?: string;
}

/**
 * Log an audit event
 * @param event - Log parameters
 * @param req - Express request object (optional, for IP/UserAgent)
 */
export const logAction = async (
    { userId, action, resource, resourceId, details, status = 'success' }: AuditEvent,
    req: Request | null = null,
): Promise<void> => {
    try {
        // Resolve userId against DB to ensure foreign key validity
        let creatorId: string | null = null;
        try {
            const candidateId = userId || (req && req.user && req.user.id);
            if (candidateId) {
                const dbUser = await User.findByPk(candidateId);
                if (dbUser) creatorId = dbUser.id;
            }
        } catch (err) {
            console.error('Failed to resolve user for audit log:', err instanceof Error ? err.message : err);
        }

        const logData: CreationAttributes<AuditLog> = {
            user_id: creatorId,
            action,
            resource,
            details: withResourceId(details, resourceId) as AuditDetails | undefined,
            status
        };

        if (req) {
            logData.ip_address = req.ip || req.socket.remoteAddress;
            logData.user_agent = req.get('User-Agent');
        }

        try {
            await AuditLog.create(logData);
        } catch (err) {
            // If foreign key constraint fails (e.g. user_id mismatch), try logging without user_id
            if (err instanceof Error && err.name === 'SequelizeForeignKeyConstraintError') {
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
