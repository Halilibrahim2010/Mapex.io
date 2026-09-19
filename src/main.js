import { PreloadScene } from './scenes/PreloadScene.js';
import { MainMenuScene } from './scenes/MainMenuScene.js';
import { CostumeSelectScene } from './scenes/CostumeSelectScene.js';
import { MainScene } from './scenes/MainScene.js';
import { initMenu } from './ui/Menu.js';
import { ensureGameData } from './core/ObjectDefs.js';
import { ensureCostumeData } from './core/CostumeDefs.js';
import { initAccount } from './account/index.js';
import './core/StartRequest.js';

// Oyun verisi (shared/objectDefs.json) Phaser başlamadan önce yüklenir; böylece
// PreloadScene dosya listesini tek turda, senkron olarak kurabilir.
async function boot() {
  try {
    await ensureGameData();
    await ensureCostumeData();
  } catch (error) {
    console.error('Oyun verisi yüklenemedi:', error);
    const overlay = document.getElementById('menu-overlay');
    if (overlay) {
      overlay.innerHTML = '<div class="menu-card"><h1 class="menu-title">Bağlantı hatası</h1><p class="menu-sub">objectDefs.json yüklenemedi. Sunucuyu çalıştırıp sayfayı yenile.</p></div>';
    }
    return;
  }

  // Hesap katmanı oyundan ÖNCE ve oyundan bağımsız çözülür. Sunucu yoksa,
  // jeton geçersizse veya kayıt yoksa sessizce misafir/çevrimdışı oturuma
  // düşer; bu fonksiyon asla hata fırlatmaz.
  const session = await initAccount();
  console.log(`[hesap] oturum: ${session.kind} (${session.displayName})`);

  const config = {
    type: Phaser.AUTO,
    width: window.innerWidth,
    height: window.innerHeight,
    parent: 'game-container',
    pixelArt: true,
    roundPixels: true,
    clearBeforeRender: true,
    backgroundColor: '#000000',
    physics: {
      default: 'arcade',
      arcade: {
        debug: false
      }
    },
    scene: [PreloadScene, MainMenuScene, CostumeSelectScene, MainScene]
  };

  const game = new Phaser.Game(config);
  // Hata ayıklama ve tarayıcı testleri için: Phaser örneğine erişim.
  window.__mapexGame = game;

  window.addEventListener('resize', () => {
    game.scale.resize(window.innerWidth, window.innerHeight);
  });

  // Modüller defer ile çalıştığı için DOMContentLoaded çoktan geçmiş olabilir;
  // bu yüzden menüyü doğrudan (veya henüz yüklenmediyse olayda) başlat.
  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', () => {
      initMenu().catch((error) => console.error('Menü başlatılamadı:', error));
    });
  } else {
    initMenu().catch((error) => console.error('Menü başlatılamadı:', error));
  }
}

boot();