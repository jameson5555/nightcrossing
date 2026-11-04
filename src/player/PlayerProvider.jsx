import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { Preferences } from '@capacitor/preferences';
import { Capacitor } from '@capacitor/core';
import { PlayerContext } from './PlayerContext.js';
import { getCloudConfig } from './config.js';
import { createCloudController } from './cloudController.js';
import { createGameStorage } from '../utils/gameStorage.js';
import { createPuzzleLoader } from '../utils/puzzleEditions.js';
import { fetchPuzzleData } from '../utils/puzzleData.js';

const controller = createCloudController({ backing: Preferences,
  config: getCloudConfig(import.meta.env, Capacitor.isNativePlatform()),
  backendFactory: async config => {
    const { createPhpBackend } = await import('./phpBackend.js');
    return createPhpBackend(config);
  } });

export default function PlayerProvider({ children }) {
  const state = useSyncExternalStore(controller.subscribe, controller.getState);
  const value = useMemo(() => ({ controller,
    game: createGameStorage(state.scope),
    loadPuzzleForPlayer: createPuzzleLoader({ store: state.scope, fetchData: fetchPuzzleData })
  }), [state.scope]);
  useEffect(() => {
    void controller.start();
    const sync = () => { if (!document.hidden) void controller.sync(); };
    window.addEventListener('focus', sync);
    window.addEventListener('online', sync);
    document.addEventListener('visibilitychange', sync);
    const interval = setInterval(sync, 60000);
    return () => {
      window.removeEventListener('focus', sync);
      window.removeEventListener('online', sync);
      document.removeEventListener('visibilitychange', sync);
      clearInterval(interval);
    };
  }, []);
  if (state.phase === 'loading') return <main className="account-loading" role="status">Opening your saved progress…</main>;
  if (state.phase === 'error') return <main className="account-loading">
    <p role="alert">{state.message}</p>
    <button type="button" onClick={() => { void controller.useGuest(); }}>Continue without signing in</button>
  </main>;
  return <PlayerContext.Provider key={state.epoch} value={value}>{children}</PlayerContext.Provider>;
}
