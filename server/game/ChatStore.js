// Sohbet sunucu tarafı: mesajları doğrular, saklar ve yayar.
// - Genel mesaj (chat): herkese
// - Özel mesaj (private): yalnızca alıcıya (gönderen kendi yankısını yerel çizer)
// "Server authority": doğrulama burada yapılır, istemciye güvenilmez.
const MAX_TEXT = 140;
const MAX_NAME = 16;
const HISTORY_SIZE = 50;

// İki mesaj arasında beklenmesi gereken en kısa süre (spam koruması).
const MIN_INTERVAL_MS = 300;

class ChatStore {
  constructor() {
    // Eski tarihli bir zaman damgası: ilk mesaj her zaman gönderilebilir.
    this.lastAt = 0;
    this.history = [];
    this.seq = 0;
  }

  // İstemciden gelen mesajı doğrular; geçersizse null döner.
  sanitize(data, player) {
    if (!data || !player) return null;
    const text = String(data.text || '').replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT);
    if (!text) return null;
    const now = Date.now();
    if (now - this.lastAt < MIN_INTERVAL_MS) return null;
    this.lastAt = now;
    const kind = data.kind === 'private' ? 'private' : 'chat';
    const to = kind === 'private' ? this.sanitizeName(data.to) : null;
    if (kind === 'private' && !to) return null;
    return this.store({ kind, fromId: player.id, from: player.name, to, text });
  }

  sanitizeName(value) {
    const name = String(value || '').trim().slice(0, MAX_NAME);
    return name || null;
  }

  // Mesajı numaralandırıp geçmişe ekler (aynı anda herkes aynı sırayı görür).
  store(message) {
    const entry = { id: ++this.seq, ...message, at: Date.now() };
    this.history.push(entry);
    if (this.history.length > HISTORY_SIZE) {
      this.history.splice(0, this.history.length - HISTORY_SIZE);
    }
    return entry;
  }

  // Bir oyuncunun görebileceği son mesajlar: genel + ona gelen/giden özel.
  historyFor(player) {
    return this.history.filter((entry) => {
      if (entry.kind !== 'private') return true;
      return entry.to === player.name || entry.from === player.name;
    });
  }
}

module.exports = { ChatStore, MAX_TEXT, MAX_NAME, HISTORY_SIZE, MIN_INTERVAL_MS };