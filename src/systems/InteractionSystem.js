// Veri odaklı nesne sistemi: toplanabilir nesne arama ve kesme (hold)
// etkileşimi + çarpışma çözümü. Hedef türleri JSON'daki "interaction"
// alanından gelir (hold | pickup); kodda tür adı geçmez.
const FEET_OFFSET = 34;
const PLAYER_RADIUS = 12;

export class InteractionSystem {
  constructor(scene, layer) {
    this.scene = scene;
    this.layer = layer;
    this.holdTarget = null;
    this.soundTimer = 0;
    this.chopBar = scene.add.graphics().setDepth(9001);
    this.hoverText = null;
    this.hoverRecord = null;
    this.hoverSource = null;
  }

  // Tek hover metni: toplanabilir nesne veya yerdeki eşya (aynı görsel dil).
  showHover(source, record, label) {
    if (!this.hoverText) {
      this.hoverText = this.scene.add.text(record.x, record.y - 30, label, {
        fontFamily: 'Arial, sans-serif', fontSize: '12px', color: '#ffe9b0',
        stroke: '#000000', strokeThickness: 2
      }).setOrigin(0.5).setDepth(9500);
    } else {
      this.hoverText.setPosition(record.x, record.y - 30).setText(label).setVisible(true);
    }
    this.hoverRecord = record;
    this.hoverSource = source;
  }

  hideHover() {
    this.hoverRecord = null;
    this.hoverSource = null;
    if (this.hoverText) this.hoverText.setVisible(false);
  }

  // --- Toplanabilir nesneler (taş, odun) ---

  // Oyuncuya en yakın toplanabilir nesneyi döndürür.
  nearestPickup(maxRange) {
    const player = this.scene.player;
    if (!player) return null;
    const feetX = player.x;
    const feetY = player.y + FEET_OFFSET;
    let nearest = null;
    let nearestDistance = Infinity;

    for (const record of this.layer.all()) {
      if (!record.def.pickable || !record.sprite) continue;
      const range = maxRange || record.def.pickup.range;
      const distance = Math.hypot(record.data.x - feetX, record.data.y - feetY);
      if (distance >= range || distance >= nearestDistance) continue;
      nearestDistance = distance;
      nearest = record;
    }
    return nearest;
  }

  // Toplanabilir nesneyi sunucuya bildirir (sunucu envanteri günceller).
  pick(record) {
    if (!record) return false;
    this.layer.remove(record.id);
    this.scene.network.sendPick(record.def.id);
    this.scene.sfx.pickup();
    return true;
  }

  pickNearest(maxRange = 60) {
    return this.pick(this.nearestPickup(maxRange));
  }

  // --- Hover metni (yakındaki eşyanın adı) ---

  // Etkileşimli en yakın öğe: yerdeki eşya mı yoksa dünyadaki nesne mi?
  updateHover(drops) {
    const staged = drops ? drops.stagedNearest() : null;
    if (staged) {
      this.showHover('drop', staged.record, staged.label);
      return;
    }
    const record = this.nearestPickup(60);
    if (!record) {
      this.hideHover();
      return;
    }
    this.showHover('object', record, record.def.stackLabel || record.def.name);
  }

  // E tuşu: önce yerdeki eşya, sonra dünyadaki toplanabilir nesne.
  pickUpNearby(drops) {
    if (drops && drops.pickupNearest()) return true;
    return this.pickNearest(60);
  }

  // --- Kesme (hold) etkileşimi ---

  pointerDown(worldX, worldY) {
    const target = this._pickHarvestable(worldX, worldY);
    const nextId = target ? target.id : null;
    if (this.holdTarget && this.holdTarget !== nextId) this._resetProgress(this.holdTarget);
    if (target && target.id !== this.holdTarget) target.progress = 0;
    this.holdTarget = nextId;
    this.soundTimer = 0;
  }

  pointerMove(worldX, worldY) {
    if (!this.holdTarget) return;
    const target = this._pickHarvestable(worldX, worldY);
    if (!target || target.id !== this.holdTarget) this.cancel();
  }

  pointerUp() {
    this.cancel();
  }

  cancel() {
    this._resetProgress(this.holdTarget);
    this.holdTarget = null;
    if (this.chopBar) this.chopBar.clear();
    if (this.scene.player) this.scene.player.setChopping(false);
  }

  _resetProgress(id) {
    if (!id) return;
    const record = this.layer.get(id);
    if (record) record.progress = 0;
  }

  _pickHarvestable(worldX, worldY) {
    const player = this.scene.player;
    if (!player) return null;
    const target = this.layer.pick(worldX, worldY, (record) => record.harvestable);
    if (!target) return null;
    const range = target.def.harvest.range;
    const distance = Math.hypot(player.x - target.data.x, (player.y + FEET_OFFSET) - target.data.y);
    return distance > range ? null : target;
  }

