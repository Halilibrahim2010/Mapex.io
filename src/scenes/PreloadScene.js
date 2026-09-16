// Asset yükleme sahnesi: dosya listesi tamamen shared/objectDefs.json'dan
// türetilir, bu yüzden yeni bir nesne eklemek için buraya dokunmak gerekmez.
// Veri main.js'de Phaser başlamadan önce yüklenmiş olur (ensureGameData).
import { spriteFileList, getCharacters, getInterface } from '../core/ObjectDefs.js';

export class PreloadScene extends Phaser.Scene {
  constructor() {
    super({ key: 'PreloadScene' });
  }

  preload() {
    const width = this.scale.width;
    const height = this.scale.height;
    this.add.text(width / 2, height / 2, 'Yükleniyor...', {
      fontFamily: 'PixelOperator', fontSize: '28px', color: '#ffe9b0'
    }).setOrigin(0.5);

    this.loadCharacters();
    this.loadUiAssets();
    this.loadDefinedSprites();
  }

  create() {
    this.scene.start('MainScene');
  }

  // Karakter spritesheet'leri JSON'daki characters ayarından yüklenir.
  loadCharacters() {
    const characters = getCharacters();
    for (let i = 1; i <= characters.count; i++) {
      const file = characters.files[(i - 1) % characters.files.length];
      this.load.spritesheet(`char${i}`, `assets/Characters/Char ${i}/${file}`, {
        frameWidth: characters.frameWidth,
        frameHeight: characters.frameHeight
      });
    }
  }

  loadUiAssets() {
    const ui = getInterface();
    for (const [key, path] of Object.entries(ui)) this.load.image(key, path);
  }

  // JSON'daki her sprite dosyası benzersiz anahtarla yüklenir (dosya yolu = anahtar).
  loadDefinedSprites() {
    for (const path of spriteFileList()) {
      if (this.textures.exists(path)) continue;
      this.load.image(path, path);
    }
  }
}