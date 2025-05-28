const { sequelize, Template } = require('../models');

/**
 * Service for managing predefined templates for common applications
 */
class TemplateService {
  /**
   * Initialize default templates if they don't exist
   */
  async initializeDefaultTemplates() {
    try {
      // Check if any templates exist
      const templateCount = await Template.count();
      
      // If no templates exist, create default ones
      if (templateCount === 0) {
        console.log('No templates found. Creating default service templates...');
        
        // Use transaction to ensure data consistency
        const transaction = await sequelize.transaction();
        
        try {
          // Create Authelia template
          await Template.create({
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
          }, { transaction });
          
          // Create Keycloak template
          await Template.create({
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
          }, { transaction });
          
          // Create Amazon S3 template
          await Template.create({
            name: 'Amazon S3',
            description: 'S3 compatible storage with proper CORS and forwarding headers',
            headers: [
              {
                header_type: 'request',
                header_name: 'Host',
                header_value: '{http.request.host}'
              },
              {
                header_type: 'request',
                header_name: 'Authorization',
                header_value: '{http.request.header.Authorization}'
              },
              {
                header_type: 'request',
                header_name: 'Content-Type',
                header_value: '{http.request.header.Content-Type}'
              },
              {
                header_type: 'request',
                header_name: 'Content-Length',
                header_value: '{http.request.header.Content-Length}'
              },
              {
                header_type: 'request',
                header_name: 'Content-MD5',
                header_value: '{http.request.header.Content-MD5}'
              },
              {
                header_type: 'request',
                header_name: 'X-Amz-Date',
                header_value: '{http.request.header.X-Amz-Date}'
              },
              {
                header_type: 'request',
                header_name: 'X-Amz-Content-Sha256',
                header_value: '{http.request.header.X-Amz-Content-Sha256}'
              },
              {
                header_type: 'request',
                header_name: 'X-Amz-Acl',
                header_value: '{http.request.header.X-Amz-Acl}'
              }
            ],
            middleware: []
          }, { transaction });
          
          // Create Nextcloud template
          await Template.create({
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
                  unit: "second"
                },
                order: 0
              }
            ]
          }, { transaction });
          
          // Create Cloudflare Tunnel template
          await Template.create({
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
          }, { transaction });
          
          // Create Grafana template
          await Template.create({
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
          }, { transaction });
          
          // Create Kibana/Elastic template
          await Template.create({
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
                  from: "/",
                  to: "/app/kibana"
                },
                order: 0
              }
            ]
          }, { transaction });
          
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

module.exports = new TemplateService();
