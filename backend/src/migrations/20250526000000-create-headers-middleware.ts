import { QueryInterface, DataTypes } from 'sequelize';

export const up = async (queryInterface: QueryInterface): Promise<void> => {
  // Create Headers table
  await queryInterface.createTable('headers', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    proxy_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'proxies',
        key: 'id',
      },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE',
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    value: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    type: {
      type: DataTypes.ENUM('request', 'response'),
      allowNull: false,
      defaultValue: 'request',
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    updated_at: {
      type: DataTypes.DATE,
      allowNull: false,
    },
  });

  // Create Security Headers table
  await queryInterface.createTable('security_headers', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    proxy_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'proxies',
        key: 'id',
      },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE',
    },
    csp_enabled: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    csp_policy: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    xss_protection: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
    hsts_enabled: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    hsts_max_age: {
      type: DataTypes.INTEGER,
      defaultValue: 31536000, // 1 year
    },
    hsts_include_subdomains: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    hsts_preload: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    frame_options: {
      type: DataTypes.ENUM('DENY', 'SAMEORIGIN', 'ALLOW-FROM'),
      allowNull: true,
    },
    frame_options_uri: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    content_type_nosniff: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
    referrer_policy: {
      type: DataTypes.ENUM(
        'no-referrer',
        'no-referrer-when-downgrade',
        'origin',
        'origin-when-cross-origin',
        'same-origin',
        'strict-origin',
        'strict-origin-when-cross-origin',
        'unsafe-url',
      ),
      allowNull: true,
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    updated_at: {
      type: DataTypes.DATE,
      allowNull: false,
    },
  });

  // Create Rate Limiting table
  await queryInterface.createTable('rate_limits', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    proxy_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'proxies',
        key: 'id',
      },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE',
    },
    enabled: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    requests_per_minute: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    requests_per_hour: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    requests_per_day: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    burst_size: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    key_type: {
      type: DataTypes.ENUM('ip', 'header', 'query', 'cookie'),
      defaultValue: 'ip',
    },
    key_name: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    response_code: {
      type: DataTypes.INTEGER,
      defaultValue: 429,
    },
    response_message: {
      type: DataTypes.STRING,
      defaultValue: 'Too Many Requests',
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    updated_at: {
      type: DataTypes.DATE,
      allowNull: false,
    },
  });

  // Create IP Restrictions table
  await queryInterface.createTable('ip_restrictions', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    proxy_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'proxies',
        key: 'id',
      },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE',
    },
    type: {
      type: DataTypes.ENUM('allow', 'block'),
      allowNull: false,
    },
    ip_address: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    cidr_mask: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    description: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    updated_at: {
      type: DataTypes.DATE,
      allowNull: false,
    },
  });

  // Create Path Rules table
  await queryInterface.createTable('path_rules', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    proxy_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'proxies',
        key: 'id',
      },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE',
    },
    path_pattern: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    rule_type: {
      type: DataTypes.ENUM('proxy', 'redirect', 'rewrite'),
      allowNull: false,
    },
    target_url: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    redirect_code: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    rewrite_pattern: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    priority: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    updated_at: {
      type: DataTypes.DATE,
      allowNull: false,
    },
  });

  // Create Basic Auth table
  await queryInterface.createTable('basic_auth', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    proxy_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'proxies',
        key: 'id',
      },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE',
    },
    enabled: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    realm: {
      type: DataTypes.STRING,
      defaultValue: 'Restricted Area',
    },
    username: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    password_hash: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    path_pattern: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    updated_at: {
      type: DataTypes.DATE,
      allowNull: false,
    },
  });

  // Add indexes for performance
  await queryInterface.addIndex('headers', ['proxy_id']);
  await queryInterface.addIndex('headers', ['type']);
  await queryInterface.addIndex('security_headers', ['proxy_id']);
  await queryInterface.addIndex('rate_limits', ['proxy_id']);
  await queryInterface.addIndex('ip_restrictions', ['proxy_id']);
  await queryInterface.addIndex('ip_restrictions', ['type']);
  await queryInterface.addIndex('path_rules', ['proxy_id']);
  await queryInterface.addIndex('path_rules', ['priority']);
  await queryInterface.addIndex('basic_auth', ['proxy_id']);
};

export const down = async (queryInterface: QueryInterface): Promise<void> => {
  await queryInterface.dropTable('basic_auth');
  await queryInterface.dropTable('path_rules');
  await queryInterface.dropTable('ip_restrictions');
  await queryInterface.dropTable('rate_limits');
  await queryInterface.dropTable('security_headers');
  await queryInterface.dropTable('headers');
};
