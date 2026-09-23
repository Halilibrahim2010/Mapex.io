import { MenuBackground } from '../systems/MenuBackground.js';
import { consumeStartRequest } from '../core/StartRequest.js';

export class MainMenuScene extends Phaser.Scene {
  constructor() {
    super({ key: 'MainMenuScene' });
    this.menuBg = null;
  }

  create() {
    this.menuBg = new MenuBackground(this);
    this.menuBg.create();

    // Oyun başlatma isteği geldiğinde MainScene'e geçiş yap
    consumeStartRequest((name, char, session, options) => {
      this.cleanup();
      this.scene.start('MainScene', { name, char, session, options });
    });
  }


  update(time, delta) {
    if (this.menuBg) {
      this.menuBg.update(time, delta);
    }
  }

  cleanup() {
    if (this.menuBg) {
      this.menuBg.destroy();
      this.menuBg = null;
    }
  }
}
