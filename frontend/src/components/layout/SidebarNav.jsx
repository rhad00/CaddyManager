import React, { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import Icon from './icons';
import { trailFor } from '../../navigation';

/**
 * The sidebar tree, drawn as a route: a line runs down each submenu and the current page is a
 * node on it. Submenus nest to any depth; each opens and closes with its own button.
 */
const SidebarNav = ({ nodes, onNavigate }) => {
  const { pathname } = useLocation();
  const [expanded, setExpanded] = useState(() => new Set(trailFor(pathname).map((n) => n.id)));

  // Going to a page opens the submenus on the way to it (and leaves the others as they are)
  useEffect(() => {
    const trail = trailFor(pathname).map((n) => n.id);
    setExpanded((current) => (trail.every((id) => current.has(id)) ? current : new Set([...current, ...trail])));
  }, [pathname]);

  const toggle = (id) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <ul className="space-y-1">
      {nodes.map((node) => (
        <NavNode key={node.id} node={node} depth={0} expanded={expanded} onToggle={toggle} onNavigate={onNavigate} />
      ))}
    </ul>
  );
};

const NavNode = ({ node, depth, expanded, onToggle, onNavigate }) => {
  const { pathname } = useLocation();
  const inTrail = trailFor(pathname).some((n) => n.id === node.id);

  if (!node.children) {
    return (
      <li className="relative">
        <NavLink
          to={node.path}
          onClick={onNavigate}
          className={({ isActive }) =>
            `group flex items-center rounded-md py-1.5 pr-3 text-sm transition-colors ${
              depth === 0 ? 'pl-3' : 'pl-4'
            } ${isActive ? 'bg-white/10 font-medium text-white' : 'text-slate-300 hover:bg-white/5 hover:text-white'}`
          }
        >
          {({ isActive }) => (
            <>
              {/* the node on the route line */}
              <span
                aria-hidden="true"
                className={`absolute top-1/2 left-0 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full transition-colors ${
                  isActive ? 'bg-trace ring-4 ring-trace/20' : 'bg-slate-600 group-hover:bg-slate-400'
                }`}
              />
              {node.label}
            </>
          )}
        </NavLink>
      </li>
    );
  }

  const isOpen = expanded.has(node.id);
  const panelId = `submenu-${node.id}`;

  return (
    <li>
      <button
        type="button"
        onClick={() => onToggle(node.id)}
        aria-expanded={isOpen}
        aria-controls={panelId}
        className={`flex w-full items-center gap-3 rounded-md py-2 pr-3 text-left text-sm transition-colors hover:bg-white/5 hover:text-white ${
          depth === 0 ? 'pl-3' : 'pl-4'
        } ${inTrail ? 'text-white' : 'text-slate-300'}`}
      >
        {node.icon && <Icon name={node.icon} className="h-[18px] w-[18px] shrink-0 text-slate-400" />}
        <span className="flex-1 font-medium">{node.label}</span>
        <Icon
          name="chevron"
          className={`h-4 w-4 shrink-0 text-slate-500 transition-transform motion-reduce:transition-none ${isOpen ? 'rotate-90' : ''}`}
        />
      </button>
      <ul
        id={panelId}
        hidden={!isOpen}
        className={`mt-1 space-y-0.5 border-l border-trace/25 ${depth === 0 ? 'ml-[1.35rem]' : 'ml-4'}`}
      >
        {node.children.map((child) => (
          <NavNode
            key={child.id}
            node={child}
            depth={depth + 1}
            expanded={expanded}
            onToggle={onToggle}
            onNavigate={onNavigate}
          />
        ))}
      </ul>
    </li>
  );
};

export default SidebarNav;
