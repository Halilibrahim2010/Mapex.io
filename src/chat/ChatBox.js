// Sohbet penceresi: sol altta katlanabilir gunluk + yazi kutusu.
// Klavye/pointer olaylarini yalnizca kendisi baglar; MainScene yalnizca
// toggle() ve submit() cagirir. Yerlesim buyutme sirasinda yeniden kurulur.
import { UI_DEPTH } from '../ui/uiDepth.js';
import { MAX_MESSAGE_LENGTH } from './ChatTypes.js';

const TITLE = 'SOHBET';
const PADDING = 10;
const TITLE_H = 24;
const INPUT_H = 34;
const ROW_H = 22;
const MIN_W = 260;
const MIN_H = 150;
const MAX_ROWS = 60;           // ekranda tutulan en fazla satir (kaydirma icin)

const COLORS = {
  panel: 0x12180f,
  border: 0x4cd964,
  log: 0x000000,
  inputBg: 0x0d130d,
  title: '#c8f7bf',
  system: '#8fae8f',
  name: '#9fe8a8',
  chat: '#e8f3e8',
  mention: '#ffe9b0',
  private: '#7fd4ff'
};

export class ChatBox {
  constructor(scene, model, onSend) {
    this.scene = scene;
    this.model = model;
    this.onSend = onSend || null;
    this.open = false;
    this.group = null;
    this.lines = [];
    this.width = 460;
    this.height = 240;
    this.margin = 16;
    this.dirty = false;
    this._text = '';
    this._setupKeyboard();
  }

  get isOpen() { return this.open; }

  // Phaser'in klavye yakalamasi acik olmali: aksi halde Enter/ok tuslari
  // tarayicida varsayilan davranisa gider.
  _setupKeyboard() {
    const keyboard = this.scene.input.keyboard;
    if (!keyboard) return;
    keyboard.enabled = true;
    keyboard.addCapture(['SPACE', 'UP', 'DOWN', 'ENTER']);
  }

  // MainScene'deki tek klavye dinleyicisi buraya yonlendirir: pencere acikken
  // tum tuslar (yazma, ok tuslari, Enter, Backspace) sohbete gider.
  // ESC kapatma tusudur: burada tuketilir, boylece pause menu acilmaz.
  handleKeydown(event) {
    if (!this.open) return false;
    if (event.key === 'Escape') {
      this.close();
      this._consumeEscape();
      return true;
    }
    if (event.ctrlKey || event.altKey || event.metaKey) return false;
    return this.handleKey(event);
  }

  // PauseMenu ESC'yi bir sonraki karede okur; ayni basinin menuyu acmamasi icin
  // bu tusu "tuketildi" olarak isaretleriz (SettingsPanel ile ayni desen).
  _consumeEscape() {
    this.scene.escConsumedAt = performance.now();
  }

  // Govde alani (baslik ve yazi kutusu disinda kalan cizim alani).
  _logRect() {
    return {
      x: PADDING,
      y: PADDING + TITLE_H,
      w: Math.max(1, this.width - PADDING * 2),
      h: Math.max(1, this.height - PADDING * 3 - TITLE_H - INPUT_H)
    };
  }

  // --- Ac / kapat ---------------------------------------------------------

  toggle() {
    if (this.open) this.close();
    else this.openBox();
  }

  openBox() {
    if (this.open) return;
    this.open = true;
    this._build();
    if (this.onOpenStateChange) this.onOpenStateChange(true);
  }

  close() {
    if (!this.open) return;
    this.open = false;
    this._text = '';
    this.model.lookbackIndex = this.model.lookback.length;
    if (this.group) {
      this.group.destroy(true);
      this.group = null;
    }
    this.lines = [];
    if (this.onOpenStateChange) this.onOpenStateChange(false);
  }

  // Buyutme veya ekran olcusu degisti: yazi kutusu korunarak yeniden kurulur.
  rebuild() {
    if (!this.open) return;
    const text = this._text;
    this.close();
    this.open = true;
    this._text = text;
    this._build();
  }

