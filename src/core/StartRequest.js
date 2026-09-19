// Menü ile oyun sahnesi arasındaki başlangıç isteği. Sahne, asset yüklemesi
// menü tıklamasından sonra tamamlanırsa isteği buradan okuyup uygular.
export const startRequest = { name: null, char: null, session: null, options: null, pending: false };

const HOOK = 'mapex:start';

window.addEventListener(HOOK, (event) => {
  startRequest.name = event.detail.name;
  startRequest.char = event.detail.char;
  // Oturum da burada taşınır: sahne hesap sistemini import etmek zorunda kalmaz.
  startRequest.session = event.detail.session || null;
  startRequest.options = event.detail.options || null;
  startRequest.pending = true;
});

// Sahne hazır olduğunda çağrılır: bekleyen istek varsa hemen başlatır, yoksa
// sonraki menü tıklamasını dinler.
export function consumeStartRequest(onStart) {
  if (startRequest.pending) {
    const { name, char, session, options } = startRequest;
    startRequest.pending = false;
    onStart(name, char, session, options);
    return;
  }
  window.addEventListener(HOOK, (event) => onStart(event.detail.name, event.detail.char, event.detail.session, event.detail.options), { once: true });
}