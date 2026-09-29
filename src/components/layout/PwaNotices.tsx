import React, { useEffect, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { RefreshCw, Share, WifiOff, X } from 'lucide-react';
import {
  dismissIosInstallHint,
  readIosInstallHintContext,
  shouldShowIosInstallHint,
} from '../../lib/pwa';

/**
 * The three things an installed app has to say that a website never did:
 * a new version is ready, the network is gone, and (iOS only) how to install.
 *
 * Rendered once, at the app root. They stack in one fixed column above the
 * mobile bottom nav (`bottom-[4.5rem]`, the nav is ~56px) and drop to the
 * corner on desktop. Never printed.
 */
export const PwaNotices: React.FC = () => {
  const online = useOnline();
  const [showIosHint, setShowIosHint] = useState(false);

  useEffect(() => {
    setShowIosHint(shouldShowIosInstallHint(readIosInstallHintContext()));
  }, []);

  // registerType is 'prompt': a new service worker waits until the member says
  // so. Swapping the app under someone mid-pick would throw away an unsaved
  // sheet, so the reload is theirs to choose.
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      // A phone keeps the app alive in the background for days, so the
      // once-per-navigation update check never fires. Ask again hourly.
      if (registration) setInterval(() => void registration.update(), 60 * 60 * 1000);
    },
  });

  if (online && !needRefresh && !showIosHint) return null;

  return (
    <div className="fixed z-40 left-3 right-3 bottom-[4.5rem] md:left-auto md:right-4 md:bottom-4 md:w-96 flex flex-col gap-2 print:hidden">
      {!online && (
        <div
          role="status"
          className="flex items-center gap-3 rounded-lg border border-yellow-500/40 bg-yellow-900/90 px-4 py-3 text-sm text-yellow-300 shadow-lg"
        >
          <WifiOff size={18} className="shrink-0" />
          <span>You're offline. Standings and picks can't update until you reconnect.</span>
        </div>
      )}

      {needRefresh && (
        <div
          role="status"
          className="flex items-center gap-3 rounded-lg border border-ice-500/40 bg-slate-800 px-4 py-3 text-sm text-slate-200 shadow-lg"
        >
          <RefreshCw size={18} className="shrink-0 text-ice-400" />
          <span className="flex-1">A new version of IcePick is ready.</span>
          <button
            onClick={() => void updateServiceWorker(true)}
            className="rounded-md bg-ice-600 px-3 py-1.5 font-semibold text-onaccent hover:bg-ice-500"
          >
            Reload
          </button>
        </div>
      )}

      {showIosHint && (
        <div
          role="note"
          className="flex items-start gap-3 rounded-lg border border-slate-700 bg-slate-800 px-4 py-3 text-sm text-slate-200 shadow-lg"
        >
          <Share size={18} className="mt-0.5 shrink-0 text-ice-400" />
          <span className="flex-1">
            Install IcePick: tap <strong>Share</strong>, then <strong>Add to Home Screen</strong>.
          </span>
          <button
            aria-label="Dismiss"
            onClick={() => {
              dismissIosInstallHint();
              setShowIosHint(false);
            }}
            className="shrink-0 text-slate-400 hover:text-white"
          >
            <X size={18} />
          </button>
        </div>
      )}
    </div>
  );
};

function useOnline(): boolean {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);
  return online;
}