  _build() {
    const scene = this.scene;
    const depth = UI_DEPTH + 3;
    const group = scene.add.group();
    this.group = group;
    const origin = this.origin();
    const w = this.width;
    const h = this.height;

    // Tüm parçalar 'ox/oy' ile ötelenir: pencere ekranın sol alt köşesine
    // sabittir, büyüme yukarı ve sağa doğru olur. Group'un konumu yoktur
    // (Phaser Group taşınamaz), bu yüzden öteleme her çizimde uygulanır.
    const ox = origin.x;
    const oy = origin.y;

    group.add(scene.add.rectangle(ox, oy, w, h, COLORS.panel, 0.86)
      .setOrigin(0, 0).setDepth(depth).setScrollFactor(0).setInteractive());

    group.add(scene.add.text(ox + PADDING, oy + PADDING, TITLE, {
      fontFamily: 'Monocraft', fontSize: '16px', fontStyle: 'bold', color: COLORS.title
    }).setOrigin(0, 0).setDepth(depth).setScrollFactor(0));
    group.add(scene.add.text(ox + w - PADDING, oy + PADDING, 'Koseden boyutlandir', {
      fontFamily: 'Monocraft', fontSize: '12px', color: COLORS.name
    }).setOrigin(1, 0).setDepth(depth).setScrollFactor(0));

    const log = this._logRect();
    const logBg = scene.add.graphics().setDepth(depth).setScrollFactor(0);
    logBg.fillStyle(COLORS.log, 0.55)
      .fillRoundedRect(ox + log.x, oy + log.y, log.w, log.h, 4);
    logBg.lineStyle(1, COLORS.border, 0.35)
      .strokeRoundedRect(ox + log.x, oy + log.y, log.w, log.h, 4);
    group.add(logBg);

    this._createLines(group, depth);
    this._renderLog();

    group.add(scene.add.rectangle(ox, oy, w, h).setOrigin(0, 0)
      .setStrokeStyle(2, COLORS.border, 0.7).setDepth(depth + 1).setScrollFactor(0));

    this._createInput(group, depth);
    this._createResizeHandle(group, depth);
  }

  // Pencere ekranın solunda ve altında sabittir: büyüme sağa/yukarı gider.
  origin() {
    const scale = this.scene.scale;
    return { x: this.margin, y: scale.height - this.margin - this.height };
  }

  _createLines(group, depth) {
    const scene = this.scene;
    const wrapWidth = Math.max(60, this._logRect().w - 12);
    for (let i = 0; i < MAX_ROWS; i++) {
      const text = scene.add.text(0, 0, '', {
        fontFamily: 'Monocraft', fontSize: '15px', color: COLORS.chat,
        wordWrap: { width: wrapWidth, useAdvancedWrap: true }
      }).setOrigin(0, 0).setDepth(depth + 1).setScrollFactor(0).setVisible(false);
      group.add(text);
      this.lines.push(text);
    }
  }

  _createInput(group, depth) {
    const scene = this.scene;
    const origin = this.origin();
    const y = origin.y + this.height - PADDING - INPUT_H;
    const width = this.width - PADDING * 2;
    const x = origin.x + PADDING;

    const bg = scene.add.rectangle(x, y, width, INPUT_H, COLORS.inputBg, 0.95)
      .setOrigin(0, 0).setDepth(depth).setScrollFactor(0).setInteractive();
    group.add(bg);
    group.add(scene.add.rectangle(x, y, width, INPUT_H).setOrigin(0, 0)
      .setStrokeStyle(1, COLORS.border, 0.6).setDepth(depth + 1).setScrollFactor(0));

    // Ozel mesaj kipi (#) vurgulanir: yazinin bir kisiye gidecegi belli olsun.
    this.inputPrefix = scene.add.text(x + 8, y + 9, '>', {
      fontFamily: 'Monocraft', fontSize: '16px', fontStyle: 'bold', color: COLORS.name
    }).setOrigin(0, 0).setDepth(depth + 1).setScrollFactor(0);
    group.add(this.inputPrefix);

    this.inputText = scene.add.text(x + 24, y + 9, '', {
      fontFamily: 'Monocraft', fontSize: '16px', color: '#ffffff',
      wordWrap: { width: width - 40 }
    }).setOrigin(0, 0).setDepth(depth + 1).setScrollFactor(0);
    group.add(this.inputText);

    bg.on('pointerdown', () => { this._text = ''; this._renderInput(); });
    this._renderInput();
  }

  // --- Boyutlandirma ------------------------------------------------------

  _createResizeHandle(group, depth) {
    const scene = this.scene;
    const origin = this.origin();
    const size = 22;
    const mark = scene.add.text(origin.x + this.width - size + 4, origin.y + this.height - size + 2, '\u2b1a', {
      fontFamily: 'Monocraft', fontSize: '14px', color: COLORS.name, alpha: 0.8
    }).setOrigin(0, 0).setDepth(depth + 1).setScrollFactor(0);
    group.add(mark);
    const handle = scene.add.rectangle(
      origin.x + this.width - size / 2, origin.y + this.height - size / 2, size, size, 0x000000, 0.001
    ).setDepth(depth + 2).setScrollFactor(0).setInteractive({ useHandCursor: true });
    group.add(handle);

    // Sol alt köşe sabittir: sürükleme yalnızca pencereyi büyütür/küçültür.
    const onMove = (pointer) => {
      if (!this._resizing || !this.open) return;
      const base = this.origin();
      this.setSize(pointer.x - base.x, pointer.y - base.y);
    };
    const onUp = () => { this._resizing = false; };
    handle.on('pointerdown', () => { this._resizing = true; });
    scene.input.on('pointermove', onMove);
    scene.input.on('pointerup', onUp);
    this._detachResize = () => {
      scene.input.off('pointermove', onMove);
      scene.input.off('pointerup', onUp);
    };
  }

