import { RoomManager, generateRoomCode } from '../game/RoomManager.js';

const results = [];
function check(name, ok, extra = '') {
  results.push({ name, ok });
  console.log((ok ? '   ✓ ' : '   ✗ ') + name + (extra ? ' — ' + extra : ''));
}
	async function runTests() {
  console.log('\n== Lobby & Oda Yonetimi ==');

  // 1. Kod Uretimi
  const set = new Map();
  const code1 = generateRoomCode(set);
  check('7 haneli kod uretilmeli', code1.length === 7 && /^[A-Z0-9]{7}$/.test(code1), code1);

  // 2. RoomManager & Public Odalar
  const mgr = new RoomManager(null);
  const publicOff = mgr.getRoom('public_ff_off');
  const publicOn = mgr.getRoom('public_ff_on');
  check('Public Co-op oda var', Boolean(publicOff) && !publicOff.friendlyFire);
  check('Public PvP oda var', Boolean(publicOn) && publicOn.friendlyFire);

  // 3. Ozel Lobby Olusturma
  const lobby = await mgr.createLobby({
    name: 'Mapex Ozel',
    password: 'password123',
    maxPlayers: 4,
    friendlyFire: true
  });
  check('Lobby olusturuldu', Boolean(lobby && lobby.ok), lobby.code);
  check('Lobby dost atesi dogru', lobby.friendlyFire === true);
  check('Lobby max oyuncu siniri dogru', lobby.maxPlayers === 4);
  check('Lobby sifreli isaretlendi', lobby.hasPassword === true);

  // 4. Lobby'e Katilma - Dogru Sifre
  const joinOK = await mgr.joinLobby({
    code: lobby.code,
    password: 'password123'
  });
  check('Dogru sifreyle katilindi', joinOK.ok === true);

  // 5. Lobby'e Katilma - Yanlis Sifre
  let wrongPassFail = false;
  try {
    await mgr.joinLobby({ code: lobby.code, password: 'wrong' });
  } catch (err) {
    wrongPassFail = true;
  }
  check('Yanlis sifre reddedildi', wrongPassFail);

  // 6. Olmayan Oda Kodu Reddi
  let noRoomFail = false;
  try {
    await mgr.joinLobby({ code: 'XYZ9999' });
  } catch (err) {
    noRoomFail = true;
  }
  check('Olmayan oda kodu reddedildi', noRoomFail);

  // 7. Maksimum Oyuncu Limiti Kontrolu
  const roomInstance = mgr.getRoom(lobby.code);
  for (let i = 0; i < 4; i++) roomInstance.players.create(`socket_${i}`);
  let fullFail = false;
  try {
    await mgr.joinLobby({ code: lobby.code, password: 'password123' });
  } catch (err) {
    fullFail = true;
  }
  check('Dolu odaya katilma reddedildi', fullFail);

  const allOk = results.every((r) => r.ok);
  console.log(allOk ? '\nLobby ve oda testleri GECTI' : '\nBazi lobby testleri basarisiz');
  process.exit(allOk ? 0 : 1);
}

runTests();