  // Her frame: hold süresi dolunca nesne kırılır.
  update(deltaMs) {
    if (this.scene.menuOpen || this.scene.inventoryOpen) {
      if (this.holdTarget) this.cancel();
      else if (this.scene.player) this.scene.player.setChopping(false);
      return;
    }
    if (!this.holdTarget) {
      if (this.scene.player) this.scene.player.setChopping(false);
      return;
    }
    const record = this.layer.get(this.holdTarget);
    if (!record) {
      this.cancel();
      return;
    }
    const player = this.scene.player;
    const harvest = record.def.harvest;
    const distance = Math.hypot(player.x - record.data.x, (player.y + FEET_OFFSET) - record.data.y);
    if (distance > harvest.range + 8) {
      this.cancel();
      return;
    }

    player.facingLeft = record.data.x < player.x;
    player.setChopping(true);

    const dt = (deltaMs || 16.7) / 1000;
    this.soundTimer -= dt;
    if (this.soundTimer <= 0) {
      this.soundTimer = 0.5;
      this._playHit(record);
    }
    record.progress += dt;
    this._drawProgressBar(record);
    if (record.progress >= harvest.holdTime) {
      this._break(record);
      this.holdTarget = null;
      this.chopBar.clear();
      player.setChopping(false);
    }
  }

  _playHit(record) {
    this.scene.sfx.chop();
    const cursor = this.scene.chopCursor;
    if (cursor) this.scene.spawnClickEffect(cursor.x, cursor.y);
    if (!record.sprite) return;
    const shakes = record.def.harvest.shakes || 1;
    this.scene.tweens.add({
      targets: record.sprite,
      angle: { from: -2.5, to: 2.5 },
      duration: 60,
      yoyo: true,
      repeat: shakes - 1,
      onComplete: () => { if (record.sprite) record.sprite.angle = 0; }
    });
  }

  _drawProgressBar(record) {
    const g = this.chopBar;
    if (!g) return;
    g.clear();
    const w = 52;
    const h = 6;
    const x = record.data.x - w / 2;
    const y = record.data.y - 74;
    const progress = Math.min(1, record.progress / record.def.harvest.holdTime);
    g.fillStyle(0x000000, 0.55).fillRoundedRect(x - 1, y - 1, w + 2, h + 2, 3);
    g.fillStyle(0x3a2a18, 1).fillRoundedRect(x, y, w, h, 2);
    g.fillStyle(0x7ec850, 1).fillRoundedRect(x, y, Math.max(2, w * progress), h, 2);
  }

  // Kırma: görsel kaldırılır, düşen eşya ve dünya durumu sunucuya bildirilir.
  _break(record) {
    const scene = this.scene;
    const result = this.layer.remove(record.id);
    if (!result) return;
    if (result.drop) scene.sendBreakdown(result.drop.itemId, result.drop.count, result.x, result.y);
    scene.network.sendObjectRemoved(record.type, record.id);
  }

  // --- Çarpışma: kaya (obstacle) ve kesilen ağaç gövdeleri ---

  resolveCollisions() {
    const player = this.scene.player;
    if (!player) return;
    for (const rect of this.layer.colliders.values()) {
      this._pushOutOfRect(player, rect);
    }
    for (const stump of this.layer.stumps) {
      this._pushOutOfCircle(player, stump.x, stump.y, stump.collider);
    }
  }

  _pushOutOfRect(player, rect) {
    const feetX = player.x;
    const feetY = player.y + FEET_OFFSET;
    const closestX = Math.max(rect.x, Math.min(feetX, rect.x + rect.w));
    const closestY = Math.max(rect.y, Math.min(feetY, rect.y + rect.h));
    const dx = feetX - closestX;
    const dy = feetY - closestY;
    const distance = Math.hypot(dx, dy);
    if (distance >= PLAYER_RADIUS) return;
    if (distance === 0) {
      player.y = rect.y - PLAYER_RADIUS - FEET_OFFSET;
      return;
    }
    const push = (PLAYER_RADIUS - distance) / distance;
    player.x = Math.round(feetX + dx * push);
    player.y = Math.round(feetY + dy * push - FEET_OFFSET);
  }

  _pushOutOfCircle(player, cx, cy, radius) {
    const feetX = player.x;
    const feetY = player.y + FEET_OFFSET;
    const dx = feetX - cx;
    const dy = feetY - cy;
    const distance = Math.hypot(dx, dy);
    const minDistance = (radius || 12) + 13;
    if (distance >= minDistance) return;
    const factor = distance > 0.001 ? (minDistance - distance) / distance : 0;
    const nx = distance > 0.001 ? dx * factor : 0;
    const ny = distance > 0.001 ? dy * factor : -minDistance;
    player.x = Math.round(player.x + nx);
    player.y = Math.round(player.y + ny);
  }
}