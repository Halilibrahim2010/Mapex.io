const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});

app.use(express.static(path.join(__dirname, '..')));

const players = {};
// Kırılan ağaçlar ve alınan taşlar (sunucu yeniden başlayana kadar kalıcı)
const choppedTrees = new Set();
const removedStones = new Set();
// Kalıcı envanter: oyuncu adı başına (refresh yapsa da sayacı sürer)
const inventories = new Map();

// Deterministik oyun saati: tüm istemciler aynı saati görür.
const DAY_LENGTH_MS = 15 * 60 * 1000;
const START_HOUR = 10;
const serverStart = Date.now();
let timeSkipMs = 0;
function gameNowMs() {
  return (Date.now() - serverStart) + (START_HOUR / 24) * DAY_LENGTH_MS + timeSkipMs;
}
function timeState() {
  return { serverNow: Math.floor(gameNowMs()), dayLength: DAY_LENGTH_MS };
}
// Herkese 5 saniyede bir saat senkronizasyonu.
setInterval(() => io.emit('timeState', timeState()), 5000);

function getInventory(name) {
  if (!inventories.has(name)) inventories.set(name, { wood: 0, stone: 0 });
  return inventories.get(name);
}

io.on('connection', (socket) => {
  console.log(`Oyuncu bağlandı: ${socket.id}`);

  players[socket.id] = { x: 0, y: 0, id: socket.id, facingLeft: false, name: 'Oyuncu', char: 1 };

socket.emit('currentPlayers', players);
    socket.emit('worldState', {
      removed: [
        ...Array.from(choppedTrees).map(id => ({ kind: 'tree', id })),
        ...Array.from(removedStones).map(id => ({ kind: 'stone', id }))
      ]
    });
    socket.emit('timeState', timeState());
    socket.broadcast.emit('playerJoined', players[socket.id]);

  socket.on('setName', (data) => {
    if (!players[socket.id]) return;
    const name = typeof data === 'string' ? data : (data && data.name);
    const char = (data && Number.isInteger(data.char)) ? data.char : null;
    if (typeof name === 'string' && name.trim()) {
      players[socket.id].name = name.trim();
    }
    if (char && char >= 1 && char <= 18) {
      players[socket.id].char = char;
    }
    socket.broadcast.emit('playerNameSet', {
      id: socket.id,
      name: players[socket.id].name,
      char: players[socket.id].char || null
    });
    // İsim belirlenince kalıcı envanteri gönder (refresh sonrası geri yükleme).
    socket.emit('inventoryState', getInventory(players[socket.id].name));
  });

  socket.on('playerMove', (data) => {
    if (!players[socket.id]) return;
    players[socket.id].x = data.x;
    players[socket.id].y = data.y;
    players[socket.id].facingLeft = data.facingLeft;
    socket.broadcast.emit('playerMoved', players[socket.id]);
  });

  socket.on('objectRemoved', (data) => {
    if (!data || typeof data.id !== 'string') return;
    const kind = data.kind || 'tree';
    if (kind === 'tree') {
      choppedTrees.add(data.id);
    } else if (kind === 'stone') {
      removedStones.add(data.id);
    }
    // Taş alma senkronizasyonu: diğer oyuncular da taşı görsün
    socket.broadcast.emit('objectRemoved', { kind, id: data.id });
  });

  // Taş toplama senkronizasyonu
  socket.on('stonePicked', (data) => {
    if (!data || typeof data.id !== 'string') return;
    socket.broadcast.emit('stonePicked', data);
  });

  // İstemci envanter artışını kalıcı hale getir (odun/taş)
  socket.on('inventoryDelta', (data) => {
    const player = players[socket.id];
    if (!player) return;
    const inv = getInventory(player.name);
    const n = Math.max(0, Math.min(99, Number(data && data.n) || 0));
    if (data && data.kind === 'wood') inv.wood += n;
    else if (data && data.kind === 'stone') inv.stone += n;
    socket.emit('inventoryState', inv);
  });

  // Shift ile zaman hızlandırma: sunucu saati herkes için ilerler.
  socket.on('timeSkip', (data) => {
    const ms = Number(data && data.ms);
    if (Number.isFinite(ms) && ms > 0) {
      timeSkipMs += Math.min(ms, 30000);
      io.emit('timeState', timeState());
    }
  });

  socket.on('disconnect', () => {
    console.log(`Oyuncu ayrıldı: ${socket.id}`);
    delete players[socket.id];
    io.emit('playerLeft', socket.id);
  });
});

const PORT = process.env.PORT || 3019;
server.listen(PORT, () => console.log(`mapex.io sunucu ${PORT} portunda çalışıyor`));