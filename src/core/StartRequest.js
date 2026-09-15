// Menü ile oyun sahnesi arasındaki başlangıç isteği. Sahne, asset yüklemesi
// menü tıklamasından sonra tamamlanırsa isteği buradan okuyup uygular.
export const startRequest = { name: null, char: null, pending: false };

const HOOK = 'mapex:start';

window.addEventListener(HOOK, (event) => {
  startRequest.name = event.detail.name;
  startRequest.char = event.detail.char;
  startRequest.pending = true;
});

// Sahne hazır olduğunda çağrılır: bekleyen istek varsa hemen başlatır, yoksa
// sonraki menü tıklamasını dinler.
export function consumeStartRequest(onStart) {
  if (startRequest.pending) {
    const { name, char } = startRequest;
    startRequest.pending = false;
    onStart(name, char);
    return;
  }
  window.addEventListener(HOOK, (event) => onStart(event.detail.name, event.detail.char), { once: true });
}