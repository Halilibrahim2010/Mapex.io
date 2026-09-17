// Sohbet sabitleri ve mesaj turleri: kullanici adina gore mesaj
// hesaplanirken bu sabitler kullanilir (# ozel, @ bahsetme, duz genel).

export const CHAT_KIND = {
  MESSAGE: 'chat',      // genel sohbet mesaji
  PRIVATE: 'private',   // # ile sadece bir oyuncuya ozel mesaj
  MENTION: 'mention'    // @ ile bir oyuncudan bahseden mesaj
};

export const MAX_NAME_LENGTH = 16;   // giris menusundeki sinirla ayni
export const MAX_MESSAGE_LENGTH = 140;

// Isim eslesmesi buyuk/kucuk harf duyarsiz ve yalnizca kelime olarak yapilir:
// "@e" yazinca "@eren" de bahsedilmis sayilmaz.
export function isNameMentioned(text, name) {
  if (!text || !name) return false;
  const escaped = name.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (!escaped) return false;
  return new RegExp('(?<![\\w@])@' + escaped + '(?![\\w])', 'i').test(text);
}

// Metinde "#" ile cagrilan isimden sonra gelen kismi dondurur.
// Ornek: "selam #ali nasilsin" -> "nasilsin"
export function privateBodyAfter(text, name) {
  if (!text || !name) return null;
  const escaped = name.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (!escaped) return null;
  const match = new RegExp('(?<![\\w@])#' + escaped + '(?![\\w])\\s*([\\s\\S]*)', 'i').exec(text);
  return match ? match[1].trim() : null;
}