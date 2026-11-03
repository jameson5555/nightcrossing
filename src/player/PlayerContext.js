import { createContext, useContext } from 'react';

export const PlayerContext = createContext(null);
export function usePlayer() {
  const player = useContext(PlayerContext);
  if (!player) throw new Error('PlayerProvider is required.');
  return player;
}
