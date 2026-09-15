import { createCharAnims } from '../animations/CharAnims.js';
import { PixelMovement } from '../utils/Movement.js';
import { PlayerInput } from '../core/Input.js';
import { ANIM_STATE, animKeyOf, animStateOf } from './AnimState.js';

export class Player extends Phaser.Physics.Arcade.Sprite {
  constructor(scene, x, y, charKey = 'char1') {
    super(scene, x, y, charKey);

    this.charKey = charKey;
    scene.add.existing(this);

    this.setDepth(10);
    this.setScale(2);

    this.facingLeft = false;
    this.chopAnim = false;
    this.animState = ANIM_STATE.IDLE;

    this.mover = new PixelMovement(120);
    this.inputHandler = new PlayerInput(scene);

    createCharAnims(scene, this.charKey);
  }

  setCharacter(charKey) {
    if (this.charKey === charKey) return;
    this.charKey = charKey;
    this.setTexture(charKey);
    createCharAnims(this.scene, charKey);
    this.play(`${charKey}_idle`, true);
  }

  activateInput() {
    this.inputHandler.activate();
  }

  setChopping(active) {
    if (this.chopAnim === active) return;
    this.chopAnim = active;
    if (active) this.play(`${this.charKey}_punch`, true);
  }

  update() {
    const { moveX, moveY } = this.inputHandler.getVector();

    // Hareket hesaplama; göl varsa eksen bazında engelle (suya girilemez).
    const { newX, newY } = this.mover.update(this.x, this.y, moveX, moveY);
    const [finalX, finalY] = this._resolveWater(newX, newY);
    this.setPosition(finalX, finalY);

    // Yön flip ayarı
    if (moveX !== 0) {
      this.facingLeft = moveX < 0;
      this.setFlipX(this.facingLeft);
    }

    // Animasyon: kesme > yürüme > durma. Durum ağ üzerinden de gönderilir ki
    // karşı taraf aynı animasyonu görsün.
    this.animState = animStateOf(moveX, moveY, this.chopAnim);
    const key = animKeyOf(this.charKey, this.animState);
    if (!this.anims.isPlaying || this.anims.currentAnim.key !== key) {
      this.play(key, true);
    }
  }

  // Ayak noktası suya düşerse hareketi eksen bazında kısıtlar (kayma hissi korur).
  _resolveWater(newX, newY) {
    const terrain = this.scene.terrain;
    if (!terrain || !terrain.isWaterAt) return [newX, newY];
    const FEET_OFFSET = 30;
    if (!terrain.isWaterAt(newX, newY + FEET_OFFSET)) return [newX, newY];
    if (!terrain.isWaterAt(newX, this.y + FEET_OFFSET)) return [newX, this.y];
    if (!terrain.isWaterAt(this.x, newY + FEET_OFFSET)) return [this.x, newY];
    return [this.x, this.y];
  }
}