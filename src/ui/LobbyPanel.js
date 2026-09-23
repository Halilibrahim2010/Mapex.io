import { getSelectedCostumeId, getSelectedCharacterName } from '../core/CostumeDefs.js';
import { getSession } from '../account/index.js';

const SERVER_URL = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3019';

export function initLobbyPanel(onStartGame) {
  const tabCreate = document.getElementById('tab-lobby-create');
  const tabJoin = document.getElementById('tab-lobby-join');
  const panelCreate = document.getElementById('panel-lobby-create');
  const panelJoin = document.getElementById('panel-lobby-join');

  const maxSlider = document.getElementById('lobby-max-players');
  const maxDisplay = document.getElementById('lobby-max-display');
  const msgEl = document.getElementById('lobby-message');

  if (maxSlider && maxDisplay) {
    maxSlider.addEventListener('input', () => {
      maxDisplay.textContent = maxSlider.value;
    });
  }

  function switchTabLobby(target) {
    msgEl.textContent = '';
    if (target === 'create') {
      tabCreate?.classList.add('active');
      tabJoin?.classList.remove('active');
      if (panelCreate) panelCreate.style.display = 'block';
      if (panelJoin) panelJoin.style.display = 'none';
    } else {
      tabJoin?.classList.add('active');
      tabCreate?.classList.remove('active');
      if (panelJoin) panelJoin.style.display = 'block';
      if (panelCreate) panelCreate.style.display = 'none';
    }
  }

  tabCreate?.addEventListener('click', () => switchTabLobby('create'));
  tabJoin?.addEventListener('click', () => switchTabLobby('join'));


  let createdRoomInfo = null;

  // --- Lobby Oluşturma ---
  const btnCreate = document.getElementById('btn-create-lobby-submit');
  const nameInput = document.getElementById('lobby-name-input');
  const passInput = document.getElementById('lobby-pass-input');
  const ffToggle = document.getElementById('lobby-ff-toggle');
  const createdBox = document.getElementById('box-lobby-created');
  const codeDisplay = document.getElementById('display-created-code');
  const btnCopy = document.getElementById('btn-copy-code');
  const btnEnterCreated = document.getElementById('btn-enter-created-lobby');

  btnCreate?.addEventListener('click', async () => {
    msgEl.textContent = '';
    const name = nameInput?.value.trim() || 'Ozel Lobby';
    const password = passInput?.value || '';
    const maxPlayers = Number(maxSlider?.value || 8);
    const friendlyFire = Boolean(ffToggle?.checked);

    try {
      const res = await fetch(`${SERVER_URL}/lobby/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, password, maxPlayers, friendlyFire })
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.message || 'Lobby oluşturulamadı');

      createdRoomInfo = data;
      if (codeDisplay) codeDisplay.textContent = data.code;
      if (createdBox) createdBox.style.display = 'block';
      if (btnCreate) btnCreate.style.display = 'none';
    } catch (err) {
      msgEl.textContent = err.message;
      msgEl.className = 'account-message error';
    }
  });

  btnCopy?.addEventListener('click', () => {
    if (createdRoomInfo && createdRoomInfo.code) {
      navigator.clipboard.writeText(createdRoomInfo.code).then(() => {
        btnCopy.textContent = '✓ Kopyalandi!';
        setTimeout(() => { btnCopy.textContent = '📓 Kodu Kopyala'; }, 2000);
      });
    }
  });

  btnEnterCreated?.addEventListener('click', () => {
    if (createdRoomInfo && onStartGame) {
      const session = getSession();
      const name = getSelectedCharacterName() || (session && session.displayName) || 'Oyuncu';
      const char = getSelectedCostumeId() || 1;
      onStartGame({
        name,
        char,
        session,
        options: {
          mode: 'lobby',
          roomId: createdRoomInfo.code,
          friendlyFire: createdRoomInfo.friendlyFire
        }
      });
    }
  });

  // --- Kod ile Katılma ---
  const joinCodeInput = document.getElementById('lobby-join-code-input');
  const joinPassInput = document.getElementById('lobby-join-pass-input');
  const btnJoin = document.getElementById('btn-join-lobby-submit');

  if (joinCodeInput) {
    joinCodeInput.addEventListener('input', () => {
      joinCodeInput.value = joinCodeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    });
  }


  btnJoin?.addEventListener('click', async () => {
    if (msgEl) {
      msgEl.textContent = '';
      msgEl.className = 'account-message';
    }
    const code = joinCodeInput?.value.trim().toUpperCase();
    const password = joinPassInput?.value || '';

    if (!code || code.length !== 7) {
      if (msgEl) {
        msgEl.textContent = 'Lütfen 7 haneli geçerli bir davet kodu girin.';
        msgEl.className = 'account-message error';
      }
      return;
    }

    try {
      const res = await fetch(`${SERVER_URL}/lobby/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, password })
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.message || "Lobby'ye katılınamadı");

      if (onStartGame) {
        const session = getSession();
        const name = getSelectedCharacterName() || (session && session.displayName) || 'Oyuncu';
        const char = getSelectedCostumeId() || 1;
        onStartGame({
          name,
          char,
          session,
          options: {
            mode: 'lobby',
            roomId: data.room.id,
            friendlyFire: data.room.friendlyFire
          }
        });
      }
    } catch (err) {
      if (msgEl) {
        msgEl.textContent = err.message;
        msgEl.className = 'account-message error';
      }
    }
  });
}