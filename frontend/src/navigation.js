/**
 * The navigation tree: what the sidebar shows, what the breadcrumb says, and which paths exist.
 * A node with `children` is a submenu; a node with `path` is a page. Pages live in routes.jsx.
 */
export const NAV = [
  {
    id: 'routing',
    label: 'Routing',
    icon: 'route',
    children: [
      { id: 'proxies', label: 'Proxies', path: '/proxies' },
      { id: 'templates', label: 'Templates', path: '/templates' },
      { id: 'discovery', label: 'Docker discovery', path: '/discovery' },
    ],
  },
  {
    id: 'monitoring',
    label: 'Monitoring',
    icon: 'pulse',
    children: [
      { id: 'metrics', label: 'Metrics', path: '/metrics' },
      { id: 'logs', label: 'Access logs', path: '/logs' },
      { id: 'alerts', label: 'Alerts', path: '/alerts' },
      { id: 'audit', label: 'Audit log', path: '/audit' },
    ],
  },
  {
    id: 'operations',
    label: 'Operations',
    icon: 'server',
    children: [
      { id: 'backups', label: 'Backup and restore', path: '/backups' },
      { id: 'git', label: 'Git and GitOps', path: '/git' },
    ],
  },
  {
    id: 'settings',
    label: 'Settings',
    icon: 'gear',
    children: [
      {
        id: 'account',
        label: 'My account',
        children: [
          { id: 'two-factor', label: 'Two-factor authentication', path: '/settings/account/two-factor' },
          { id: 'api-keys', label: 'API keys', path: '/settings/account/api-keys' },
        ],
      },
      { id: 'users', label: 'Users', path: '/settings/users', adminOnly: true },
    ],
  },
];

export const HOME_PATH = '/proxies';

/** The tree as the person with this role sees it: admin-only pages and the submenus left empty are dropped */
export function visibleNav(role, nodes = NAV) {
  return nodes
    .filter((node) => !node.adminOnly || role === 'admin')
    .map((node) => (node.children ? { ...node, children: visibleNav(role, node.children) } : node))
    .filter((node) => !node.children || node.children.length > 0);
}

/** Every page of the tree, in menu order */
export function pagesOf(nodes = NAV) {
  return nodes.flatMap((node) => (node.children ? pagesOf(node.children) : [node]));
}

/**
 * The nodes from the top of the tree down to the page at `pathname` (empty when no page matches).
 * A path inside a page ("/proxies/123") belongs to that page.
 */
export function trailFor(pathname, nodes = NAV) {
  for (const node of nodes) {
    if (node.children) {
      const inner = trailFor(pathname, node.children);
      if (inner.length > 0) return [node, ...inner];
    } else if (pathname === node.path || pathname.startsWith(`${node.path}/`)) {
      return [node];
    }
  }
  return [];
}
