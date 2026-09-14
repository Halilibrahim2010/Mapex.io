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
// Kırılan ağaçlar (sunucu yeniden başlayana kadar kalıcı)
const choppedTrees = new Set();

io.on('connection', (socket) => {
  console.log(`Oyuncu bağlandı: ${socket.id}`);

  players[socket.id] = { x: 0, y: 0, id: socket.id, facingLeft: false, name: 'Oyuncu', char: 1 };

socket.emit('currentPlayers', players);
    socket.emit('worldState', { removed: Array.from(choppedTrees).map(id => ({ kind: 'tree', id })) });
    socket.broadcast.emit('playerJoined', players[socket.id]);

  // İstemci artık { name, char } gönderir; eski istemcilerin düz string'i de desteklenir
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
    }
    // Taş alma senkronizasyonu: diğer oyuncular da taşı görsün
    socket.broadcast.emit('objectRemoved', { kind, id: data.id });
  });

  // Taş toplama senkronizasyonu
  socket.on('stonePicked', (data) => {
    if (!data || typeof data.id !== 'string') return;
    socket.broadcast.emit('stonePicked', data);
  });

  socket.on('disconnect', () => {
    console.log(`Oyuncu ayrıldı: ${socket.id}`);
    delete players[socket.id];
    io.emit('playerLeft', socket.id);
  });
});

const PORT = process.env.PORT || 3019;
server.listen(PORT, () => console.log(`mapex.io sunucu ${PORT} portunda çalışıyor`));