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
                header_name: 'X-Original-URI',
                header_value: '{http.request.uri}'
              },
              {
                header_type: 'request',
                header_name: 'X-Forwarded-Method',
                header_value: '{http.request.method}'
              },
              {
                header_type: 'request',
                header_name: 'X-Forwarded-Proto',
                header_value: '{http.request.scheme}'
              },
              {
                header_type: 'request',
                header_name: 'X-Forwarded-Host',
                header_value: '{http.request.host}'
              },
              {
                header_type: 'request',
                header_name: 'X-Forwarded-URI',
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
                header_name: 'X-Forwarded-Proto',
                header_value: '{http.request.scheme}'
              },
              {
                header_type: 'request',
                header_name: 'X-Forwarded-Host',
                header_value: '{http.request.host}'
              },
              {
                header_type: 'request',
                header_name: 'X-Real-IP',
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
                header_value: '{http.reverse_proxy.upstream.host}'
              },
              {
                header_type: 'request',
                header_name: 'X-Forwarded-For',
                header_value: '{http.request.remote.host}'
              },
              {
                header_type: 'response',
                header_name: 'Access-Control-Allow-Origin',
                header_value: '*'
              },
              {
                header_type: 'response',
                header_name: 'Access-Control-Allow-Methods',
                header_value: 'GET, PUT, POST, DELETE, HEAD'
              },
              {
                header_type: 'response',
                header_name: 'Access-Control-Allow-Headers',
                header_value: 'Authorization, Content-Type, X-Amz-Date, X-Amz-Content-Sha256, X-Amz-Security-Token'
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
                header_name: 'X-Forwarded-For',
                header_value: '{http.request.remote.host}'
              },
              {
                header_type: 'request',
                header_name: 'X-Forwarded-Proto',
                header_value: '{http.request.scheme}'
              },
              {
                header_type: 'request',
                header_name: 'X-Forwarded-Host',
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
                header_name: 'CF-Connecting-IP',
                header_value: '{http.request.remote.host}'
              },
              {
                header_type: 'request',
                header_name: 'X-Real-IP',
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
                header_name: 'X-Webauth-User',
                header_value: '{http.auth.user.id}'
              },
              {
                header_type: 'request',
                header_name: 'X-Forwarded-User',
                header_value: '{http.auth.user.id}'
              },
              {
                header_type: 'request',
                header_name: 'X-Forwarded-Host',
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
                header_name: 'X-Forwarded-For',
                header_value: '{http.request.remote.host}'
              },
              {
                header_type: 'request',
                header_name: 'X-Forwarded-Proto',
                header_value: '{http.request.scheme}'
              },
              {
                header_type: 'request',
                header_name: 'X-Forwarded-Host',
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
