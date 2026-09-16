// Ayarlar paneli: ses seviyeleri (kaydırıcı) ve tuş atamaları (tıkla, sonra
// istediğin tuşa bas). ESC menüsündeki "Settings" butonundan açılır.
// Panel açıkken oyun durur (scene.settingsOpen), bu yüzden tuş atarken karakter
// hareket etmez ve aksiyonlar tetiklenmez.
import { UI_DEPTH } from './uiDepth.js';
import { getSettings, setVolume, setBinding, keyCodeName } from '../core/GameSettings.js';

const PANEL_W = 460;
const PANEL_H = 470;
const TRACK_W = 220;   // kaydırıcı rayının genişliği
const TRACK_H = 8;
const HIT_H = 26;      // rayın tıklama/sürükleme alanı: kolay tutulsun

const KEY_ACTIONS = [
  { action: 'pickup', label: 'Eşya Al' },
  { action: 'inventory', label: 'Envanter' },
  { action: 'dropItem', label: 'Eşya Bırak' },
  { action: 'timeSkip', label: 'Zaman Hızlandır' }
];

export class SettingsPanel {
  constructor(scene) {
    this.scene = scene;
    this.group = null;
    this.open = false;
    this.listeningAction = null; // tuş beklenen aksiyon adı (null: beklemiyoruz)
    this.keyButtons = {};
    this.onBack = null;
    this._escHandler = null;
    this._activeSlider = null;   // tutulan kaydırıcının uygulama fonksiyonu
    this._onPointerMove = null;
    this._onPointerUp = null;
  }

  openPanel(onBack) {
    if (this.open) return;
    this.open = true;
    this.scene.settingsOpen = true;
    this.onBack = onBack || null;
    this.listeningAction = null;
    this.keyButtons = {};

    const scene = this.scene;
    const cw = scene.cameras.main.width;
    const ch = scene.cameras.main.height;
    const group = scene.add.group();
    this.group = group;

    group.add(scene.add.rectangle(cw / 2, ch / 2, cw, ch, 0x000000, 0.7)
      .setDepth(UI_DEPTH).setScrollFactor(0).setInteractive());
    group.add(scene.add.rectangle(cw / 2, ch / 2, PANEL_W, PANEL_H, 0x1c241c)
      .setDepth(UI_DEPTH + 1).setScrollFactor(0).setInteractive().setStrokeStyle(2, 0x4cd964));
    group.add(scene.add.text(cw / 2, ch / 2 - PANEL_H / 2 + 30, 'AYARLAR', {
      fontFamily: 'PixelOperator', fontSize: '30px', fontStyle: 'bold', color: '#c8f7bf'
    }).setOrigin(0.5).setDepth(UI_DEPTH + 2).setScrollFactor(0));

    let y = ch / 2 - PANEL_H / 2 + 84;
    this._addSlider('Ana Ses', 'master', y);
    y += 60;
    this._addSlider('Ortam Sesleri', 'ambience', y);
    y += 78;

    group.add(scene.add.text(cw / 2, y, 'TUŞ ATAMALARI', {
      fontFamily: 'PixelOperator', fontSize: '16px', color: '#4cd964'
    }).setOrigin(0.5).setDepth(UI_DEPTH + 2).setScrollFactor(0));
    y += 40;

    for (const ka of KEY_ACTIONS) {
      this._addKeyRow(ka.label, ka.action, y);
      y += 48;
    }

    this._addBackButton(cw / 2, ch / 2 + PANEL_H / 2 - 36);

    // Kaydırıcı sürüklemesi sahne seviyesinde izlenir: kol bırakılana kadar
    // hangi kaydırıcının tutulduğunu aktifSlider tutar.
    this._onPointerMove = (pointer) => {
      if (!pointer.isDown || !this._activeSlider) return;
      this._activeSlider(pointer);
    };
    this._onPointerUp = () => { this._activeSlider = null; };
    scene.input.on('pointermove', this._onPointerMove);
    scene.input.on('pointerup', this._onPointerUp);

    this._escHandler = (event) => this._onKeyDown(event);
    window.addEventListener('keydown', this._escHandler, true);
  }

  closePanel() {
    if (!this.open) return;
    this.open = false;
    this.scene.settingsOpen = false;
    this.listeningAction = null;
    this._activeSlider = null;
    if (this.group) this.group.destroy(true);
    this.group = null;
    this.keyButtons = {};
    if (this._onPointerMove && this.scene.input) {
      this.scene.input.off('pointermove', this._onPointerMove);
      this.scene.input.off('pointerup', this._onPointerUp);
      this._onPointerMove = null;
      this._onPointerUp = null;
    }
    if (this._escHandler) {
      window.removeEventListener('keydown', this._escHandler, true);
      this._escHandler = null;
    }
    if (this.onBack) this.onBack();
  }

  // Panelin işlediği tuşu oyuna iletme: aynı tuşu oyun da dinliyor.
  _stopEvent(event) {
    event.preventDefault();
    event.stopPropagation();
  }

  _onKeyDown(event) {
    if (!this.open) return;

    // Tuş atama kipi: ESC iptal eder, diğer tuşlar yeni atama olur.
    if (this.listeningAction) {
      const isEsc = event.keyCode === Phaser.Input.Keyboard.KeyCodes.ESC;
      const name = isEsc ? null : keyCodeName(event.keyCode);
      if (name) setBinding(this.listeningAction, name);
      this.listeningAction = null;
      this._refreshKeyButtons();
      this._stopEvent(event);
      return;
    }

    if (event.keyCode === Phaser.Input.Keyboard.KeyCodes.ESC) {
      // PauseMenu de ESC dinlediği için yayılımı burada keseriz.
      this._stopEvent(event);
      this._consumeEscape();
      this.closePanel();
    }
  }

