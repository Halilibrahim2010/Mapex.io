// Ağaç kesme + odun toplama sistemi. MainScene'den ayrıştırıldı.
// Sahnedeki trees/trunks haritalarını (WorldObjectWindow) ve ağaç gövdesi
// (kütük) yerleşimini kullanır; tıklama/ilerleme/ses/toplama mantığı burada.
export class HarvestSystem {
  constructor(scene) {
    this.scene = scene;
    this.chopTarget = null;   // id of tree being chopped right now
    this.chopSoundTimer = 0;  // time until next hit sound
    this.chopCursor = null;   // cursor pos while chopping (hit markers)
    this.CHOP_TIME = 8;       // seconds of holding to break a tree
    this.CHOP_RANGE = 70;     // max distance from player body to tree base
    this.chopBar = scene.add.graphics().setDepth(9001);
    this.logDrops = [];       // logs waiting on the ground
  }

  // Called when player presses the pointer on the world.
  pointerDown(px, py) {
    const tree = this.pickTree(px, py);
    const nextTarget = tree ? tree.id : null;
    // Progress is NOT kept: switching target restarts from zero.
    if (this.chopTarget && this.chopTarget !== nextTarget) {
      const prev = this.scene.trees.get(this.chopTarget);
      if (prev) prev.progress = 0;
    }
    if (tree && tree.id !== this.chopTarget) tree.progress = 0;
    this.chopTarget = nextTarget;
    this.chopSoundTimer = 0; // first hit sound plays immediately
  }

  // Called on pointer move while a chop target is active.
  pointerMove(px, py) {
    if (!this.chopTarget || !this.chopCursor) return;
    const over = this.pickTree(px, py);
    if (!over || over.id !== this.chopTarget) {
      this.cancelChop();
    }
  }

  pointerUp() {
    this.cancelChop();
  }

  // Full chop reset (pointer handlers + menu open). Single place instead of 4 copies.
  cancelChop() {
    if (this.chopTarget) {
      const tree = this.scene.trees.get(this.chopTarget);
      if (tree) tree.progress = 0;
    }
    this.chopTarget = null;
    this.chopCursor = null;
    if (this.chopBar) this.chopBar.clear();
    if (this.scene.player) this.scene.player.setChopping(false);
  }

  // Finds a choppable tree under the cursor (stump-type trees excluded).
  pickTree(px, py) {
    let best = null, bestD = Infinity;
    for (const tree of this.scene.trees.values()) {
      if (!tree.choppable) continue;
      const dx = px - tree.x;
      const dy = py - (tree.baseY - 20);
      if (Math.abs(dx) <= tree.hitR && dy >= -40 && dy <= 40) {
        if (!this.scene.player) continue;
        const pdx = this.scene.player.x - tree.x;
        const pdy = (this.scene.player.y + 34) - tree.baseY;
        if (Math.hypot(pdx, pdy) > this.CHOP_RANGE) continue;
        const d = dx * dx + dy * dy;
        if (d < bestD) { bestD = d; best = tree; }
      }
    }
    return best;
  }

  // Per-frame chopping progress. deltaMs is real frame delta.
  update(deltaMs) {
    // Menus fully stop chopping (same rule as before the split).
    if (this.scene.menuOpen || this.scene.inventoryOpen) {
      if (this.chopTarget) this.cancelChop();
      else if (this.scene.player) this.scene.player.setChopping(false);
      return;
    }
    const dt = (deltaMs || 16.7) / 1000;
    if (!this.chopTarget) {
      if (this.scene.player) this.scene.player.setChopping(false);
      return;
    }
    const tree = this.scene.trees.get(this.chopTarget);
    if (!tree) {
      this.cancelChop();
      return;
    }
    // Range check: walking away cancels and resets progress.
    const pdx = this.scene.player.x - tree.x;
    const pdy = (this.scene.player.y + 34) - tree.baseY;
    if (Math.hypot(pdx, pdy) > this.CHOP_RANGE + 8) {
      this.cancelChop();
      return;
    }
    if (this.scene.player) {
      this.scene.player.facingLeft = tree.x < this.scene.player.x;
      this.scene.player.setChopping(true);
    }
    // Hit sound roughly every 0.5s while holding.
    this.chopSoundTimer -= dt;
    if (this.chopSoundTimer <= 0) {
      this.scene.chopSound.chop();
      this.chopSoundTimer = 0.5;
      if (this.chopCursor) {
        this.scene.spawnClickEffect(this.chopCursor.x, this.chopCursor.y);
      }
      this.scene.tweens.add({
        targets: tree.sprite,
        angle: { from: -2.5, to: 2.5 },
        duration: 60,
        yoyo: true,
        repeat: 1,
        onComplete: () => { tree.sprite.angle = 0; }
      });
    }
    tree.progress += dt;
    this.drawChopBar(tree);
    if (tree.progress >= this.CHOP_TIME) {
      this.breakTree(tree.id);
      this.chopTarget = null;
      if (this.chopBar) this.chopBar.clear();
      if (this.scene.player) this.scene.player.setChopping(false);
    }
  }

