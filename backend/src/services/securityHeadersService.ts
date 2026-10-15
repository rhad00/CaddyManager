import type { Transaction } from 'sequelize';
import type { Header, HeaderType } from '../models/header';

export interface SecurityHeader {
  header_type: HeaderType;
  header_name: string;
  header_value: string;
  enabled: boolean;
}

export const DEFAULT_SECURITY_HEADERS: SecurityHeader[] = [
  {
    header_type: 'response',
    header_name: 'Strict-Transport-Security',
    header_value: 'max-age=31536000; includeSubDomains; preload',
    enabled: true
  },
  {
    header_type: 'response',
    header_name: 'X-Content-Type-Options',
    header_value: 'nosniff',
    enabled: true
  },
  {
    header_type: 'response',
    header_name: 'X-Frame-Options',
    header_value: 'SAMEORIGIN',
    enabled: true
  },
  {
    header_type: 'response',
    header_name: 'Content-Security-Policy',
    header_value: "default-src 'self'; img-src 'self' data: https:; script-src 'self'; style-src 'self' 'unsafe-inline';",
    enabled: true
  },
  {
    header_type: 'response',
    header_name: 'Referrer-Policy',
    header_value: 'strict-origin-when-cross-origin',
    enabled: true
  },
  {
    header_type: 'response',
    header_name: 'Permissions-Policy',
    header_value: 'camera=(), microphone=(), geolocation=(), payment=()',
    enabled: true
  }
];

export const applySecurityHeaders = async (
  proxyId: string,
  headersModel: typeof Header,
  transaction?: Transaction,
): Promise<void> => {
  try {
    // Remove any existing security headers for this proxy
    await headersModel.destroy({
      where: {
        proxy_id: proxyId,
        header_name: DEFAULT_SECURITY_HEADERS.map(h => h.header_name)
      },
      transaction
    });

    // Create all security headers for this proxy
    const headersToCreate = DEFAULT_SECURITY_HEADERS.map(header => ({
      ...header,
      proxy_id: proxyId
    }));

    await headersModel.bulkCreate(headersToCreate, { transaction });
  } catch (error) {
    console.error('Error applying security headers:', error);
    throw new Error('Failed to apply security headers');
  }
};

export const removeSecurityHeaders = async (
  proxyId: string,
  headersModel: typeof Header,
  transaction?: Transaction,
): Promise<void> => {
  try {
    await headersModel.destroy({
      where: {
        proxy_id: proxyId,
        header_name: DEFAULT_SECURITY_HEADERS.map(h => h.header_name)
      },
      transaction
    });
  } catch (error) {
    console.error('Error removing security headers:', error);
    throw new Error('Failed to remove security headers');
  }
};
