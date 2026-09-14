export class PixelMovement {
  constructor(speed = 120) {
    this.speed = speed;
    this._fracX = 0;
    this._fracY = 0;
    this._lastFrame = null;
  }

  update(x, y, moveX, moveY) {
    const now = performance.now();
    const dt = this._lastFrame != null ? Math.min((now - this._lastFrame) / 1000.0, 0.05) : (1 / 60);
    this._lastFrame = now;

    if (moveX !== 0 && moveY !== 0) {
      moveX *= 0.7071;
      moveY *= 0.7071;
    }

    this._fracX += moveX * this.speed * dt;
    this._fracY += moveY * this.speed * dt;

    const stepX = Math.trunc(this._fracX / 2) * 2;
    const stepY = Math.trunc(this._fracY / 2) * 2;

    if (stepX !== 0 || stepY !== 0) {
      this._fracX -= stepX;
      this._fracY -= stepY;
    }

    return { newX: x + stepX, newY: y + stepY };
  }
}