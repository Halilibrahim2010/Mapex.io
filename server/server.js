const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

const { GameWorld } = require('./game/GameWorld');
const { GameClock, PlayerRegistry } = require('./game/GameClock');
const { InventoryStore } = require('./game/InventoryStore');
const { attachSocketHandlers } = require('./game/SocketHandlers');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const CLIENT_ROOT = path.join(__dirname, '..');
app.use(express.static(CLIENT_ROOT));
// İstemci ve sunucu aynı tanım dosyasını okur (tek doğruluk kaynağı).
app.use('/shared', express.static(path.join(CLIENT_ROOT, 'shared')));

const world = new GameWorld();
const store = new InventoryStore(world);
const players = new PlayerRegistry();
const clock = new GameClock(io);

clock.start();
attachSocketHandlers(io, world, store, clock, players);

const PORT = process.env.PORT || 3019;
server.listen(PORT, () => console.log(`mapex.io sunucu ${PORT} portunda çalışıyor`));