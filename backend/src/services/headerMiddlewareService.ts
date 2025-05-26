import { Header, HeaderType } from '../models/Header';
import { SecurityHeader } from '../models/SecurityHeader';
import { RateLimit } from '../models/RateLimit';
import { IpRestriction } from '../models/IpRestriction';
import { PathRule } from '../models/PathRule';
import { BasicAuth } from '../models/BasicAuth';
import { Proxy } from '../models/Proxy';

export interface CreateHeaderRequest {
  proxyId: string;
  name: string;
  value: string;
  type: HeaderType;
  isActive?: boolean;
}

export interface UpdateHeaderRequest {
  name?: string;
  value?: string;
  type?: HeaderType;
  isActive?: boolean;
}

export interface CreateSecurityHeaderRequest {
  proxyId: string;
  cspEnabled?: boolean;
  cspPolicy?: string;
  xssProtection?: boolean;
  hstsEnabled?: boolean;
  hstsMaxAge?: number;
  hstsIncludeSubdomains?: boolean;
  hstsPreload?: boolean;
  frameOptions?: 'DENY' | 'SAMEORIGIN' | 'ALLOW-FROM';
  frameOptionsUri?: string;
  contentTypeNosniff?: boolean;
  referrerPolicy?: string;
}

export interface CreateRateLimitRequest {
  proxyId: string;
  enabled: boolean;
  requestsPerMinute?: number;
  requestsPerHour?: number;
  requestsPerDay?: number;
  burstSize?: number;
  keyType?: 'ip' | 'header' | 'query' | 'cookie';
  keyName?: string;
  responseCode?: number;
  responseMessage?: string;
}

export interface CreateIpRestrictionRequest {
  proxyId: string;
  type: 'allow' | 'block';
  ipAddress: string;
  cidrMask?: number;
  description?: string;
  isActive?: boolean;
}

export interface CreatePathRuleRequest {
  proxyId: string;
  pathPattern: string;
  ruleType: 'proxy' | 'redirect' | 'rewrite';
  targetUrl?: string;
  redirectCode?: number;
  rewritePattern?: string;
  priority?: number;
  isActive?: boolean;
}

export interface CreateBasicAuthRequest {
  proxyId: string;
  enabled: boolean;
  realm?: string;
  username?: string;
  password?: string;
  pathPattern?: string;
}

export class HeaderMiddlewareService {
  // Header Management
  async createHeader(data: CreateHeaderRequest): Promise<Header> {
    // Verify proxy exists
    const proxy = await Proxy.findByPk(data.proxyId);
    if (!proxy) {
      throw new Error('Proxy not found');
    }

    return Header.create(data as any);
  }

  async getHeadersByProxy(proxyId: string): Promise<Header[]> {
    return Header.findAll({
      where: { proxyId },
      order: [['name', 'ASC']],
    });
  }

  async updateHeader(id: string, data: UpdateHeaderRequest): Promise<Header> {
    const header = await Header.findByPk(id);
    if (!header) {
      throw new Error('Header not found');
    }

    await header.update(data);
    return header;
  }

  async deleteHeader(id: string): Promise<void> {
    const header = await Header.findByPk(id);
    if (!header) {
      throw new Error('Header not found');
    }

    await header.destroy();
  }

  // Security Header Management
  async createOrUpdateSecurityHeader(data: CreateSecurityHeaderRequest): Promise<SecurityHeader> {
    // Verify proxy exists
    const proxy = await Proxy.findByPk(data.proxyId);
    if (!proxy) {
      throw new Error('Proxy not found');
    }

    const [securityHeader] = await SecurityHeader.upsert(data as any);
    return securityHeader;
  }

  async getSecurityHeaderByProxy(proxyId: string): Promise<SecurityHeader | null> {
    return SecurityHeader.findOne({
      where: { proxyId },
    });
  }

  async deleteSecurityHeader(proxyId: string): Promise<void> {
    await SecurityHeader.destroy({
      where: { proxyId },
    });
  }

  // Rate Limit Management
  async createOrUpdateRateLimit(data: CreateRateLimitRequest): Promise<RateLimit> {
    // Verify proxy exists
    const proxy = await Proxy.findByPk(data.proxyId);
    if (!proxy) {
      throw new Error('Proxy not found');
    }

    const [rateLimit] = await RateLimit.upsert(data as any);
    return rateLimit;
  }

  async getRateLimitByProxy(proxyId: string): Promise<RateLimit | null> {
    return RateLimit.findOne({
      where: { proxyId },
    });
  }

  async deleteRateLimit(proxyId: string): Promise<void> {
    await RateLimit.destroy({
      where: { proxyId },
    });
  }

  // IP Restriction Management
  async createIpRestriction(data: CreateIpRestrictionRequest): Promise<IpRestriction> {
    // Verify proxy exists
    const proxy = await Proxy.findByPk(data.proxyId);
    if (!proxy) {
      throw new Error('Proxy not found');
    }

    return IpRestriction.create(data as any);
  }

  async getIpRestrictionsByProxy(proxyId: string): Promise<IpRestriction[]> {
    return IpRestriction.findAll({
      where: { proxyId },
      order: [
        ['type', 'ASC'],
        ['ipAddress', 'ASC'],
      ],
    });
  }

  async updateIpRestriction(
    id: string,
    data: Partial<CreateIpRestrictionRequest>,
  ): Promise<IpRestriction> {
    const ipRestriction = await IpRestriction.findByPk(id);
    if (!ipRestriction) {
      throw new Error('IP restriction not found');
    }

    await ipRestriction.update(data);
    return ipRestriction;
  }

