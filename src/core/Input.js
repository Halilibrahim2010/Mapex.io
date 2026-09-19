export class PlayerInput {
  constructor(scene) {
    this.scene = scene;
    this.cursors = null;
    this.wasd = null;
    this.active = false;
  }

  activate() {
    if (this.active) return;
    this.active = true;

    this.cursors = this.scene.input.keyboard.createCursorKeys();
    this.wasd = this.scene.input.keyboard.addKeys({
      up: Phaser.Input.Keyboard.KeyCodes.W,
      down: Phaser.Input.Keyboard.KeyCodes.S,
      left: Phaser.Input.Keyboard.KeyCodes.A,
      right: Phaser.Input.Keyboard.KeyCodes.D
    });
  }

  getVector() {
    if (!this.active || this.scene.chatOpen || (this.scene.chatBox && this.scene.chatBox.isOpen) || this.scene.menuOpen || this.scene.inventoryOpen || this.scene.settingsOpen) {
      return { moveX: 0, moveY: 0 };
    }

    let moveX = 0;
    let moveY = 0;

    if (this.cursors.left.isDown || this.wasd.left.isDown) moveX -= 1;
    if (this.cursors.right.isDown || this.wasd.right.isDown) moveX += 1;
    if (this.cursors.up.isDown || this.wasd.up.isDown) moveY -= 1;
    if (this.cursors.down.isDown || this.wasd.down.isDown) moveY += 1;

    return { moveX, moveY };
  }
}