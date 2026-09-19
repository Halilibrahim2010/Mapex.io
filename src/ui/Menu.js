import { ensureCostumeData, getCostumes, getCostumeById, getSelectedCostumeId, setSelectedCostumeId, getSelectedCharacterName, setSelectedCharacterName } from '../core/CostumeDefs.js';
import { getSession, onSessionChange } from '../account/index.js';
import { initAccountPanel, renderSessionBar } from './AccountPanel.js';
import { initMultiplayerPanel } from './MultiplayerPanel.js';
import { initLobbyPanel } from './LobbyPanel.js';

export async function initMenu() {
  await ensureCostumeData();
  const costumes = getCostumes();

  const overlay = document.getElementById('menu-overlay');
  const viewMain = document.getElementById('view-main');
  const viewMultiplayer = document.getElementById('view-multiplayer');
  const viewLobby = document.getElementById('view-lobby');
  const viewCostume = document.getElementById('view-costume');

  let isSinglePlayerFlow = false;

  function switchView(targetId) {
    [viewMain, viewMultiplayer, viewLobby, viewCostume].forEach((el) => {
      if (el) el.style.display = el.id === targetId ? 'block' : 'none';
    });
  }

  function updateMainStrip() {
    const id = getSelectedCostumeId() || 1;
    const costume = getCostumeById(id);
    const session = getSession();
    const name = getSelectedCharacterName() || (session && session.displayName) || 'Oyuncu';

    const thumb = document.getElementById('main-current-char-thumb');
    const nameEl = document.getElementById('main-current-name');
    const costumeEl = document.getElementById('main-current-costume');

    if (thumb) thumb.style.backgroundImage = `url('assets/Characters/Char ${id}/${id}.png')`;
    if (nameEl) nameEl.textContent = name;
    if (costumeEl) costumeEl.textContent = `${costume.name} (${costume.category})`;
  }


  function updateCostumePreview() {
    const id = getSelectedCostumeId() || 1;
    const costume = getCostumeById(id);
    const previewEl = document.getElementById('costume-char-preview');
    const nameEl = document.getElementById('costume-char-name');
    const badgeEl = document.getElementById('costume-char-badge');

    if (previewEl) previewEl.style.backgroundImage = `url('assets/Characters/Char ${id}/${id}.png')`;
    if (nameEl) nameEl.textContent = costume.name;
    if (badgeEl) badgeEl.textContent = `${costume.category} (${id} / 18)`;
  }


  function startGame(detail) {
    if (overlay) overlay.style.display = 'none';
    window.dispatchEvent(new CustomEvent('mapex:start', { detail }));
  }


  // 1. TEK OYUNCULU AKIŞI
  const btnSingle = document.getElementById('btn-singleplayer');
  btnSingle?.addEventListener('click', () => {
    const session = getSession();
    const existingName = getSelectedCharacterName() || (session && session.displayName);
    if (existingName) {
      startGame({
        name: existingName,
        char: getSelectedCostumeId() || 1,
        session,
        options: { mode: 'singleplayer', isOffline: true }
      });
    } else {
      isSinglePlayerFlow = true;
      openCostumeSelector(true);
    }
  });

  // 2. ÇOK OYUNCULU AKIŞI
  const btnMulti = document.getElementById('btn-multiplayer');
  btnMulti?.addEventListener('click', () => switchView('view-multiplayer'));

  // 3. LOBBY AKIŞI
  const btnLobby = document.getElementById('btn-lobby');
  btnLobby?.addEventListener('click', () => switchView('view-lobby'));

  // 4. KIYAFET AKIŞI
  const btnCostume = document.getElementById('btn-costume');
  function openCostumeSelector(singlePlayer = false) {
    isSinglePlayerFlow = singlePlayer;
    switchView('view-costume');
    updateCostumePreview();
    const input = document.getElementById('costume-name-input');
    const saveBtn = document.getElementById('btn-costume-save');
    const contBtn = document.getElementById('btn-costume-continue');

    if (input) input.value = getSelectedCharacterName() || (getSession() && getSession().displayName) || '';
    if (saveBtn) saveBtn.style.display = singlePlayer ? 'none' : 'block';
    if (contBtn) contBtn.style.display = singlePlayer ? 'block' : 'none';
  }

  btnCostume?.addEventListener('click', () => openCostumeSelector(false));

  // Kıyafet seçim butonları
  const btnPrev = document.getElementById('btn-costume-prev');
  const btnNext = document.getElementById('btn-costume-next');
  let isNavigating = false;

  function changeCostume(delta) {
    if (isNavigating) return;
    isNavigating = true;
    setTimeout(() => { isNavigating = false; }, 100);

    let id = getSelectedCostumeId() + delta;
    if (id < 1) id = 18;
    if (id > 18) id = 1;
    setSelectedCostumeId(id);
    updateCostumePreview();
    window.dispatchEvent(new CustomEvent('mapex:costumeChanged', { detail: { id, costume: getCostumeById(id) } }));
  }

  btnPrev?.addEventListener('click', () => changeCostume(-1));
  btnNext?.addEventListener('click', () => changeCostume(1));

  const costumeNameInput = document.getElementById('costume-name-input');
  const btnSaveCostume = document.getElementById('btn-costume-save');
  const btnContinueCostume = document.getElementById('btn-costume-continue');

  function commitCostumeSelection() {
    const name = costumeNameInput?.value.trim() || 'Oyuncu';
    setSelectedCharacterName(name);
    const session = getSession();
    if (session) session.displayName = name;
    updateMainStrip();
  }

  btnSaveCostume?.addEventListener('click', () => {
    commitCostumeSelection();
    switchView('view-main');
  });

  btnContinueCostume?.addEventListener('click', () => {
    commitCostumeSelection();
    const session = getSession();
    startGame({
      name: getSelectedCharacterName(),
      char: getSelectedCostumeId() || 1,
      session,
      options: { mode: 'singleplayer', isOffline: true }
    });
  });


  // Geri butonları
  document.getElementById('btn-multiplayer-back')?.addEventListener('click', () => {
    switchView('view-main');
  });
  document.getElementById('btn-lobby-back')?.addEventListener('click', () => {
    switchView('view-main');
  });
  document.getElementById('btn-costume-back')?.addEventListener('click', () => {
    switchView('view-main');
  });

  // Panelleri bağla
  initAccountPanel();
  initMultiplayerPanel((detail) => startGame(detail));
  initLobbyPanel((detail) => startGame(detail));

  // Oturum değişiminde ve kostüm değişiminde UI güncelle
  window.addEventListener('mapex:costumeChanged', (e) => {
    if (e.detail && e.detail.id) {
      setSelectedCostumeId(e.detail.id);
      updateCostumePreview();
      updateMainStrip();
    }
  });

  onSessionChange((session) => {
    renderSessionBar(session);
    updateMainStrip();
  });

  // İlk yüklemede UI güncelle
  renderSessionBar(getSession());
  updateMainStrip();
}