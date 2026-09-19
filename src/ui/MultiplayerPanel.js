import { getSelectedCostumeId, getSelectedCharacterName } from '../core/CostumeDefs.js';
import { getSession } from '../account/index.js';

export function initMultiplayerPanel(onStartGame) {
  const buttons = document.querySelectorAll('.server-join-btn');
  buttons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const roomId = btn.getAttribute('data-room') || 'public_ff_off';
      const ffOn = roomId === 'public_ff_on';
      const session = getSession();
      const name = getSelectedCharacterName() || (session && session.displayName) || 'Oyuncu';
      const char = getSelectedCostumeId() || 1;

      if (onStartGame) {
        onStartGame({ name, char, session, options: { mode: 'multiplayer', roomId, friendlyFire: ffOn } });
      }
    });
  });
}
