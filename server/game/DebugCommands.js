// Debug komutlari: sohbet uzerinden "/komut ..." yazilir, sunucu calistirir.
// Sunucu yetkili: tum dogrulama burada, istemciye guvenilmez.
// Yeni komut eklemek icin COMMANDS'e fonksiyon ekle:
//   async (ctx, args) => ({ ok, reply, broadcast })
function findPlayerByName(players, name) {
  const wanted = String(name || '').trim().toLowerCase();
  if (!wanted) return null;
  const all = players.all();
  for (const [id, player] of Object.entries(all)) {
    if (String(player.name || '').toLowerCase() === wanted) return { id, player };
  }
  for (const [id, player] of Object.entries(all)) {
    if (String(player.name || '').toLowerCase().startsWith(wanted)) return { id, player };
  }
  return null;
}

function parseClockArg(arg) {
  const match = /^(\d{1,2}):(\d{1,2})$/.exec(String(arg || '').trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return { hour, minute };
}

const DAY_LENGTH_MS = 15 * 60 * 1000;

function currentClock(clock) {
  const ms = ((clock.now() % DAY_LENGTH_MS) + DAY_LENGTH_MS) % DAY_LENGTH_MS;
  const hour = Math.floor((ms / DAY_LENGTH_MS) * 24);
  const minute = Math.floor((((ms / DAY_LENGTH_MS) * 24) % 1) * 60);
  return { hour, minute, text: String(hour).padStart(2, '0') + ':' + String(minute).padStart(2, '0') };
}


const COMMANDS = {
  collider: async (ctx, args) => {
    const mode = String(args[0] || '').toLowerCase();
    if (mode !== 'show' && mode !== 'hide') {
      return { ok: false, reply: 'Kullanim: /collider show|hide', broadcast: null };
    }
    // Durum sunucuda saklanir: sonradan katilan oyuncular da gorur.
    const visible = mode === 'show';
    if (ctx.debugState) ctx.debugState.colliderVisible = visible;
    return {
      ok: true,
      reply: visible ? 'Hitboxlar acildi.' : 'Hitboxlar kapatildi.',
      broadcast: { event: 'debugCollider', data: { visible } }
    };
  },
  tile: async (ctx, args) => {
    const mode = String(args[0] || '').toLowerCase();
    if (mode !== 'show' && mode !== 'hide') {
      return { ok: false, reply: 'Kullanim: /tile show|hide', broadcast: null };
    }
    const visible = mode === 'show';
    if (ctx.debugState) ctx.debugState.tileVisible = visible;
    return {
      ok: true,
      reply: visible ? 'Tile izgarasi acildi.' : 'Tile izgarasi kapatildi.',
      broadcast: { event: 'debugTile', data: { visible } }
    };
  },
  time: async (ctx, args) => {
    const sub = String(args[0] || '').toLowerCase();
    if (sub === 'get') {
      const clock = currentClock(ctx.clock);
      return { ok: true, reply: 'Saat: ' + clock.text, broadcast: null };
    }
    if (sub === 'set') {
      const parsed = parseClockArg(args[1]);
      if (!parsed) {
        return { ok: false, reply: 'Kullanim: /time set SS:DD', broadcast: null };
      }
      const targetMs = ((parsed.hour * 60 + parsed.minute) / (24 * 60)) * DAY_LENGTH_MS;
      const now = currentClock(ctx.clock);
      const nowMs = ((now.hour * 60 + now.minute) / (24 * 60)) * DAY_LENGTH_MS;
      let delta = targetMs - nowMs;
      if (delta < 0) delta += DAY_LENGTH_MS;
      ctx.clock.skip(delta);
      const text = String(parsed.hour).padStart(2, '0') + ':' + String(parsed.minute).padStart(2, '0');
      return { ok: true, reply: 'Saat ' + text + ' olarak ayarlandi.', broadcast: null };
    }
    return { ok: false, reply: 'Kullanim: /time set 5:40 | /time get', broadcast: null };
  },
  player: async (ctx, args) => {
    const sub = String(args[0] || '').toLowerCase();
    const field = String(args[1] || '').toLowerCase();
    if (sub !== 'set' || field !== 'health') {
      return { ok: false, reply: 'Kullanim: /player set health <isim> <can>', broadcast: null };
    }
    const value = Number(args[3]);
    if (!args[2] || !Number.isFinite(value)) {
      return { ok: false, reply: 'Kullanim: /player set health <isim> <can>', broadcast: null };
    }
    const found = findPlayerByName(ctx.players, args[2]);
    if (!found) {
      return { ok: false, reply: '"' + args[2] + '" adli oyuncu bulunamadi.', broadcast: null };
    }
    const clamped = Math.max(0, Math.min(found.player.maxHealth || 100, Math.floor(value)));
    ctx.players.setHealth(found.id, clamped, found.player.maxHealth);
    return {
      ok: true,
      reply: found.player.name + ' cani ' + clamped + ' yapildi.',
      broadcast: {
        event: 'playerHealthUpdate',
        data: { id: found.id, health: clamped, maxHealth: found.player.maxHealth }
      }
    };
  },
  help: async () => ({
    ok: true,
    reply: 'Komutlar: /collider show|hide, /tile show|hide, /time set SS:DD, /time get, /player set health <isim> <can>',
    broadcast: null
  })
};

function isCommand(text) {
  return String(text || '').trim().startsWith('/');
}

function parse(text) {
  const parts = String(text || '').trim().slice(1).split(/\s+/).filter(Boolean);
  if (!parts.length) return null;
  return { name: parts[0].toLowerCase(), args: parts.slice(1) };
}

async function run(ctx, text) {
  if (!isCommand(text)) return null;
  const parsed = parse(text);
  if (!parsed) return { ok: false, reply: 'Bos komut. /help yaz.', broadcast: null };
  const handler = COMMANDS[parsed.name];
  if (!handler) return { ok: false, reply: 'Bilinmeyen komut: /' + parsed.name, broadcast: null };
  try {
    return await handler(ctx, parsed.args);
  } catch (error) {
    return { ok: false, reply: 'Komut hatasi: ' + error.message, broadcast: null };
  }
}

module.exports = { COMMANDS, isCommand, parse, run, findPlayerByName, parseClockArg };
