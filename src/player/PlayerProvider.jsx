import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { Preferences } from '@capacitor/preferences';
import { Capacitor } from '@capacitor/core';
import { PlayerContext } from './PlayerContext.js';
import { getCloudConfig } from './config.js';
import { createCloudController } from './cloudController.js';
import { createGameStorage } from '../utils/gameStorage.js';
import { createPuzzleLoader } from '../utils/puzzleEditions.js';
import { fetchPuzzleData } from '../utils/puzzleData.js';
import { analytics } from '../analytics.js';

const controller = createCloudController({ backing: Preferences,
  config: getCloudConfig(import.meta.env, Capacitor.isNativePlatform()),
  backendFactory: async config => {
    const { createPhpBackend } = await import('./phpBackend.js');
    return createPhpBackend(config, { onSignIn: analytics.accountAuth });
  } });

export default function PlayerProvider({ children }) {
  const state = useSyncExternalStore(controller.subscribe, controller.getState);
  // Keep the current game on screen until its replacement is fully restored.
  const [screen, setScreen] = useState({ scope: state.scope, epoch: state.epoch });
  if (state.phase === 'ready' && (screen.scope !== state.scope || screen.epoch !== state.epoch)) {
    setScreen({ scope: state.scope, epoch: state.epoch });
  }
  const value = useMemo(() => ({ controller,
    game: createGameStorage(screen.scope),
    loadPuzzleForPlayer: createPuzzleLoader({ store: screen.scope, fetchData: fetchPuzzleData })
  }), [screen.scope]);
  useEffect(() => {
    void controller.start();
    const sync = () => { if (!document.hidden) void controller.sync(); };
    window.addEventListener('focus', sync);
    window.addEventListener('pageshow', sync);
    window.addEventListener('online', sync);
    document.addEventListener('visibilitychange', sync);
    const interval = setInterval(sync, 60000);
    return () => {
      window.removeEventListener('focus', sync);
      window.removeEventListener('pageshow', sync);
      window.removeEventListener('online', sync);
      document.removeEventListener('visibilitychange', sync);
      clearInterval(interval);
    };
  }, []);
  if (state.phase === 'error') return <main className="account-loading">
    <p role="alert">{state.message}</p>
    <button type="button" onClick={() => { void controller.useGuest(); }}>Continue without signing in</button>
  </main>;
  return <div className="player-surface" inert={state.phase === 'loading'} aria-busy={state.phase === 'loading'}>
    <PlayerContext.Provider key={screen.epoch} value={value}>{children}</PlayerContext.Provider>
  </div>;
}