  drawChopBar(tree) {
    const g = this.chopBar;
    if (!g) return;
    g.clear();
    const w = 52, h = 6;
    const x = tree.x - w / 2, y = tree.y - 74;
    const p = Math.min(1, tree.progress / this.CHOP_TIME);
    g.fillStyle(0x000000, 0.55).fillRoundedRect(x - 1, y - 1, w + 2, h + 2, 3);
    g.fillStyle(0x3a2a18, 1).fillRoundedRect(x, y, w, h, 2);
    g.fillStyle(0x7ec850, 1).fillRoundedRect(x, y, Math.max(2, w * p), h, 2);
  }

  // Tree breaks: becomes a bare trunk (Tree2) + drops 3 logs.
  breakTree(id) {
    const tree = this.scene.trees.get(id);
    if (!tree) return;
    this.scene.choppedTrees.add(id);
    this.scene.trees.delete(id);
    this.scene.treesChopped++;
    this.scene.chopSound.treeBreak();
    this.chopBar.clear();
    const s = tree.sprite;
    this.scene.tweens.add({
      targets: s,
      angle: { from: -4, to: 4 },
      duration: 80,
      yoyo: true,
      repeat: 2,
      onComplete: () => {
        s.destroy();
        this.scene.placeBareTrunk(id, tree.x, tree.visualBase);
      }
    });
    for (let i = 0; i < 3; i++) {
      const angle = (i - 1) * 0.9 + Math.random() * 0.4;
      this.dropLog(tree.x + Math.cos(angle) * (18 + Math.random() * 14),
                   tree.baseY + Math.sin(angle) * 10);
    }
    if (this.scene.network) this.scene.network.sendObjectRemoved('tree', id);
  }

  // Drops a pickup log. delayMs blocks pickup for a while (so inventory
  // drops are not instantly re-picked).
  dropLog(x, y, delayMs = 0) {
    const log = this.scene.add.image(x, y, 'log').setDepth(3).setScale(0.8);
    const item = { sprite: log, x, y, readyAt: performance.now() + delayMs };
    this.scene.tweens.add({
      targets: log,
      y: y - 26,
      duration: 180,
      ease: 'Quad.easeOut',
      yoyo: true,
      onComplete: () => {
        log.y = y;
        this.logDrops.push(item);
      }
    });
    this.scene.tweens.add({
      targets: log,
      angle: (Math.random() < 0.5 ? -1 : 1) * 90,
      duration: 360
    });
  }

  // Drops a pickup stone. Same logic as dropLog but for stones.
  dropStone(x, y, delayMs = 0) {
    const stone = this.scene.add.image(x, y, 'stone_1').setDepth(3).setScale(0.8);
    const item = { sprite: stone, x, y, readyAt: performance.now() + delayMs, name: 'Taş' };
    this.scene.tweens.add({
      targets: stone,
      y: y - 26,
      duration: 180,
      ease: 'Quad.easeOut',
      yoyo: true,
      onComplete: () => {
        stone.y = y;
        this.logDrops.push(item);
      }
    });
    this.scene.tweens.add({
      targets: stone,
      angle: (Math.random() < 0.5 ? -1 : 1) * 90,
      duration: 360
    });
  }

