import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { get } from '../../utils/api';
import { APP_TITLE, APP_VERSION, versionLabel } from '../../utils/version';
import { HOME_PATH, trailFor, visibleNav } from '../../navigation';
import Icon, { BrandMark } from './icons';
import SidebarNav from './SidebarNav';
import Footer from '../Footer';

const DESKTOP_QUERY = '(min-width: 1024px)';
const PREF_KEY = 'caddymanager.sidebarOpen';

const readPreference = () => {
  try {
    return window.localStorage.getItem(PREF_KEY) !== 'false';
  } catch {
    return true; // storage blocked: open
  }
};

const savePreference = (open) => {
  try {
    window.localStorage.setItem(PREF_KEY, String(open));
  } catch {
    // the preference is a convenience; the menu works without it
  }
};

/** Whether the screen is wide enough to keep the menu beside the page instead of over it */
function useIsDesktop() {
  const query = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(DESKTOP_QUERY) : null;
  const [isDesktop, setIsDesktop] = useState(query ? query.matches : true);

  useEffect(() => {
    if (!query) return undefined;
    const onChange = (event) => setIsDesktop(event.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, [query]);

  return isDesktop;
}

/** The version of the backend, when it differs from this page's: the two ship as separate images */
function useBackendVersion(token) {
  const [version, setVersion] = useState(null);

  useEffect(() => {
    let cancelled = false;
    get('/system/info', token)
      .then((response) => (response.ok ? response.json() : null))
      .then((body) => {
        if (!cancelled && body?.info?.version) setVersion(versionLabel(body.info.version));
      })
      .catch(() => {}); // the version note is optional; a failure here is not worth interrupting anyone
    return () => {
      cancelled = true;
    };
  }, [token]);

  return version;
}

/**
 * The frame around every signed-in page: a left menu behind a hamburger button, the breadcrumb of
 * where you are, and the account controls. On wide screens the menu sits beside the page and the
 * button folds it away; on narrow screens it opens over the page.
 */
const AppShell = () => {
  const { currentUser, logout, token } = useAuth();
  const { pathname } = useLocation();
  const isDesktop = useIsDesktop();
  const [desktopOpen, setDesktopOpen] = useState(readPreference);
  const [mobileOpen, setMobileOpen] = useState(false);
  const hamburgerRef = useRef(null);
  const sidebarRef = useRef(null);
  const backendVersion = useBackendVersion(token);

  const open = isDesktop ? desktopOpen : mobileOpen;
  const nodes = useMemo(() => visibleNav(currentUser?.role), [currentUser?.role]);
  const trail = trailFor(pathname);

  const toggle = () => {
    if (isDesktop) {
      setDesktopOpen((current) => {
        savePreference(!current);
        return !current;
      });
    } else {
      setMobileOpen((current) => !current);
    }
  };

  const closeOverlay = useCallback(() => {
    setMobileOpen(false);
    hamburgerRef.current?.focus();
  }, []);

  // Going to a page closes the menu that opened over it
  const onNavigate = useCallback(() => setMobileOpen(false), []);

  useEffect(() => {
    if (!isDesktop && mobileOpen) {
      sidebarRef.current?.querySelector('a, button')?.focus();
      const onKey = (event) => {
        if (event.key === 'Escape') closeOverlay();
      };
      document.addEventListener('keydown', onKey);
      return () => document.removeEventListener('keydown', onKey);
    }
    return undefined;
  }, [isDesktop, mobileOpen, closeOverlay]);

  const pageTitle = trail.length > 0 ? trail[trail.length - 1].label : 'CaddyManager';
  useEffect(() => {
    document.title = `${pageTitle} · CaddyManager ${APP_VERSION}`;
    return () => {
      document.title = APP_TITLE;
    };
  }, [pageTitle]);

  const mismatch = backendVersion && backendVersion !== APP_VERSION;

  return (
    <div className="min-h-screen">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-indigo-600 focus:px-4 focus:py-2 focus:text-white"
      >
        Skip to content
      </a>

      {!isDesktop && mobileOpen && (
        <div className="fixed inset-0 z-30 bg-ink/50" aria-hidden="true" onClick={closeOverlay} />
      )}

      <aside
        id="app-sidebar"
        ref={sidebarRef}
        aria-label="Main"
        inert={!open}
        className={`fixed inset-y-0 left-0 z-40 flex w-72 flex-col bg-ink text-slate-200 transition-[transform,visibility] duration-200 motion-reduce:transition-none ${
          open ? 'translate-x-0' : 'invisible -translate-x-full'
        }`}
      >
        <div className="flex h-14 shrink-0 items-center gap-3 border-b border-white/10 px-4">
          <BrandMark />
          <Link to={HOME_PATH} onClick={onNavigate} className="text-base font-semibold tracking-tight text-white">
            CaddyManager
          </Link>
          <span className="ml-auto rounded bg-white/10 px-1.5 py-0.5 font-mono text-xs text-trace" title="Version of this page">
            {APP_VERSION}
          </span>
          {/* Over the page the menu covers the hamburger, so it carries its own close button */}
          <button
            type="button"
            onClick={closeOverlay}
            aria-label="Close menu"
            className="-mr-1 rounded-md p-1.5 text-slate-400 hover:bg-white/10 hover:text-white lg:hidden"
          >
            <Icon name="close" className="h-5 w-5" />
          </button>
        </div>

        <nav aria-label="Main navigation" className="flex-1 overflow-y-auto px-3 py-4">
          <SidebarNav nodes={nodes} onNavigate={onNavigate} />
        </nav>

        {mismatch && (
          <p className="border-t border-white/10 px-4 py-3 text-xs text-amber-300">
            The backend runs <span className="font-mono">{backendVersion}</span>, this page{' '}
            <span className="font-mono">{APP_VERSION}</span>. Pull the same tag for both images.
          </p>
        )}
      </aside>

      <div className={`transition-[padding] duration-200 motion-reduce:transition-none ${isDesktop && open ? 'lg:pl-72' : ''}`}>
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-gray-200 bg-white px-3 sm:px-5">
          <button
            ref={hamburgerRef}
            type="button"
            onClick={toggle}
            aria-label={open ? 'Close navigation' : 'Open navigation'}
            aria-expanded={open}
            aria-controls="app-sidebar"
            className="-ml-1 rounded-md p-2 text-gray-600 hover:bg-gray-100 hover:text-gray-900"
          >
            <Icon name={open ? 'close' : 'menu'} />
          </button>

          <nav aria-label="Breadcrumb" className="min-w-0 flex-1">
            <ol className="flex items-center gap-1.5 truncate text-sm text-gray-500">
              {trail.length === 0 && <li className="font-medium text-gray-900">CaddyManager</li>}
              {trail.map((node, index) => (
                <li key={node.id} className="flex items-center gap-1.5">
                  {index > 0 && <Icon name="chevron" className="h-3.5 w-3.5 text-gray-300" />}
                  <span
                    className={index === trail.length - 1 ? 'font-medium text-gray-900' : ''}
                    aria-current={index === trail.length - 1 ? 'page' : undefined}
                  >
                    {node.label}
                  </span>
                </li>
              ))}
            </ol>
          </nav>

          <span className="hidden text-sm text-gray-600 sm:block">{currentUser?.email}</span>
          <button
            type="button"
            onClick={() => logout()}
            className="rounded-md px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100"
          >
            Sign out
          </button>
        </header>

        <main id="main-content" tabIndex={-1} className="py-6 focus:outline-none">
          <Outlet />
        </main>

        <Footer />
      </div>
    </div>
  );
};

export default AppShell;
