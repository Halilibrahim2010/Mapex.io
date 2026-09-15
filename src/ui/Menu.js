// Karakter ızgarası ve isim girişi. Karakter listesi shared/objectDefs.json'dan
// gelir; yeni karakter eklemek için bu dosyaya dokunmak gerekmez.
const DEFAULT_CHARACTERS = { count: 18, files: ['Character 1.png', 'Character 5.png', 'Character 9.png'], names: ['Savaşçı'] };

async function fetchCharacters() {
  try {
    const response = await fetch('shared/objectDefs.json');
    const data = await response.json();
    return data.characters || DEFAULT_CHARACTERS;
  } catch (error) {
    return DEFAULT_CHARACTERS;
  }
}

export async function initMenu() {
  const characters = await fetchCharacters();
  const sheetUrl = (i) => `assets/Characters/Char ${i}/${characters.files[(i - 1) % characters.files.length]}`;
  const nameOf = (i) => (characters.names && characters.names[(i - 1) % characters.names.length]) || 'Karakter';

  let selectedChar = 1;
  const grid = document.getElementById('char-grid');
  const big = document.getElementById('char-big');
  const charName = document.getElementById('char-name');

  if (!grid || !big || !charName) return;

  // Izgarayı doldur
  for (let i = 1; i <= characters.count; i++) {
    const thumb = document.createElement('div');
    thumb.className = `char-thumb${i === 1 ? ' selected' : ''}`;
    thumb.style.backgroundImage = `url('${sheetUrl(i)}')`;
    thumb.title = `${nameOf(i)} ${i}`;
    thumb.addEventListener('click', () => selectChar(i, thumb));
    grid.appendChild(thumb);
  }

  function selectChar(i, el) {
    selectedChar = i;
    big.style.backgroundImage = `url('${sheetUrl(i)}')`;
    charName.textContent = `${nameOf(i)} ${i}`;

    document.querySelectorAll('.char-thumb').forEach((t) => t.classList.remove('selected'));
    el.classList.add('selected');
  }

  big.style.backgroundImage = `url('${sheetUrl(1)}')`;
  charName.textContent = `${nameOf(1)} 1`;

  // Oyun Başlatma Mantığı
  const overlay = document.getElementById('menu-overlay');
  const input = document.getElementById('name-input');
  const submitBtn = document.getElementById('name-submit');

  function startGame() {
    const name = input.value.trim() || 'Oyuncu';
    overlay.style.display = 'none';
    window.dispatchEvent(new CustomEvent('mapex:start', { detail: { name, char: selectedChar } }));
  }

  submitBtn?.addEventListener('click', startGame);
  input?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') startGame();
  });
  input?.focus();

  // Sağ tık menüsünü engelleme
  document.addEventListener('contextmenu', (e) => e.preventDefault());
}