  setSize(w, h) {
    const scene = this.scene.scale;
    const clampedW = clamp(w, MIN_W, scene.width - 40);
    const clampedH = clamp(h, MIN_H, scene.height - 40);
    // Sürükleme titremesin diye boyutlar 8px adımlara yuvarlanır.
    const nextW = Math.round(clampedW / 8) * 8;
    const nextH = Math.round(clampedH / 8) * 8;
    if (nextW === this.width && nextH === this.height) return;
    this.width = nextW;
    this.height = nextH;
    this.rebuild();
  }

  // --- Yazma / gonderme ---------------------------------------------------

  handleKey(event) {
    if (!this.open) return false;
    const key = event.key;
    if (key === 'Enter') {
      this.submit();
      return true;
    }
    if (key === 'Backspace') {
      this._text = this._text.slice(0, -1);
      this._renderInput();
      return true;
    }
    if (key === 'ArrowUp' || key === 'ArrowDown') {
      this._text = this.model.navigate(key === 'ArrowUp' ? -1 : 1, this._text);
      this._renderInput();
      return true;
    }
    if (key.length === 1 && this._text.length < MAX_MESSAGE_LENGTH) {
      this._text += key;
      this._renderInput();
      return true;
    }
    return false;
  }

  submit() {
    const text = this._text.trim();
    if (!text) return;
    const result = this.onSend ? this.onSend(text) : null;
    if (result && result.error) {
      this.addSystem(result.error);
      return;
    }
    this._text = '';
    this._renderInput();
    this._renderLog();
  }

  // Sistem satiri: hata veya bilgi mesajlari (or. gonderim reddedildi).
  addSystem(text) {
    this.model.add({ kind: 'system', from: 'Sistem', text });
    this._renderLog();
  }

  _renderInput() {
    if (!this.inputText) return;
    this.inputText.setText(this._text + '_');
    if (this.inputPrefix) {
      this.inputPrefix.setColor(this._text.startsWith('#') ? COLORS.private : COLORS.name);
    }
  }

  // --- Gunluk cizimi ------------------------------------------------------

  // En son mesajlar ekranin altindadir; havuzdaki satirlar tersten doldurulur.
  _renderLog() {
    if (!this.lines.length) return;
    const log = this._logRect();
    const origin = this.origin();
    const visible = Math.max(1, Math.floor((log.h - 8) / ROW_H));
    const entries = this.model.journal.slice(-Math.min(this.lines.length, MAX_ROWS));
    let shown = 0;
    for (let i = entries.length - 1; i >= 0 && shown < this.lines.length; i--) {
      const entry = entries[i];
      const line = this.lines[shown];
      line.setText(this._lineText(entry));
      line.setColor(this._lineColor(entry));
      line.setVisible(shown < visible);
      line.setPosition(
        origin.x + log.x + 6,
        origin.y + log.y + 4 + (visible - 1 - shown) * ROW_H
      );
      shown++;
    }
    for (let i = shown; i < this.lines.length; i++) this.lines[i].setVisible(false);
  }

  // Satir: [saat] Isim: metin. Ozel mesaj ve bahsetme satirlari renklenir.
  _lineText(entry) {
    const time = formatClock(entry.at);
    if (entry.kind === 'system') return `[${time}] ${entry.text}`;
    const prefix = entry.kind === 'private' ? `${entry.from} \u2192 sen` : entry.from;
    return `[${time}] ${prefix}: ${entry.text}`;
  }

  _lineColor(entry) {
    if (entry.kind === 'system') return COLORS.system;
    if (entry.kind === 'private') return COLORS.private;
    if (entry.kind === 'mention') return COLORS.mention;
    return COLORS.chat;
  }

  update() {
    if (!this.open || !this.dirty) return;
    this.dirty = false;
    this._renderLog();
  }

  // Yeni mesaj geldi: cizim bir sonraki karede tazelenir (frame basina bir kez).
  markDirty() {
    this.dirty = true;
  }

  destroy() {
    if (this._detachResize) this._detachResize();
    this.close();
  }
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function formatClock(at) {
  const date = new Date(at || Date.now());
  return String(date.getHours()).padStart(2, '0') + ':' + String(date.getMinutes()).padStart(2, '0');
}