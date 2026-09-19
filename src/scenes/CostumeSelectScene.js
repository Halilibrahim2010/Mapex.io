import { getCostumeById, getSelectedCostumeId, setSelectedCostumeId, setSelectedCharacterName, getSelectedCharacterName } from '../core/CostumeDefs.js';

export class CostumeSelectScene extends Phaser.Scene {
  constructor() {
    super({ key: 'CostumeSelectScene' });
    this.currentId = 1;
    this.charSprite = null;
    this.isSinglePlayerFlow = false;
  }

  init(data) {
    this.currentId = getSelectedCostumeId() || 1;
    this.isSinglePlayerFlow = data && data.singlePlayer ? true : false;
  }


  create() {
    const w = this.scale.width;
    const h = this.scale.height;

    // Arka plan karartmı
    this.add.rectangle(w / 2, h / 2, w, h, 0x000000, 0.65).setOrigin(0.5);

    // Ortada cannı piksel art önizileme
    this.charSprite = this.add.sprite(w / 2, h / 2 - 50, `char${this.currentId}`)
      .setScale(3.5)
      .setDepth(10);

    this._updatePreview();

    // Klavye yön tuşlarıyla da gezinilebilir
    this.input.keyboard.on('keydown-LEFT', () => this.go(-1));
    this.input.keyboard.on('keydown-RIGHT', () => this.go(1));
  }


  go(dir) {
    let next = this.currentId + dir;
    if (next < 1) next = 18;
    if (next > 18) next = 1;
    this.currentId = next;
    setSelectedCostumeId(next);
    this._updatePreview();
    // DOM açısmıla bildirim yayl
    window.dispatchEvent(new CustomEvent('mapex:costumeChanged', { detail: { id: next, costume: getCostumeById(next) } }));
  }


  _updatePreview() {
    if (!this.charSprite) return;
    const key = `char${this.currentId}`;
    this.charSprite.setTexture(key);
    const animKey = `${key}_idle`;
    if (this.anims.exists(animKey)) {
      this.charSprite.play(animKey, true);
    }
  }
}