  async deleteIpRestriction(id: string): Promise<void> {
    const ipRestriction = await IpRestriction.findByPk(id);
    if (!ipRestriction) {
      throw new Error('IP restriction not found');
    }

    await ipRestriction.destroy();
  }

  // Path Rule Management
  async createPathRule(data: CreatePathRuleRequest): Promise<PathRule> {
    // Verify proxy exists
    const proxy = await Proxy.findByPk(data.proxyId);
    if (!proxy) {
      throw new Error('Proxy not found');
    }

    return PathRule.create(data as any);
  }

  async getPathRulesByProxy(proxyId: string): Promise<PathRule[]> {
    return PathRule.findAll({
      where: { proxyId },
      order: [
        ['priority', 'DESC'],
        ['pathPattern', 'ASC'],
      ],
    });
  }

  async updatePathRule(id: string, data: Partial<CreatePathRuleRequest>): Promise<PathRule> {
    const pathRule = await PathRule.findByPk(id);
    if (!pathRule) {
      throw new Error('Path rule not found');
    }

    await pathRule.update(data);
    return pathRule;
  }

  async deletePathRule(id: string): Promise<void> {
    const pathRule = await PathRule.findByPk(id);
    if (!pathRule) {
      throw new Error('Path rule not found');
    }

    await pathRule.destroy();
  }

  // Basic Auth Management
  async createOrUpdateBasicAuth(data: CreateBasicAuthRequest): Promise<BasicAuth> {
    // Verify proxy exists
    const proxy = await Proxy.findByPk(data.proxyId);
    if (!proxy) {
      throw new Error('Proxy not found');
    }

    let basicAuth = await BasicAuth.findOne({
      where: { proxyId: data.proxyId },
    });

    if (basicAuth) {
      // Update existing
      await basicAuth.update({
        enabled: data.enabled,
        realm: data.realm,
        username: data.username,
        pathPattern: data.pathPattern,
      });

      // Set password if provided
      if (data.password) {
        await basicAuth.setPassword(data.password);
        await basicAuth.save();
      }
    } else {
      // Create new
      basicAuth = await BasicAuth.create({
        proxyId: data.proxyId,
        enabled: data.enabled,
        realm: data.realm,
        username: data.username,
        pathPattern: data.pathPattern,
      });

      // Set password if provided
      if (data.password) {
        await basicAuth.setPassword(data.password);
        await basicAuth.save();
      }
    }

    return basicAuth;
  }

  async getBasicAuthByProxy(proxyId: string): Promise<BasicAuth | null> {
    return BasicAuth.findOne({
      where: { proxyId },
    });
  }

  async deleteBasicAuth(proxyId: string): Promise<void> {
    await BasicAuth.destroy({
      where: { proxyId },
    });
  }

  // Get all middleware for a proxy
  async getAllMiddlewareByProxy(proxyId: string) {
    const [headers, securityHeader, rateLimit, ipRestrictions, pathRules, basicAuth] =
      await Promise.all([
        this.getHeadersByProxy(proxyId),
        this.getSecurityHeaderByProxy(proxyId),
        this.getRateLimitByProxy(proxyId),
        this.getIpRestrictionsByProxy(proxyId),
        this.getPathRulesByProxy(proxyId),
        this.getBasicAuthByProxy(proxyId),
      ]);

    return {
      headers,
      securityHeader,
      rateLimit,
      ipRestrictions,
      pathRules,
      basicAuth: basicAuth?.toSafeJSON(),
    };
  }

  // Validate middleware configuration compatibility
  async validateMiddlewareConfiguration(
    proxyId: string,
  ): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];

    try {
      const middleware = await this.getAllMiddlewareByProxy(proxyId);

      // Check for conflicting path rules
      const pathRules = middleware.pathRules.filter(rule => rule.isActive);
      const pathPatterns = pathRules.map(rule => rule.pathPattern);
      const duplicatePatterns = pathPatterns.filter(
        (pattern, index) => pathPatterns.indexOf(pattern) !== index,
      );

      if (duplicatePatterns.length > 0) {
        errors.push(`Duplicate path patterns found: ${duplicatePatterns.join(', ')}`);
      }

      // Check for conflicting IP restrictions
      const allowRules = middleware.ipRestrictions.filter(
        rule => rule.type === 'allow' && rule.isActive,
      );
      const blockRules = middleware.ipRestrictions.filter(
        rule => rule.type === 'block' && rule.isActive,
      );

      if (allowRules.length > 0 && blockRules.length > 0) {
        // Check for overlapping IP ranges
        for (const allowRule of allowRules) {
          for (const blockRule of blockRules) {
            if (allowRule.ipAddress === blockRule.ipAddress) {
              errors.push(`IP ${allowRule.ipAddress} is both allowed and blocked`);
            }
          }
        }
      }

      // Validate security header combinations
      if (middleware.securityHeader) {
        if (
          middleware.securityHeader.frameOptions === 'ALLOW-FROM' &&
          !middleware.securityHeader.frameOptionsUri
        ) {
          errors.push('Frame options URI is required when using ALLOW-FROM');
        }

        if (middleware.securityHeader.cspEnabled && !middleware.securityHeader.cspPolicy) {
          errors.push('CSP policy is required when CSP is enabled');
        }
      }

      return {
        valid: errors.length === 0,
        errors,
      };
    } catch (error) {
      return {
        valid: false,
        errors: [`Validation error: ${error instanceof Error ? error.message : 'Unknown error'}`],
      };
    }
  }
}

export const headerMiddlewareService = new HeaderMiddlewareService();
