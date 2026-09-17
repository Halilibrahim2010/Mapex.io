// Sohbet durumu (agdan bagimsiz saf veri): gunluk, bahsetme listesi ve
// gecmis oku. Ag ve cizim isini ChatService/ChatBox yapar; burada Phaser yok.
import { getSettings } from '../core/GameSettings.js';
import { isNameMentioned } from './ChatTypes.js';

const LOOKBACK_SIZE = 50;        // yukari/asagi okla gezilen kendi mesajlarimiz
const UNREAD_SIZE = 500;         // tutulan en fazla mesaj

export class ChatModel {
  constructor() {
    this.journal = [];
    this.seq = 0;
    this.mentions = [];            // bize gelen (henuz okunmamis) bahsetmeler
    this.privateUnread = [];       // bize gelen (henuz okunmamis) ozel mesajlar
    this.lookback = [];            // son gonderdigimiz mesajlar (eski → yeni)
    this.lookbackIndex = 0;
    this.playerName = '';          // ChatService tarafindan set edilir
    this.chatName = '';            // ayarlardaki sohbet adi (kimlik icin)
  }

  // Kendi adlarimiz: oyuncu adi + ayarlardaki sohbet adi. Bir mesajin
  // "bizden" sayilip sayilmadigi yalnizca bu listeye bakilarak karar verilir.
  identityNames() {
    const names = new Set();
    for (const value of [this.playerName, this.chatName]) {
      const name = String(value || '').trim();
      if (name) names.add(name);
    }
    return Array.from(names);
  }

  // Bahsetme icin gecerli adlar: kimlik adlari + ek bahsetme kelimeleri.
  // Ek kelimeler yalnizca bahsetme eslesmesinde kullanilir; gonderici
  // kimligini belirlemez (aksi halde "ali" kelimesi "Ali" adli oyuncunun
  // mesajini kendimizden sanmamiza yol acardi).
  names() {
    const names = new Set(this.identityNames());
    for (const word of String(getSettings().chatMentions || '').split(',')) {
      const name = word.trim();
      if (name) names.add(name);
    }
    return Array.from(names);
  }

  // Gonderici/hedef biz miyiz? Yalnizca kimlik adlari.
  isSelf(value) {
    const wanted = String(value || '').toLowerCase();
    return this.identityNames().some((name) => name.toLowerCase() === wanted);
  }

  add(entry) {
    const message = {
      id: entry.id !== undefined ? entry.id : ++this.seq,
      kind: entry.kind || 'chat',
      fromId: entry.fromId || null,
      from: entry.from || 'Oyuncu',
      to: entry.to || null,
      text: entry.text || '',
      at: entry.at || Date.now()
    };
    if (entry.id !== undefined) this.seq = Math.max(this.seq, entry.id);
    this.journal.push(message);
    if (this.journal.length > UNREAD_SIZE) this.journal.splice(0, this.journal.length - UNREAD_SIZE);
    return message;
  }

  pushMention(name) {
    if (!name) return;
    this.mentions.push(name);
  }

  pushPrivate(from) {
    if (!from) return;
    this.privateUnread.push(from);
  }

  // Bildirim metinlerini uretir ve kuyrugu bosaltir (ChatBox cagirir).
  takeNotifications() {
    const notes = [];
    for (const name of this.mentions) notes.push({ kind: 'mention', text: `${name} sohbette senden bahsetti.` });
    for (const name of this.privateUnread) notes.push({ kind: 'private', text: `${name} sana ozel mesaj gonderdi.` });
    this.mentions.length = 0;
    this.privateUnread.length = 0;
    return notes;
  }

  // Yukari/asagi ok: gonderme gecmisinde gezinir. Ilk yukari ok en yeni
  // mesaji getirir; asagi ok gecmisin sonuna gelince kutu bosalir.
  // currentText yalnizca "gecmis yok" durumunda korunur.
  navigate(direction, currentText = '') {
    if (!this.lookback.length) return currentText;
    if (this.lookbackIndex >= this.lookback.length) {
      if (direction !== -1) return currentText;
      this.lookbackIndex = this.lookback.length - 1;
      return this.lookback[this.lookbackIndex];
    }
    const next = this.lookbackIndex + direction;
    if (next >= this.lookback.length) {
      this.lookbackIndex = this.lookback.length;
      return '';
    }
    this.lookbackIndex = Math.max(0, next);
    return this.lookback[this.lookbackIndex];
  }

  remember(text) {
    const value = String(text || '').trim();
    if (!value) return;
    this.lookback.push(value);
    if (this.lookback.length > LOOKBACK_SIZE) this.lookback.splice(0, this.lookback.length - LOOKBACK_SIZE);
    this.lookbackIndex = this.lookback.length;
  }

  // Gelen mesaji gunluge yaz, bahsetme/ozel kuyrugunu doldur. Sunucu ozel
  // mesaji yalnizca hedefe ve gonderene yollar; yine de burada da suzulur:
  // boylece yerel mod veya hatali bir paket gunluge sizamaz.
  applyIncoming(message) {
    if (!message || !message.text) return null;
    if (message.kind === 'private') {
      if (!message.to) return null;
      if (!this.isSelf(message.to)) return null;
      const stored = this.add({
        kind: 'private', fromId: message.fromId, from: message.from, to: message.to, text: message.text
      });
      // Kendi gonderdigimiz mesaja bildirim cikmaz: gonderici bizsek bildirim yok.
      if (!this.isSelf(message.from)) this.pushPrivate(message.from);
      return stored;
    }
    if (this.isSelf(message.from)) return this.add({
      kind: 'chat', fromId: message.fromId, from: message.from, text: message.text
    });
    for (const name of this.names()) {
      if (isNameMentioned(message.text, name)) {
        this.pushMention(message.from || 'Birisi');
        break;
      }
    }
    return this.add({ kind: 'chat', fromId: message.fromId, from: message.from, text: message.text });
  }
}