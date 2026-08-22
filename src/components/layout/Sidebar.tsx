import React from 'react';
import { NavLink } from 'react-router-dom';
import { LogOut } from 'lucide-react';
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

  return (
    <>
      {/* Sidebar — hidden on mobile, visible on md+ */}
      <aside className="hidden md:flex fixed left-0 top-0 h-full w-20 lg:w-64 bg-slate-900 border-r border-slate-800 z-50 flex-col">
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

      {/* Bottom nav — mobile only */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-slate-900 border-t border-slate-800 flex items-center">
        {navItems.map(({ path, icon: Icon, shortLabel }) => (
          <NavLink
            key={path}
            to={path}
            end={path === '/'}
            className={({ isActive }) =>
              `flex-1 flex flex-col items-center justify-center py-2 gap-0.5 transition-colors ${
                isActive ? 'text-ice-400' : 'text-slate-500'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <Icon size={18} className={isActive ? 'stroke-[2.5]' : ''} />
                <span className="text-[10px] font-medium">{shortLabel}</span>
              </>
            )}
          </NavLink>
        ))}
        <button
          onClick={onLogout}
          className="flex-1 flex flex-col items-center justify-center py-2 gap-0.5 text-slate-500 transition-colors"
        >
          <LogOut size={18} />
          <span className="text-[10px] font-medium">Sign Out</span>
        </button>
      </nav>
    </>
  );
};