  // Yerdeki eşyalar: E tuşuyla alınır (üzerine gitmek gerekmez).
  // Eşyanın üzerine gidince altta isim gösterilir.
  updateLogDrops() {
    const player = this.scene.player;
    if (!player) return;

    // Yakındaki eşyayı bul (odun veya taş)
    let nearest = null;
    let nearestDist = Infinity;
    let nearestName = 'Odun';

    // Odunları kontrol et
    for (const d of this.logDrops) {
      if (d.readyAt && performance.now() < d.readyAt) continue;
      const dist = Math.hypot(player.x - d.x, player.y - d.y);
      if (dist < 60 && dist < nearestDist) {
        nearestDist = dist;
        nearest = d;
        nearestName = d.name || 'Odun';
      }
    }

    // Taşları kontrol et (ChunkManager'daki aktif chunk'larda)
    if (this.scene.chunkManager) {
      const feetX = player.x;
      const feetY = player.y + 34;
      for (const [key, group] of this.scene.chunkManager.activeChunks) {
        const children = group.getChildren();
        for (const child of children) {
          if (child.type !== 'Image') continue;
          const texKey = child.texture.key;
          if (!texKey || !texKey.startsWith('stone_')) continue;
          const dx = child.x - feetX;
          const dy = child.y - feetY;
          const dist = Math.hypot(dx, dy);
          if (dist < 60 && dist < nearestDist) {
            nearestDist = dist;
            nearest = child;
            nearestName = 'Taş';
          }
        }
      }
    }

    // Yakındaki eşyanın ismini göster
    if (nearest && !this._hoverText) {
      this._hoverText = this.scene.add.text(nearest.x, nearest.y - 30, nearestName, {
        fontFamily: 'Arial, sans-serif', fontSize: '12px', color: '#ffe9b0',
        stroke: '#000000', strokeThickness: 2
      }).setOrigin(0.5).setDepth(9500);
    } else if (nearest && this._hoverText) {
      this._hoverText.setPosition(nearest.x, nearest.y - 30);
      this._hoverText.setText(nearestName);
    } else if (!nearest && this._hoverText) {
      this._hoverText.destroy();
      this._hoverText = null;
    }
  }

  // E tuşuyla yakındaki eşyayı al (odun veya taş)
  pickUpNearby() {
    const player = this.scene.player;
    if (!player) return false;

    // önce odunları kontrol et
    if (this.logDrops.length) {
      let nearest = null;
      let nearestDist = Infinity;
      let nearestIndex = -1;
      for (let i = this.logDrops.length - 1; i >= 0; i--) {
        const d = this.logDrops[i];
        if (d.readyAt && performance.now() < d.readyAt) continue;
        const dist = Math.hypot(player.x - d.x, player.y - d.y);
        if (dist < 60 && dist < nearestDist) {
          nearestDist = dist;
          nearest = d;
          nearestIndex = i;
        }
      }

      if (nearest && nearestIndex >= 0) {
        this.logDrops.splice(nearestIndex, 1);
        // Yeni inventory sistemi kullan
        if (this.scene.inventory) {
          this.scene.inventory.add('wood', 1);
        }
        this.scene.wood = (this.scene.inventory ? this.scene.inventory.totalItem('wood') : this.scene.wood + 1);
        if (this.scene.woodText) this.scene.woodText.setText('Odun: ' + this.scene.wood);
        if (this.scene.refreshHotbar) this.scene.refreshHotbar();
        this.scene.chopSound.pickup();
        this.scene.tweens.add({
          targets: nearest.sprite,
          y: nearest.sprite.y - 24,
          alpha: 0,
          duration: 260,
          onComplete: () => nearest.sprite.destroy()
        });
        return true;
      }
    }

    // Sonra taşları kontrol et
    return this.pickUpStoneNearby();
  }

