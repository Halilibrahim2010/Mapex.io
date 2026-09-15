// Oyuncu animasyon durumu: istemci bunu sunucuya bildirir, karşı taraf aynı
// animasyonu oynatır. Yeni bir durum eklemek için buraya bir anahtar yazmak
// ve Player/RemotePlayer içinde karşılığını vermek yeterlidir.
export const ANIM_STATE = {
  IDLE: 0,
  WALK: 1,
  CHOP: 2
};

// Sayısal durumdan animasyon anahtarını üretir (charKey: 'char3' gibi).
const SUFFIX = {
  [ANIM_STATE.IDLE]: 'idle',
  [ANIM_STATE.WALK]: 'walk',
  [ANIM_STATE.CHOP]: 'punch'
};

export function animKeyOf(charKey, state) {
  const suffix = SUFFIX[state];
  return suffix ? `${charKey}_${suffix}` : `${charKey}_idle`;
}

// Hareket vektörü ve kesme durumundan ağ üzerinden gönderilecek durumu seçer.
export function animStateOf(moveX, moveY, chopping) {
  if (chopping) return ANIM_STATE.CHOP;
  if (moveX !== 0 || moveY !== 0) return ANIM_STATE.WALK;
  return ANIM_STATE.IDLE;
}