  // Phaser tuş olaylarını bir sonraki karede işlediği için, panel kapandıktan
  // sonra PauseMenu aynı ESC basımıyla menüyü hemen kapatmasın diye bu tuşu
  // kısa süre "tüketildi" olarak işaretleriz.
  _consumeEscape() {
    this.scene.escConsumedAt = performance.now();
  }

  // Kaydırıcı: ray + dolgu + kol. Dolgu Graphics ile çizilir çünkü bir
  // Rectangle'ın width değerini değiştirmek görseli güncellemez.
  _addSlider(label, kind, y) {
    const scene = this.scene;
    const cx = scene.cameras.main.width / 2;
    const left = cx + 20 - TRACK_W / 2;
    const cy = y + 8;

    this.group.add(scene.add.text(left, y - 10, label, {
      fontFamily: 'PixelOperator', fontSize: '18px', color: '#ffffff'
    }).setDepth(UI_DEPTH + 2).setScrollFactor(0));

    this.group.add(scene.add.rectangle(left + TRACK_W / 2, cy, TRACK_W, TRACK_H, 0x0d130d)
      .setDepth(UI_DEPTH + 2).setScrollFactor(0));

    const fill = scene.add.graphics().setDepth(UI_DEPTH + 3).setScrollFactor(0);
    const knob = scene.add.rectangle(left, cy, 12, 22, 0x4cd964)
      .setDepth(UI_DEPTH + 4).setScrollFactor(0);
    this.group.add(fill);
    this.group.add(knob);

    // Tıklama/sürükleme alanı rayın tamamıdır: küçük kolu tutturmak zor olurdu.
    // Sürükleme sahne seviyesinde izlenir; böylece rayın dışına taşsa da çalışır.
    const hit = scene.add.rectangle(left + TRACK_W / 2, cy, TRACK_W, HIT_H, 0x000000, 0)
      .setDepth(UI_DEPTH + 5).setScrollFactor(0).setInteractive();
    this.group.add(hit);

    const valueText = scene.add.text(left + TRACK_W + 14, y, '', {
      fontFamily: 'PixelOperator', fontSize: '15px', color: '#8fae8f'
    }).setOrigin(0, 0.5).setDepth(UI_DEPTH + 2).setScrollFactor(0);
    this.group.add(valueText);

    const apply = (pct) => {
      const v = Math.max(0, Math.min(1, pct));
      const w = Math.max(2, TRACK_W * v);
      fill.clear();
      fill.fillStyle(0x4cd964, 1).fillRect(left, cy - TRACK_H / 2, w, TRACK_H);
      knob.x = left + w;
      valueText.setText(Math.round(v * 100) + '%');
      setVolume(kind, v);
      this._applyVolumeLive(kind, v);
    };
    const fromPointer = (pointer) => apply((pointer.x - left) / TRACK_W);
    hit.on('pointerdown', (pointer) => {
      this._activeSlider = fromPointer;
      fromPointer(pointer);
    });

    apply(kind === 'master' ? getSettings().masterVolume : getSettings().ambienceVolume);
  }

  // Ana ses: master gain'i hemen güncelle. Ortam sesini AmbienceSystem her frame
  // ayarlardan okuduğu için ayrıca bir şey yapmak gerekmez.
  _applyVolumeLive(kind, value) {
    if (kind !== 'master' || !this.scene.sfx) return;
    const out = this.scene.sfx._output();
    if (out) out.gain.value = value;
  }

  _addKeyRow(label, action, y) {
    const scene = this.scene;
    const cw = scene.cameras.main.width;
    this.group.add(scene.add.text(cw / 2 - PANEL_W / 2 + 24, y, label, {
      fontFamily: 'PixelOperator', fontSize: '18px', color: '#ffffff'
    }).setDepth(UI_DEPTH + 2).setScrollFactor(0));

    const btn = scene.add.rectangle(cw / 2 + PANEL_W / 2 - 90, y, 70, 30, 0x333333)
      .setDepth(UI_DEPTH + 2).setScrollFactor(0).setInteractive();
    const btnText = scene.add.text(btn.x, y, getSettings().keys[action], {
      fontFamily: 'PixelOperator', fontSize: '17px', fontStyle: 'bold', color: '#ffe9b0'
    }).setOrigin(0.5).setDepth(UI_DEPTH + 3).setScrollFactor(0);
    this.group.add(btn);
    this.group.add(btnText);
    this.keyButtons[action] = { btn, btnText };

    btn.on('pointerover', () => btn.setFillStyle(0x4a5a4a));
    btn.on('pointerout', () => btn.setFillStyle(0x333333));
    btn.on('pointerup', () => {
      if (!this.open) return;
      this.listeningAction = action;
      btnText.setText('...');
    });
  }

  _refreshKeyButtons() {
    const s = getSettings();
    for (const [action, refs] of Object.entries(this.keyButtons)) {
      refs.btnText.setText(s.keys[action]);
    }
  }

  _addBackButton(x, y) {
    const scene = this.scene;
    const btn = scene.add.rectangle(x, y, 140, 38, 0x333333)
      .setDepth(UI_DEPTH + 2).setScrollFactor(0).setInteractive();
    this.group.add(btn);
    this.group.add(scene.add.text(x, y, 'GERİ', {
      fontFamily: 'PixelOperator', fontSize: '20px', fontStyle: 'bold', color: '#ffffff'
    }).setOrigin(0.5).setDepth(UI_DEPTH + 3).setScrollFactor(0));
    btn.on('pointerover', () => btn.setFillStyle(0x4cd964));
    btn.on('pointerout', () => btn.setFillStyle(0x333333));
    btn.on('pointerup', () => { if (this.open) this.closePanel(); });
  }
}
