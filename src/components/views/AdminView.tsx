import React, { useState } from 'react';
import { supabaseService } from '../../lib/supabaseService';
import { supabase } from '../../lib/supabase';
import type { Week } from '../../types';

interface AdminViewProps {
  allWeeks: Week[];
  leagueUsers: Array<{ id: string; name: string; email: string; avatar?: string; role: string }>;
}

type Status = 'IDLE' | 'LOADING' | 'SUCCESS' | 'ERROR';

/**
 * Admin panel for league management
 * - Sync scores for a specific week
 * - Toggle week status (OPEN / LOCKED / COMPLETED)
 * - View league users
 */
export const AdminView: React.FC<AdminViewProps> = ({ allWeeks, leagueUsers }) => {
  const [selectedWeekId, setSelectedWeekId] = useState(allWeeks[0]?.id || '');
  const [syncStatus, setSyncStatus] = useState<Status>('IDLE');
  const [syncMessage, setSyncMessage] = useState('');
  const [weekStatusUpdating, setWeekStatusUpdating] = useState<string | null>(null);

  const handleSyncWeek = async () => {
    if (!selectedWeekId) {
      setSyncMessage('Please select a week');
      return;
    }

    setSyncStatus('LOADING');
    setSyncMessage('Syncing scores...');

    try {
      const result = await supabaseService.syncScores(selectedWeekId);
      if (result.errors.length > 0) {
        setSyncStatus('ERROR');
        setSyncMessage(`Sync completed with errors: ${result.errors.join(', ')}`);
      } else {
        setSyncStatus('SUCCESS');
        setSyncMessage(`✓ Synced ${result.updated} games`);
        setTimeout(() => setSyncStatus('IDLE'), 3000);
      }
    } catch (error: any) {
      setSyncStatus('ERROR');
      setSyncMessage(`Sync failed: ${error.message}`);
    }
  };

  const handleToggleWeekStatus = async (weekId: string, currentStatus: string) => {
    const nextStatus = currentStatus === 'OPEN' ? 'LOCKED' : currentStatus === 'LOCKED' ? 'COMPLETED' : 'OPEN';
    setWeekStatusUpdating(weekId);

    try {
      const { error } = await supabase
        .from('weeks')
        .update({ status: nextStatus })
        .eq('id', weekId);

      if (error) throw error;

      // Trigger a refetch in parent (user will need to navigate away and back)
      setSyncMessage(`✓ Week ${weekId} status changed to ${nextStatus}`);
      setTimeout(() => setSyncMessage(''), 2000);
    } catch (error: any) {
      setSyncMessage(`Failed to update week: ${error.message}`);
    } finally {
      setWeekStatusUpdating(null);
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-white mb-2">Admin Panel</h1>
        <p className="text-slate-400">Manage the league schedule, scores, and users</p>
      </div>

      {/* Score Sync Section */}
      <div className="bg-slate-900/50 border border-slate-700 rounded-lg p-6">
        <h2 className="text-xl font-semibold text-white mb-4">Sync Scores from NHL</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-400 mb-2">Select Week</label>
            <select
              value={selectedWeekId}
              onChange={(e) => setSelectedWeekId(e.target.value)}
              className="w-full bg-slate-950/50 border border-slate-700 rounded-lg px-3 py-2 text-white focus:ring-2 focus:ring-ice-500 outline-none"
            >
              {allWeeks.map((week) => (
                <option key={week.id} value={week.id}>
                  {week.id} ({week.status})
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={handleSyncWeek}
            disabled={syncStatus === 'LOADING'}
            className="w-full px-4 py-2 bg-ice-600 hover:bg-ice-700 disabled:bg-slate-700 text-white rounded-lg font-medium transition-colors"
          >
            {syncStatus === 'LOADING' ? 'Syncing...' : 'Sync Scores'}
          </button>

          {syncMessage && (
            <p
              className={`text-sm p-3 rounded ${
                syncStatus === 'SUCCESS'
                  ? 'bg-green-900/30 text-green-300 border border-green-500/50'
                  : syncStatus === 'ERROR'
                    ? 'bg-red-900/30 text-red-300 border border-red-500/50'
                    : 'bg-blue-900/30 text-blue-300 border border-blue-500/50'
              }`}
            >
              {syncMessage}
            </p>
          )}
        </div>
      </div>

      {/* Week Management Section */}
      <div className="bg-slate-900/50 border border-slate-700 rounded-lg p-6">
        <h2 className="text-xl font-semibold text-white mb-4">Week Status Management</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700">
                <th className="text-left px-4 py-2 text-slate-400 font-medium">Week</th>
                <th className="text-left px-4 py-2 text-slate-400 font-medium">Date</th>
                <th className="text-left px-4 py-2 text-slate-400 font-medium">Current Status</th>
                <th className="text-right px-4 py-2 text-slate-400 font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {allWeeks.map((week) => {
                const nextStatus =
                  week.status === 'OPEN' ? 'LOCKED' : week.status === 'LOCKED' ? 'COMPLETED' : 'OPEN';
                return (
                  <tr key={week.id} className="border-b border-slate-800 hover:bg-slate-800/30">
                    <td className="px-4 py-3 text-white font-mono text-xs">{week.id}</td>
                    <td className="px-4 py-3 text-slate-300">{week.startDate}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block px-2 py-1 rounded text-xs font-medium ${
                          week.status === 'OPEN'
                            ? 'bg-green-900/30 text-green-300'
                            : week.status === 'LOCKED'
                              ? 'bg-yellow-900/30 text-yellow-300'
                              : 'bg-slate-700/50 text-slate-300'
                        }`}
                      >
                        {week.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => handleToggleWeekStatus(week.id, week.status)}
                        disabled={weekStatusUpdating === week.id}
                        className="px-3 py-1 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white text-xs rounded transition-colors"
                      >
                        {weekStatusUpdating === week.id ? 'Updating...' : `→ ${nextStatus}`}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Users Section */}
      <div className="bg-slate-900/50 border border-slate-700 rounded-lg p-6">
        <h2 className="text-xl font-semibold text-white mb-4">League Users ({leagueUsers.length})</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {leagueUsers.map((user) => (
            <div key={user.id} className="bg-slate-950/50 border border-slate-700 rounded p-3">
              <div className="flex items-start space-x-3">
                {user.avatar && (
                  <img
                    src={user.avatar}
                    alt={user.name}
                    className="w-8 h-8 rounded-full bg-slate-700"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                    }}
                  />
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-white truncate">{user.name}</p>
                  <p className="text-xs text-slate-500 truncate">{user.email}</p>
                  <p className="text-xs mt-1">
                    <span
                      className={`inline-block px-1.5 py-0.5 rounded ${
                        user.role === 'admin'
                          ? 'bg-purple-900/30 text-purple-300'
                          : 'bg-slate-700/50 text-slate-300'
                      }`}
                    >
                      {user.role}
                    </span>
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
