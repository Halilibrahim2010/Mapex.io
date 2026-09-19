const express = require('express');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { Server } = require('socket.io');

const { GameWorld } = require('./game/GameWorld');
const { GameClock, PlayerRegistry } = require('./game/GameClock');
const { InventoryStore } = require('./game/InventoryStore');
const { attachSocketHandlers } = require('./game/SocketHandlers');
const { createAuthLayer, tryCreatePrismaClient } = require('./auth');
const { PrismaUserRepository } = require('./auth/PrismaUserRepository');
const { createAuthRouter, limiterResetRoute } = require('./auth/routes');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const CLIENT_ROOT = path.join(__dirname, '..');
app.use(express.static(CLIENT_ROOT));
// İstemci ve sunucu aynı tanım dosyasını okur (tek doğruluk kaynağı).
app.use('/shared', express.static(path.join(CLIENT_ROOT, 'shared')));

// Auth katmanı tamamen bağımsız kurulur: veritabanı varsa Prisma, yoksa bellek.
// Oyun çekirdeği bu katmanın varlığından habersizdir; yalnızca oturum nesnesini
// tüketir. Veritabanı olmadan da sunucu eksiksiz çalışır (misafir modu).
const prisma = tryCreatePrismaClient();
const authLayer = createAuthLayer({
  repository: prisma ? new PrismaUserRepository(prisma) : undefined,
  mode: prisma ? 'prisma' : 'memory'
});
app.use('/auth', createAuthRouter(authLayer));
// Test kancası: yalnızca MAPEX_ALLOW_TEST_HOOKS=1 iken çalışır.
app.get('/auth/__reset-limits', limiterResetRoute(authLayer));
console.log(`[auth] oturum katmanı hazır (${authLayer.mode})`);

const world = new GameWorld();
const store = new InventoryStore(world);
const players = new PlayerRegistry();
const clock = new GameClock(io);

clock.start();
attachSocketHandlers(io, world, store, clock, players, authLayer);

// Sunucu ayarları shared/serverSettings.json'dan okunur (yeni port: 12090).
const serverSettingsPath = path.join(__dirname, '..', 'shared', 'serverSettings.json');
let serverSettings = { port: 12090, corsOrigin: '*' };
try {
  serverSettings = { ...serverSettings, ...JSON.parse(fs.readFileSync(serverSettingsPath, 'utf8')) };
} catch (error) {
  console.warn('[server] serverSettings.json okunamadı, varsayılanlar kullanılıyor:', error.message);
}

const PORT = process.env.PORT || serverSettings.port;
server.listen(PORT, () => console.log(`mapex.io sunucu ${PORT} portunda çalışıyor`));