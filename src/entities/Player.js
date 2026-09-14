import { createCharAnims } from '../animations/CharAnims.js';
import { PixelMovement } from '../utils/Movement.js';
import { PlayerInput } from '../core/Input.js';

export class Player extends Phaser.Physics.Arcade.Sprite {
  constructor(scene, x, y, charKey = 'char1') {
    super(scene, x, y, charKey);

    this.charKey = charKey;
    scene.add.existing(this);

    this.setDepth(10);
    this.setScale(2);

    this.facingLeft = false;
    this.chopAnim = false;

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

    // Hareket hesaplama ve pozisyon güncelleme
    const { newX, newY } = this.mover.update(this.x, this.y, moveX, moveY);
    this.setPosition(newX, newY);

    // Yön flip ayarı
    if (moveX !== 0) {
      this.facingLeft = moveX < 0;
      this.setFlipX(this.facingLeft);
    }

    // Animasyon durumları
    if (this.chopAnim) {
      const punchKey = `${this.charKey}_punch`;
      if (!this.anims.isPlaying || this.anims.currentAnim.key !== punchKey) {
        this.play(punchKey, true);
      }
    } else if (moveX !== 0 || moveY !== 0) {
      this.play(`${this.charKey}_walk`, true);
    } else {
      this.play(`${this.charKey}_idle`, true);
    }
  }
}