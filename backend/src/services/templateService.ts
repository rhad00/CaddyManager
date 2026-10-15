import { sequelize, Template } from '../models';
import type { TemplateHeader, TemplateMiddleware } from '../models/template';
import { S3_TEMPLATE_NAME, S3_TEMPLATE_DESCRIPTION } from '../utils/s3Template';

/** A template that ships with CaddyManager */
interface TemplateSeed {
  name: string;
  description: string;
  headers: TemplateHeader[];
  middleware: TemplateMiddleware[];
}

const DEFAULT_TEMPLATES: TemplateSeed[] = [
  {
    name: 'Authelia',
    description: 'Authentication server with proper forwarding headers',
    headers: [
      {
        header_type: 'request',
        header_name: 'x-original-uri',
        header_value: '{http.request.uri}'
      },
      {
        header_type: 'request',
        header_name: 'x-forwarded-method',
        header_value: '{http.request.method}'
      },
      {
        header_type: 'request',
        header_name: 'x-forwarded-proto',
        header_value: '{http.request.scheme}'
      },
      {
        header_type: 'request',
        header_name: 'x-forwarded-host',
        header_value: '{http.request.host}'
      },
      {
        header_type: 'request',
        header_name: 'x-forwarded-uri',
        header_value: '{http.request.uri}'
      }
    ],
    middleware: []
  },
  {
    name: 'Keycloak',
    description: 'Identity and access management with proper forwarding headers',
    headers: [
      {
        header_type: 'request',
        header_name: 'x-forwarded-proto',
        header_value: '{http.request.scheme}'
      },
      {
        header_type: 'request',
        header_name: 'x-forwarded-host',
        header_value: '{http.request.host}'
      },
      {
        header_type: 'request',
        header_name: 'x-real-ip',
        header_value: '{http.request.remote.host}'
      }
    ],
    middleware: []
  },
  {
    name: S3_TEMPLATE_NAME,
    description: S3_TEMPLATE_DESCRIPTION,
    headers: [],
    middleware: []
  },
  {
    name: 'Nextcloud',
    description: 'Self-hosted productivity platform with WebDAV support',
    headers: [
      {
        header_type: 'request',
        header_name: 'x-forwarded-for',
        header_value: '{http.request.remote.host}'
      },
      {
        header_type: 'request',
        header_name: 'x-forwarded-proto',
        header_value: '{http.request.scheme}'
      },
      {
        header_type: 'request',
        header_name: 'x-forwarded-host',
        header_value: '{http.request.host}'
      }
    ],
    middleware: [
      {
        middleware_type: 'rate_limit',
        configuration: {
          rate: 100,
          unit: 'second'
        },
        order: 0
      }
    ]
  },
  {
    name: 'Cloudflare Tunnel',
    description: 'Cloudflare Tunnel with proper IP forwarding',
    headers: [
      {
        header_type: 'request',
        header_name: 'cf-connecting-ip',
        header_value: '{http.request.remote.host}'
      },
      {
        header_type: 'request',
        header_name: 'x-real-ip',
        header_value: '{http.request.remote.host}'
      }
    ],
    middleware: []
  },
  {
    name: 'Grafana',
    description: 'Monitoring and observability platform with auth headers',
    headers: [
      {
        header_type: 'request',
        header_name: 'x-webauth-user',
        header_value: '{http.auth.user.id}'
      },
      {
        header_type: 'request',
        header_name: 'x-forwarded-user',
        header_value: '{http.auth.user.id}'
      },
      {
        header_type: 'request',
        header_name: 'x-forwarded-host',
        header_value: '{http.request.host}'
      }
    ],
    middleware: []
  },
  {
    name: 'Kibana',
    description: 'Elasticsearch dashboard with proper headers and path rewrites',
    headers: [
      {
        header_type: 'request',
        header_name: 'x-forwarded-for',
        header_value: '{http.request.remote.host}'
      },
      {
        header_type: 'request',
        header_name: 'x-forwarded-proto',
        header_value: '{http.request.scheme}'
      },
      {
        header_type: 'request',
        header_name: 'x-forwarded-host',
        header_value: '{http.request.host}'
      }
    ],
    middleware: [
      {
        middleware_type: 'redirect',
        configuration: {
          from: '/',
          to: '/app/kibana'
        },
        order: 0
      }
    ]
  }
];

/**
 * Service for managing predefined templates for common applications
 */
export class TemplateService {
  /**
   * Initialize default templates if they don't exist
   * @returns whether the templates are in place (false when creating them failed)
   */
  async initializeDefaultTemplates(): Promise<boolean> {
    try {
      // Check if any templates exist
      const templateCount = await Template.count();

      // If no templates exist, create default ones
      if (templateCount === 0) {
        console.log('No templates found. Creating default service templates...');

        // Use transaction to ensure data consistency
        const transaction = await sequelize.transaction();

        try {
          for (const template of DEFAULT_TEMPLATES) {
            await Template.create(template, { transaction });
          }

          await transaction.commit();
          console.log('Default service templates created successfully');
          return true;
        } catch (error) {
          // Rollback transaction on error
          await transaction.rollback();
          throw error;
        }
      }

      return true;
    } catch (error) {
      console.error('Failed to initialize default templates:', error);
      return false;
    }
  }
}

export const templateService = new TemplateService();
