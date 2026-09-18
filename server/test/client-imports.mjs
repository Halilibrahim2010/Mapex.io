// İstemci modüllerinin yükleme grafını (ve döngüsel import olmadığını) doğrular.
// Phaser ve DOM stub'lanır; yalnızca modüllerin hatasız yüklendiği kontrol edilir.
// Çalıştır:  node server/test/client-imports.mjs
let failed = false;

global.window = {
  addEventListener: () => {},
  dispatchEvent: () => {},
  innerWidth: 1280,
  innerHeight: 720,
  location: { hostname: 'localhost', protocol: 'http:', port: '3019', href: 'http://localhost:3019/' }
};
global.document = {
  getElementById: () => null,
  querySelectorAll: () => [],
  createElement: () => ({ style: {}, classList: { add() {}, remove() {} }, addEventListener() {} }),
  addEventListener: () => {}
};
global.Phaser = {
  Scene: class {},
  AUTO: 0,
  Game: class {},
  Math: { Distance: { Between: () => 0 } },
  Physics: { Arcade: { Sprite: class {}, Image: class {} } },
  GameObjects: { Container: class {}, Sprite: class {}, Text: class {}, Graphics: class {} }
};
global.fetch = async () => ({ ok: true, status: 200, json: async () => ({}) });
global.location = { hostname: 'localhost', protocol: 'http:', port: '3019', href: 'http://localhost:3019/' };

const modules = [
  'src/core/ObjectDefs.js',
  'src/core/Inventory.js',
  'src/core/WorldGenerator.js',
  'src/core/StartRequest.js',
  'src/chat/ChatTypes.js',
  'src/chat/ChatModel.js',
  'src/chat/ChatService.js',
  'src/account/ClientSession.js',
  'src/account/AuthApi.js',
  'src/account/SessionProvider.js',
  'src/ui/AccountRules.js',
  'src/scenes/PreloadScene.js',
  'src/scenes/MainScene.js'
];

for (const file of modules) {
  const url = new URL(`../../${file}`, import.meta.url).href;
  try {
    await import(url);
    console.log(`OK   ${file}`);
  } catch (error) {
    console.log(`HATA ${file}`);
    console.log('     ' + error.message);
    failed = true;
  }
}

console.log(failed ? 'İstemci modül import testi BAŞARISIZ' : 'İstemci modül import testi geçti');
process.exit(failed ? 1 : 0);