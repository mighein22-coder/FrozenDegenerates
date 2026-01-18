import React from 'react';
import { LayoutDashboard, Calendar, Trophy, LogOut, Grid3X3, Heart } from 'lucide-react';

type ViewState = 'LOGIN' | 'DASHBOARD' | 'PICKS' | 'STANDINGS' | 'RESULTS' | 'TEAM_STATS';

interface SidebarProps {
  currentView: ViewState;
  onNavigate: (view: ViewState) => void;
  onLogout: () => void;
}

/**
 * Sidebar navigation component
 */
export const Sidebar: React.FC<SidebarProps> = ({ currentView, onNavigate, onLogout }) => {
  const navItems = [
    { id: 'DASHBOARD' as ViewState, icon: LayoutDashboard, label: 'Dashboard' },
    { id: 'PICKS' as ViewState, icon: Calendar, label: 'Saturday Picks' },
    { id: 'RESULTS' as ViewState, icon: Grid3X3, label: 'League Matrix' },
    { id: 'TEAM_STATS' as ViewState, icon: Heart, label: 'Team Affinity' },
    { id: 'STANDINGS' as ViewState, icon: Trophy, label: 'Standings' },
  ];

  return (
    <aside className="fixed left-0 top-0 h-full w-20 lg:w-64 bg-slate-900 border-r border-slate-800 z-50 flex flex-col">
      {/* Logo */}
      <div className="p-6 flex items-center gap-3">
        <div className="w-8 h-8 bg-gradient-to-tr from-ice-400 to-ice-600 rounded-lg shadow-lg shadow-ice-500/20 shrink-0"></div>
        <span className="font-display text-2xl font-bold text-white tracking-wide hidden lg:block uppercase">
          ICEPICK
        </span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-6 px-3 space-y-2">
        {navItems.map(({ id, icon: Icon, label }) => {
          const isActive = currentView === id;
          return (
            <button
              key={id}
              onClick={() => onNavigate(id)}
              className={`w-full flex items-center gap-3 px-3 lg:px-4 py-3 rounded-lg transition-all duration-200 group ${
                isActive
                  ? 'bg-ice-500/10 text-ice-400'
                  : 'hover:bg-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              <Icon size={20} className={isActive ? 'stroke-[2.5]' : ''} />
              <span className="font-medium hidden lg:block">{label}</span>
            </button>
          );
        })}
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
  );
};
