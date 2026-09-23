// Sohbet ag katmani: ChatModel'i NetworkManager'a baglar. Gelen mesajlari
// modele yazar, gonderirken # / @ cozumlemesini yapar. Sunucu yalnizca
// dogrulanmis mesaji yayinlar (sunucu yetkisi korunur).
import { ChatModel } from './ChatModel.js';
import { CHAT_KIND, MAX_NAME_LENGTH, isNameMentioned, privateBodyAfter } from './ChatTypes.js';
import { getSettings } from '../core/GameSettings.js';

export class ChatService {
  constructor(scene) {
    this.scene = scene;
    this.model = new ChatModel();
    this.displayName = '';
    this.network = null;
    this._attached = false;
  }

  get name() { return this.displayName; }

  // Oyuncu adi kesinlesince cagrilir: kendi mesajlarimizi tanimak icin gerekli.
  setPlayerName(name) {
    this.displayName = String(name || 'Oyuncu').slice(0, MAX_NAME_LENGTH);
    this.syncSettings();
  }

  // Ayarlardaki sohbet adi/ek kelimeler modele aktarilir. Ayarlar degistiginde
  // yeniden cagrilir; boylece kullanicinin yaptigi degisiklik aninda gecerli olur.
  syncSettings() {
    this.model.chatName = getSettings().chatName;
    this.model.playerName = this.displayName;
  }

  // "Ben" sayilan adlar: oyuncu adi + ayarlardaki sohbet adi.
  ownNames() {
    const names = [this.displayName];
    const extra = getSettings().chatName;
    if (extra) names.push(extra);
    return names.filter(Boolean);
  }

  // Ag hazir olunca: olaylari bagla, sunucudan son mesajlari iste.
  attach(network) {
    if (!network || this._attached) return;
    this._attached = true;
    this.network = network;
    network.on('chatMessage', (message) => this.onIncoming(message));
    network.on('chatHistory', (messages) => this.onHistory(messages));
    // Yeniden baglanmada gecmis tekrar istenir: son mesajlar geri gelir.
    network.on('connect', () => network.emit('chatRequest'));
    network.emit('chatRequest');
  }

  // --- Gelen ---------------------------------------------------------------

  onIncoming(message) {
    if (!message || !message.text) return;
    // Kendi gönderdiğimiz mesajların sunucu yankılarını yok say (çift mesajı engelle)
    if (this.isMe(message.from)) return;

    if (message.kind === CHAT_KIND.PRIVATE) {
      if (!this.isForMe(message.to)) return;
    }
    this.model.applyIncoming(message);
    if (this.scene.chatBox) this.scene.chatBox.markDirty();
  }

  onHistory(messages) {
    for (const message of messages || []) this.onIncoming(message);
  }

  isMe(name) {
    return this.ownNames().some((candidate) => candidate.toLowerCase() === String(name || '').toLowerCase());
  }

  isForMe(name) { return this.isMe(name); }

  // --- Gonderim ------------------------------------------------------------

  // Metni cozumler ve gonderir. { error } donerse ChatBox sistem satiri yazar.
  send(text) {
    const value = String(text || '').trim();
    if (!value) return { error: 'Bos mesaj gonderilemez.' };
    if (!this.network) return { error: 'Baglanti yok: mesaj gonderilemedi.' };

    const privateMessage = this.resolvePrivateMessage(value);
    if (privateMessage) {
      if (!privateMessage.target) return { error: `"${privateMessage.name}" adli oyuncu bulunamadi.` };
      if (!privateMessage.body) return { error: 'Ozel mesaj metni bos olamaz.' };
      this.network.emit('chatSend', {
        kind: CHAT_KIND.PRIVATE, to: privateMessage.target, text: privateMessage.body
      });
      // Kendi gonderdigimiz mesaj gunluge hemen duser (yerel yanki).
      this.model.add({
        kind: CHAT_KIND.PRIVATE, from: this.displayName, to: privateMessage.target, text: privateMessage.body
      });
      this.model.remember(value);
      return { ok: true };
    }

    this.network.emit('chatSend', { kind: CHAT_KIND.MESSAGE, text: value });
    this.model.add({ kind: CHAT_KIND.MESSAGE, from: this.displayName, text: value });
    this.model.remember(value);
    return { ok: true };
  }

  // "#isim mesaj" bicimini cozer: { name, target, body } | null.
  resolvePrivateMessage(text) {
    const match = /#([\w\u00c0-\u024f]+)/.exec(text);
    if (!match) return null;
    const requested = match[1];
    return {
      name: requested,
      target: this._findPlayer(requested),
      body: (privateBodyAfter(text, requested) || '').trim()
    };
  }

  // Tam eslesme > on ek eslesmesi sirasiyla aranir (kisa yazmak yeterli olsun).
  _findPlayer(name) {
    const wanted = String(name || '').toLowerCase();
    if (!wanted) return null;
    if (this.ownNames().some((own) => own.toLowerCase() === wanted)) return this.displayName;
    const names = this.remoteNames();
    const exact = names.find((candidate) => candidate.toLowerCase() === wanted);
    if (exact) return exact;
    return names.find((candidate) => candidate.toLowerCase().startsWith(wanted)) || null;
  }

  remoteNames() {
    const network = this.network;
    if (!network || !network.remotePlayers) return [];
    const names = [];
    for (const remote of network.remotePlayers.values()) {
      if (remote.name) names.push(remote.name);
    }
    return names;
  }

  // Bahsetme cozumlemesi ChatModel tarafinda yapilir; bu yardimci yalnizca
  // mesajdaki bahsetme sayisini verir (testler ve ileride rozet icin).
  mentionCount(text) {
    let count = 0;
    for (const name of this.mentionNames()) {
      if (isNameMentioned(text, name)) count++;
    }
    return count;
  }

  // Bahsetme icin gecerli adlar: sohbet adi + ek kelimeler + oyuncu adi.
  // Sohbet adi ayarlanmamis olsa da oyuncu adiyla bahsedilebilmelidir.
  mentionNames() {
    const names = new Set(this.model.names());
    for (const own of this.ownNames()) names.add(own);
    return Array.from(names);
  }
}