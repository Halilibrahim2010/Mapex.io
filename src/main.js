import { PreloadScene } from './scenes/PreloadScene.js';
import { MainScene } from './scenes/MainScene.js';
import { initMenu } from './ui/Menu.js';

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
  scene: [PreloadScene, MainScene]
};

const game = new Phaser.Game(config);

window.addEventListener('resize', () => {
  game.scale.resize(window.innerWidth, window.innerHeight);
});

window.addEventListener('DOMContentLoaded', () => {
  initMenu().catch((error) => console.error('Menü başlatılamadı:', error));
});