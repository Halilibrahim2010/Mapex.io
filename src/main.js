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
    console.error("Oyun verisi yüklenemedi:", error);
    const overlay = document.getElementById("menu-overlay");
    if (overlay) {
      overlay.innerHTML =
        '<div class="menu-card"><h1 class="menu-title">Bağlantı hatası</h1><p class="menu-sub">objectDefs.json yüklenemedi. Sunucuyu çalıştırıp sayfayı yenile.</p></div>';
    }
    return;
  }

  // Hesap katmanı oyundan ÖNCE ve oyundan bağımsız çözülür. Sunucu yoksa,
  // jeton geçersizse veya kayıt yoksa sessizce misafir/çevrimdışı oturuma
  // düşer; bu fonksiyon asla hata fırlatmaz.
  const session = await initAccount();
  console.log(`[hesap] oturum: ${session.kind} (${session.displayName})`);

  // --- Scaling ayarları: shared/scalingSettings.json ---
  // Sabit ilke: tüm nesneler aynı 3x ölçekte render edilir.
  // - Tile grid: 32px (objectDefs.json tileSize)
  // - Dikey görüş: 11 tile = 352px ≈ 360px (sanal dikey çözünürlük)
  // - Hor+ FOV: dikey tile sabit (11); yatay ekran oranına göre değişir
  const TILE_SIZE = 32; // grid birimi
  const VIRTUAL_HEIGHT = 360; // sanal dikey px (11 tile ≈ 352px)
  const SCALE_FACTOR = 3; // her tile 3×3 piksel → integer scaling
  const VERTICAL_TILES = 11; // sabit dikey tile sayısı
  const screenRatio = window.innerWidth / window.innerHeight;
  const fov = {
    verticalTiles: VERTICAL_TILES,
    verticalPixels: VERTICAL_TILES * TILE_SIZE, // 352
    horizontalTiles: Math.ceil(VERTICAL_TILES * screenRatio),
    horizontalPixels: Math.ceil(VERTICAL_TILES * TILE_SIZE * screenRatio),
  };

  // Integer scaling: ekranı kapatmayacak tam sayı çarpan.
  const integerScale = Math.max(
    1,
    Math.floor(window.innerHeight / VIRTUAL_HEIGHT),
  );
  const GAME_SCALE = Math.max(integerScale, SCALE_FACTOR);

  const config = {
    type: Phaser.AUTO,
    width: window.innerWidth,
    height: window.innerHeight,
    parent: "game-container",
    pixelArt: true,
    roundPixels: true,
    clearBeforeRender: true,
    backgroundColor: "#000000",
    physics: {
      default: "arcade",
      arcade: {
        debug: false,
        gravity: { x: 0, y: 0 },
        // Dünya ölçeği tile bazlıdır: 32px/tile. FPS bağımsızdır.
        // 3x render ölçeği sadece canvas zoom'u ile uygulanır (scale manager).
      },
    },
    scale: {
      // FIT: canvas ekranı doldurur, pikseller bozulmaz (pixelArt + autoRound).
      mode: Phaser.Scale.FIT,
      autoRound: 1,
      width: window.innerWidth,
      height: window.innerHeight,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    scene: [PreloadScene, MainScene],
  };

  // Ölçek bilgisini paylaş: UI sistemleri bunu okur.
  window.__MAPEX_SCALE = {
    tileSize: TILE_SIZE,
    scale: SCALE_FACTOR, // her tile 3 piksel → 32*3 = 96px/ tile görsel
    fov: {
      verticalTiles: fov.verticalTiles,
      horizontalTiles: fov.horizontalTiles,
      verticalPixels: fov.verticalPixels,
      horizontalPixels: fov.horizontalPixels,
    },
    scene: [PreloadScene, MainMenuScene, CostumeSelectScene, MainScene]
  };

  const game = new Phaser.Game(config);
  window.__mapexGame = game;

  // Canvas render ölçeği: tüm dünyayı tek bir zoom ile büyüt.
  // Böylece 1 tile = 96px (32×3), tüm nesneler aynı ölçekte olur.
  game.scale.setZoom(SCALE_FACTOR);

  window.addEventListener("resize", () => {
    game.scale.resize(window.innerWidth, window.innerHeight);
  });

  // Modüller defer ile çalıştığı için DOMContentLoaded çoktan geçmiş olabilir;
  // bu yüzden menüyü doğrudan (veya henüz yüklenmediyse olayda) başlat.
  if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", () => {
      initMenu().catch((error) => console.error("Menü başlatılamadı:", error));
    });
  } else {
    initMenu().catch((error) => console.error("Menü başlatılamadı:", error));
  }
}

boot();
