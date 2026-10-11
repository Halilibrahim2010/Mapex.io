const express = require("express");
const http = require("http");
const fs = require("fs");
const path = require("path");
const { Server } = require("socket.io");

const { GameWorld } = require("./game/GameWorld");
const { GameClock, PlayerRegistry } = require("./game/GameClock");
const { InventoryStore } = require("./game/InventoryStore");
const { attachSocketHandlers } = require("./game/SocketHandlers");
const { createAuthLayer, tryCreatePrismaClient } = require("./auth");
const { PrismaUserRepository } = require("./auth/PrismaUserRepository");
const { createAuthRouter, limiterResetRoute } = require("./auth/routes");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// MIN ve MAX sürüm limitlerin
const MIN_VERSION = "1.1.1";
const MAX_VERSION = "1.1.1";

// Semver mantığı veya basit string/float kıyaslaması için yardımcı fonksiyon
function isVersionAllowed(v) {
  if (!v) return false;
  // Tek sürüm mantığı için direkt eşitlik kontrolü veya versiyon kıyası yapabilirsin:
  return v >= MIN_VERSION && v <= MAX_VERSION;
}

// Socket.IO Middleware: İstemci bağlanmaya çalıştığı AN bu çalışır
io.use((socket, next) => {
  const clientVersion =
    socket.handshake.auth.version || socket.handshake.query.version;

  if (!isVersionAllowed(clientVersion)) {
    console.warn(
      `[Sunucu] Uyumsuz sürüm reddedildi: ${clientVersion || "Sürüm Yok"}`,
    );

    // Bağlantıyı reddet ve hatayı istemciye fırlat
    const err = new Error("VERSION_MISMATCH");
    err.data = { min: MIN_VERSION, max: MAX_VERSION, current: clientVersion };
    return next(err);
  }

  // Sürüm uyumluysa geçişe izin ver
  next();
});

const url = "http://127.0.0.1:12090/";
const text = "Oyun sunucusu çalışıyor";

const CLIENT_ROOT = path.join(__dirname, "..");
app.use(express.static(CLIENT_ROOT));
// İstemci ve sunucu aynı tanım dosyasını okur (tek doğruluk kaynağı).
app.use("/shared", express.static(path.join(CLIENT_ROOT, "shared")));

// Auth katmanı tamamen bağımsız kurulur: veritabanı varsa Prisma, yoksa bellek.
// Oyun çekirdeği bu katmanın varlığından habersizdir; yalnızca oturum nesnesini
// tüketir. Veritabanı olmadan da sunucu eksiksiz çalışır (misafir modu).
const prisma = tryCreatePrismaClient();
const authLayer = createAuthLayer({
  repository: prisma ? new PrismaUserRepository(prisma) : undefined,
  mode: prisma ? "Harici Veritabanı" : "Dahili Bellek",
});
app.use("/auth", createAuthRouter(authLayer));
// Test kancası: yalnızca MAPEX_ALLOW_TEST_HOOKS=1 iken çalışır.
app.get("/auth/__reset-limits", limiterResetRoute(authLayer));
console.log(`[Yetkilendirme] oturum katmanı hazır (${authLayer.mode})`);

const world = new GameWorld();
const store = new InventoryStore(world);
const players = new PlayerRegistry();
const clock = new GameClock(io);

clock.start();
const gameHandlers = attachSocketHandlers(
  io,
  world,
  store,
  clock,
  players,
  authLayer,
);

function startTerminal() {
  // Terminal REPL: client sohbetinde yazılan /komutlar buradan da çalıştırılabilir
  // (aynı DebugCommands havuzu). Yayın (io.emit) tüm istemcilere gider.
  const readline = require("readline");
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: "mapex> ",
  });
  console.log(
    "[Terminal] /komut yazabilirsin (örn. /collider show, /tile show, /help). Kapat: /exit",
  );
  rl.prompt();
  rl.on("line", async (line) => {
    const text = String(line || "").trim();
    if (text) {
      if (text === "/exit" || text === "exit") {
        console.log("[Terminal] Sunucu kapatılıyor...");
        process.exit(0);
      }
      try {
        const result = await gameHandlers.runCommand(text);
        if (result && result.reply) console.log(result.reply);
      } catch (error) {
        console.error("[Terminal] Komut hatası:", error.message);
      }
    }
    rl.prompt();
  });
}

// Sunucu ayarları shared/serverSettings.json'dan okunur (yeni port: 12090).
const serverSettingsPath = path.join(
  __dirname,
  "..",
  "shared",
  "serverSettings.json",
);

let serverSettings = { port: 12090, corsOrigin: "*" };
try {
  serverSettings = {
    ...serverSettings,
    ...JSON.parse(fs.readFileSync(serverSettingsPath, "utf8")),
  };
} catch (error) {
  console.warn(
    "[Sunucu] serverSettings.json okunamadı, varsayılanlar kullanılıyor:",
    error.message,
  );
}

const PORT = process.env.PORT || serverSettings.port;
server.listen(PORT, () => {
  console.log(
    `\u001b[32m[Sunucu]\u001b[0m \u001b]8;;${url}\u0007${text}\u001b]8;;\u0007`,
  );
  startTerminal();
});