  // E tuşuyla yakındaki küçük taşı al (1-8 küçük taşlar)
  pickUpStoneNearby() {
    const player = this.scene.player;
    if (!player) return false;

    // Chunk manager'daki aktif chunk'lari ara
    if (!this.scene.chunkManager || !this.scene.chunkManager.activeChunks) return false;

    let nearest = null;
    let nearestDist = Infinity;
    let nearestKey = null;

    for (const [key, group] of this.scene.chunkManager.activeChunks) {
      // Bu chunk'taki stone image'lerini bul
      const children = group.getChildren();
      for (const child of children) {
        // Stone image'leri: texture key 'stone_1'..'stone_8' içerenler
        if (child.type === 'Image' && child.texture && child.texture.key) {
          const texKey = child.texture.key;
          if (texKey.startsWith('stone_')) {
            const stoneType = parseInt(texKey.replace('stone_', ''));
            // Sadece küçük taşlar (1-8) toplanabilir
            if (stoneType >= 1 && stoneType <= 8) {
              const dist = Math.hypot(player.x - child.x, player.y - child.y);
              if (dist < 60 && dist < nearestDist) {
                nearestDist = dist;
                nearest = child;
                nearestKey = key;
              }
            }
          }
        }
      }
    }

if (nearest && nearestDist < 60) {
      // Taşı al: sprite'ı yok destroyed, sayacı artır
      nearest.destroy();
      // Yeni inventory sistemi kullan
      if (this.scene.inventory) {
        this.scene.inventory.add('stone', 1);
      }
      this.scene.stone = (this.scene.inventory ? this.scene.inventory.totalItem('stone') : (this.scene.stone || 0) + 1);
      if (this.scene.hud) this.scene.hud.setStone(this.scene.stone);
      if (this.scene.refreshHotbar) this.scene.refreshHotbar();
      this.scene.chopSound.pickup();
      // Sunucuya bildir
      if (this.scene.network) this.scene.network.sendStonePicked(nearestKey);
      return true;
    }
    return false;
  }

  // Yakındaki taşın ismini göster (hover efekti)
  updateStoneHover() {
    const player = this.scene.player;
    if (!player || !this.scene.chunkManager || !this.scene.chunkManager.activeChunks) return;

    let nearest = null;
    let nearestDist = Infinity;

    for (const [key, group] of this.scene.chunkManager.activeChunks) {
      const children = group.getChildren();
      for (const child of children) {
        if (child.type === 'Image' && child.texture && child.texture.key) {
          const texKey = child.texture.key;
          if (texKey.startsWith('stone_')) {
            const stoneType = parseInt(texKey.replace('stone_', ''));
            if (stoneType >= 1 && stoneType <= 8) {
              const dist = Math.hypot(player.x - child.x, player.y - child.y);
              if (dist < 60 && dist < nearestDist) {
                nearestDist = dist;
                nearest = child;
              }
            }
          }
        }
      }
    }

    if (nearest && nearestDist < 60) {
      const stoneType = parseInt(nearest.texture.key.replace('stone_', ''));
      const stoneName = `Taş ${stoneType}`;
      if (!this._stoneHoverText) {
        this._stoneHoverText = this.scene.add.text(nearest.x, nearest.y - 30, stoneName, {
          fontFamily: 'Arial, sans-serif', fontSize: '12px', color: '#c0c0c0',
          stroke: '#000000', strokeThickness: 2
        }).setOrigin(0.5).setDepth(9500);
      } else {
        this._stoneHoverText.setPosition(nearest.x, nearest.y - 30);
        this._stoneHoverText.setText(stoneName);
      }
    } else if (this._stoneHoverText) {
      this._stoneHoverText.destroy();
      this._stoneHoverText = null;
    }
  }

  // Circle-push so the player cannot walk through trunks.
  resolveTreeCollisions() {
    const player = this.scene.player;
    if (!player) return;
    const feetX = player.x;
    const feetY = player.y + 34;
    const pr = 13;

    const push = (ox, oy, r) => {
      const dx = feetX - ox, dy = feetY - oy;
      const d = Math.hypot(dx, dy);
      const min = r + pr;
      if (d < min) {
        let fx, fy;
        if (d > 0.001) { fx = dx / d; fy = dy / d; }
        else { fx = 0; fy = -1; }
        const dist = min - d;
        player.x = Math.round(player.x + fx * dist);
        player.y = Math.round(player.y + fy * dist);
      }
    };

    for (const tree of this.scene.trees.values()) {
      const pdx = tree.x - player.x, pdy = tree.baseY - player.y;
      if (pdx * pdx + pdy * pdy < 90 * 90) push(tree.x, tree.baseY, tree.collR);
    }
    for (const trunk of this.scene.trunks.values()) {
      const pdx = trunk.x - feetX, pdy = trunk.groundY - feetY;
      if (pdx * pdx + pdy * pdy < 90 * 90) push(trunk.x, trunk.groundY, trunk.r);
    }
  }
}
