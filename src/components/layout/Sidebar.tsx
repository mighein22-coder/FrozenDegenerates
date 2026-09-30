import React, { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { Ellipsis, LogOut } from 'lucide-react';
import { NAV_ROUTES } from '../../routes';

interface SidebarProps {
  onLogout: () => void;
  isAdmin?: boolean;
}

/**
 * Sidebar navigation component
 *
 * Active state comes from the URL via NavLink rather than a `currentView` prop,
 * so navigation, the browser's back button and a pasted link all agree.
 */
export const Sidebar: React.FC<SidebarProps> = ({ onLogout, isAdmin = false }) => {
  const navItems = NAV_ROUTES.filter(route => !route.adminOnly || isAdmin);
  const primaryItems = navItems.filter(route => route.primaryMobile);
  const moreItems = navItems.filter(route => !route.primaryMobile);

  // The phone "More" menu closes on any navigation and on Escape, so it never
  // sits open over the page it just took you to.
  const [moreOpen, setMoreOpen] = useState(false);
  const { pathname } = useLocation();
  useEffect(() => setMoreOpen(false), [pathname]);
  useEffect(() => {
    if (!moreOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMoreOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [moreOpen]);
  // "More" lights up when you are on a page that lives inside it.
  const moreActive = moreItems.some(route => pathname === route.path || pathname.startsWith(route.path + '/'));

  return (
    <>
      {/* Sidebar — hidden on mobile, visible on md+. `print:!hidden` needs the
          important marker: a landscape page is wider than md, so `md:flex` is
          live at print time too. */}
      <aside className="hidden md:flex fixed left-0 top-0 h-full w-20 lg:w-64 bg-slate-900 border-r border-slate-800 z-50 flex-col print:!hidden">
        {/* Logo */}
        <div className="p-6 flex items-center gap-3">
          <div className="w-8 h-8 bg-gradient-to-tr from-ice-400 to-ice-600 rounded-lg shadow-lg shadow-ice-500/20 shrink-0"></div>
          <span className="font-display text-2xl font-bold text-white tracking-wide hidden lg:block uppercase">
            ICEPICK
          </span>
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-6 px-3 space-y-2">
          {navItems.map(({ path, icon: Icon, label }) => (
            <NavLink
              key={path}
              to={path}
              end={path === '/'}
              className={({ isActive }) =>
                `w-full flex items-center gap-3 px-3 lg:px-4 py-3 rounded-lg transition-all duration-200 group ${
                  isActive
                    ? 'bg-ice-500/10 text-ice-400'
                    : 'hover:bg-slate-800 text-slate-400 hover:text-white'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <Icon size={20} className={isActive ? 'stroke-[2.5]' : ''} />
                  <span className="font-medium hidden lg:block">{label}</span>
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Logout */}
        <div className="p-4 border-t border-slate-800">
          <button
            onClick={onLogout}
            className="w-full flex items-center gap-3 px-4 py-2 text-slate-500 hover:text-white transition-colors text-sm"
          >
            <LogOut size={16} />
            <span className="hidden lg:block">Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Bottom nav — mobile only. Four tabs and a "More" button: nine tabs do
          not fit in 375px, and labels ran into each other. The safe-area
          padding keeps it clear of the iPhone home bar (and the notch, in
          landscape) now that the page runs edge to edge. */}
      {moreOpen && (
        <div className="md:hidden fixed inset-0 z-50 print:!hidden" onClick={() => setMoreOpen(false)}>
          <div className="absolute inset-0 bg-black/60" />
          <div
            id="more-menu"
            role="menu"
            onClick={e => e.stopPropagation()}
            className="absolute left-3 right-3 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] rounded-xl border border-slate-700 bg-slate-900 p-2 shadow-2xl"
          >
            {moreItems.map(({ path, icon: Icon, label }) => (
              <NavLink
                key={path}
                to={path}
                role="menuitem"
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-lg px-4 min-h-12 text-base font-medium ${
                    isActive ? 'bg-ice-500/10 text-ice-400' : 'text-slate-200 active:bg-slate-800'
                  }`
                }
              >
                <Icon size={20} />
                {label}
              </NavLink>
            ))}
            <div className="my-1 border-t border-slate-800" />
            <button
              role="menuitem"
              onClick={onLogout}
              className="flex w-full items-center gap-3 rounded-lg px-4 min-h-12 text-base font-medium text-slate-400 active:bg-slate-800"
            >
              <LogOut size={20} />
              Sign Out
            </button>
          </div>
        </div>
      )}

      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-slate-900 border-t border-slate-800 flex items-stretch pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] print:!hidden">
        {primaryItems.map(({ path, icon: Icon, shortLabel }) => (
          <NavLink
            key={path}
            to={path}
            end={path === '/'}
            className={({ isActive }) =>
              `flex-1 min-h-14 flex flex-col items-center justify-center gap-0.5 transition-colors ${
                isActive ? 'text-ice-400' : 'text-slate-500'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <Icon size={20} className={isActive ? 'stroke-[2.5]' : ''} />
                <span className="text-[10px] font-medium">{shortLabel}</span>
              </>
            )}
          </NavLink>
        ))}
        <button
          onClick={() => setMoreOpen(open => !open)}
          aria-expanded={moreOpen}
          aria-controls="more-menu"
          className={`flex-1 min-h-14 flex flex-col items-center justify-center gap-0.5 transition-colors ${
            moreOpen || moreActive ? 'text-ice-400' : 'text-slate-500'
          }`}
        >
          <Ellipsis size={20} className={moreActive ? 'stroke-[2.5]' : ''} />
          <span className="text-[10px] font-medium">More</span>
        </button>
      </nav>
    </>
  );
};
