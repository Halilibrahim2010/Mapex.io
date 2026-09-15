// In-game HUD elements owned by MainScene (wood counter etc).
// Extracted so MainScene.create/startGame stays readable.
import { UI_DEPTH } from './uiDepth.js';

export class Hud {
  constructor(scene) {
    this.scene = scene;
    this.woodText = null;
    this.stoneText = null;
    this.xPositionText = null;
    this.yPositionText = null;
  }

  create() {
    this.woodText = this.scene.add.text(16, 12, 'Odun: 0', {
      fontFamily: 'Arial, sans-serif',
      fontSize: '16px',
      fontStyle: 'bold',
      color: '#ffe9b0',
      stroke: '#000000',
      strokeThickness: 3
    }).setScrollFactor(0).setDepth(UI_DEPTH);
    this.stoneText = this.scene.add.text(16, 36, 'Taş: 0', {
      fontFamily: 'Arial, sans-serif',
      fontSize: '16px',
      fontStyle: 'bold',
      color: '#c0c0c0',
      stroke: '#000000',
      strokeThickness: 3
    }).setScrollFactor(0).setDepth(UI_DEPTH);
    this.xPositionText = this.scene.add.text(16, 60, 'X: 0', {
      fontFamily: 'Arial, sans-serif',
      fontSize: '16px',
      fontStyle: 'bold',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 3
    }).setScrollFactor(0).setDepth(UI_DEPTH);
    this.yPositionText = this.scene.add.text(16, 84, 'Y: 0', {
      fontFamily: 'Arial, sans-serif',
      fontSize: '16px',
      fontStyle: 'bold',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 3
    }).setScrollFactor(0).setDepth(UI_DEPTH);
  }

  setWood(n) {
    if (this.woodText) this.woodText.setText('Odun: ' + n);
  }

  setStone(n) {
    if (this.stoneText) this.stoneText.setText('Taş: ' + n);
  }
  
  setPosition(x, y) {
    if (this.xPositionText) this.xPositionText.setText('X: ' + x);
    if (this.yPositionText) this.yPositionText.setText('Y: ' + y);
  }
}
