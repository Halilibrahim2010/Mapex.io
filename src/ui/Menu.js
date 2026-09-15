export function initMenu() {
  const CHAR_COUNT = 18;
  const sheetUrl = (i) => {
    const file = ['Character 1.png', 'Character 5.png', 'Character 9.png'][(i - 1) % 3];
    return `assets/Characters/Char ${i}/${file}`;
  };

  let selectedChar = 1;
  const grid = document.getElementById('char-grid');
  const big = document.getElementById('char-big');
  const charName = document.getElementById('char-name');

  if (!grid || !big || !charName) return;

  // Izgarayı doldur
  for (let i = 1; i <= CHAR_COUNT; i++) {
    const thumb = document.createElement('div');
    thumb.className = `char-thumb${i === 1 ? ' selected' : ''}`;
    thumb.style.backgroundImage = `url('${sheetUrl(i)}')`;
    thumb.title = `Savaşçı ${i}`;
    thumb.addEventListener('click', () => selectChar(i, thumb));
    grid.appendChild(thumb);
  }

  function selectChar(i, el) {
    selectedChar = i;
    big.style.backgroundImage = `url('${sheetUrl(i)}')`;
    charName.textContent = `Savaşçı ${i}`;
    
    document.querySelectorAll('.char-thumb').forEach((t) => t.classList.remove('selected'));
    el.classList.add('selected');
  }

  big.style.backgroundImage = `url('${sheetUrl(1)}')`;

  // Oyun Başlatma Mantığı
  const overlay = document.getElementById('menu-overlay');
  const input = document.getElementById('name-input');
  const submitBtn = document.getElementById('name-submit');

  function startGame() {
    const name = input.value.trim() || 'Oyuncu';
    overlay.style.display = 'none';
    window.dispatchEvent(new CustomEvent('dneem-start', { detail: { name, char: selectedChar } }));
  }

  submitBtn?.addEventListener('click', startGame);
  input?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') startGame();
  });
  input?.focus();

  // Sağ tık menüsünü engelleme
  document.addEventListener('contextmenu', (e) => e.preventDefault());
}