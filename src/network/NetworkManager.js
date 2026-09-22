import { RemotePlayer } from "../entities/RemotePlayer.js";
import { LocalServer } from "./LocalServer.js";
import { ANIM_STATE } from "../entities/AnimState.js";

const CLIENT_VERSION = "1.0.0";

const SERVER_URL =
  "http://" +
  (typeof window !== "undefined" ? window.location.hostname : "localhost") +
  ":" +
  (window.__MAPEX_SERVER_PORT || 12090);

export class NetworkManager {
  constructor(scene, name = "Oyuncu", char = 1, session = null) {
    this.scene = scene;
    this.name = name;
    this.char = char || 1;
    // Oturum dışarıdan enjekte edilir: bu sınıf hesap sistemini import etmez.
    // Yalnızca iki bilgiyi kullanır: jeton (kimlik) ve displayName (etiket).
    this.session = session;
    this.sessionToken = session && session.token ? session.token : null;
    this.remotePlayers = new Map();
    // Sunucu yoksa yerel mod aynı olayları üretir; oyun tek kişilik devam eder.
    this.socket = this._connect();
    this._bindEvents();
  }

  _connect() {
    if (typeof io !== "function") return new LocalServer(this.scene);

    // Socket.IO bağlanırken 'auth' objesi içinde sürümü fırlatıyoruz:
    const socket = io(SERVER_URL, {
      reconnectionAttempts: 1,
      timeout: 2500,
      auth: {
        version: CLIENT_VERSION,
      },
    });

    socket.on("connect_error", (err) => {
      // 🔴 SÜRÜM UYUMSUZLUĞU YAKALANDI
      if (err && err.message === "VERSION_MISMATCH") {
        console.error("[network] Sürüm Uyuşmazlığı:", err.data);

        // Yeniden bağlanma denemelerini sıfırla ki durmadan darlamasın
        if (socket.io) socket.io.reconnectionAttempts(0);
        socket.disconnect();

        // Kullanıcıya ekran overlay'i ile uyarı bas
        const overlay = document.getElementById("menu-overlay");
        if (overlay) {
          const minVer = err.data?.min || "1.0.0";
          overlay.style.display = "flex";
          overlay.innerHTML = `
            <div class="menu-card" style="text-align: center;">
              <h1 class="menu-title" style="color: #ff4757;">Güncelleme Gerekli</h1>
              <p class="menu-sub">Oyununuzun sürümü eskimiş veya uyumsuz.</p>
              <p style="font-size: 14px; color: #aaa; margin-top: 10px;">
                Mevcut: <b>${CLIENT_VERSION}</b> | Gereken: <b>${minVer}</b>
              </p>
              <p style="font-size: 12px; color: #888; margin-top: 15px;">Lütfen oyunun son sürümünü indirip tekrar girin.</p>
            </div>`;
        }
        return; // Sürüm hatası varsa LocalServer'a düşmesin, oyunu kilitlesin!
      }

      // Genel bağlantı kopmaları / sunucu kapalılığı için eski mantık (LocalServer):
      if (socket.io) socket.io.reconnectionAttempts(0);
      this._useLocalServer();
    });

    return socket;
  }

  _useLocalServer() {
    if (this.socket instanceof LocalServer) return;
    this.socket.removeAllListeners();
    this.socket.disconnect();
    this.socket = new LocalServer(this.scene);
    this._bindEvents();
    this.emit("hello", { name: this.name, char: this.char });
  }

  on(event, callback) {
    if (this.socket instanceof LocalServer) {
      this.socket.on(event, callback);
      return;
    }
    if (event === "connect" && this.socket.connected) {
      callback();
      return;
    }
    this.socket.on(event, callback);
  }

  emit(event, data) {
    this.socket.emit(event, data);
  }

  _bindEvents() {
    this.on("connect", () => {
      // sessionToken: kayıtlı oyuncunun oturumu sunucuda çözülür. Jeton yoksa
      // sunucu misafir oturumu atar; yani bu alan opsiyoneldir.
      this.emit("hello", {
        name: this.name,
        char: this.char,
        sessionToken: this.sessionToken,
      });
    });

    // Sunucu oturumu (misafir mi, kayıtlı mı) bu olayla bildirir. Oyun kodu
    // tip ayrımı yapmaz; sahne yalnızca HUD için veriyi iletir.
    this.on("sessionState", (state) => {
      if (this.scene.applySessionState) this.scene.applySessionState(state);
    });

    this.on("currentPlayers", (players) => {
      const self = this.socket.id;
      for (const player of Object.values(players || {})) {
        if (player.id !== self) this.addRemotePlayer(player);
      }
    });

    this.on("playerJoined", (info) => this.addRemotePlayer(info));

    this.on("playerMoved", (info) => {
      const remote = this.remotePlayers.get(info.id);
      if (remote)
        remote.setServerPosition(
          info.x,
          info.y,
          info.facingLeft,
          info.anim,
          info.hold,
        );
    });

    this.on("playerNameSet", (info) => {
      const remote = this.remotePlayers.get(info.id);
      if (!remote) return;
      remote.setName(info.name);
      if (info.char) remote.setCharacter(info.char);
    });

    this.on("playerLeft", (id) => {
      const remote = this.remotePlayers.get(id);
      if (!remote) return;
      remote.destroy();
      this.remotePlayers.delete(id);
    });

    this.on("worldState", (state) => {
      if (this.scene.applyWorldState) this.scene.applyWorldState(state);
    });

    this.on("objectRemoved", (data) => {
      if (this.scene.handleRemoteObjectRemoved)
        this.scene.handleRemoteObjectRemoved(data.kind, data.id);
    });

    this.on("inventoryState", (state) => {
      if (this.scene.applyInventoryState) this.scene.applyInventoryState(state);
    });

    this.on("dropsSpawned", (data) => {
      if (this.scene.drops) this.scene.drops.spawnMany(data.drops, 900);
    });

    this.on("dropRemoved", (data) => {
      if (this.scene.drops) this.scene.drops.remove(data.id);
    });

    this.on("timeState", (state) => {
      if (this.scene.dayNight) this.scene.dayNight.syncTime(state);
    });
  }

  addRemotePlayer(info) {
    if (!info || !info.id) return;
    if (this.remotePlayers.has(info.id)) return;
    const remote = new RemotePlayer(
      this.scene,
      info.id,
      info.x,
      info.y,
      info.name || "Oyuncu",
      info.char,
    );
    this.remotePlayers.set(info.id, remote);
  }

  sendMove(x, y, facingLeft, anim, hold) {
    this.emit("playerMove", { x, y, facingLeft, anim, hold });
  }

  // Dünya nesnesi kaldırıldı (kesilen ağaç, toplanan taş, akan kaya…).
  sendObjectRemoved(kind, id) {
    this.emit("objectRemoved", { kind, id });
  }

  // Kesme tamamlandı: sunucu nesneyi kaldırır, düşenleri üretir ve yayınlar.
  sendHarvest(kind, id, x, y) {
    this.emit("harvest", { kind, id, x, y });
  }

  sendPick(itemId) {
    this.emit("pick", { itemId });
  }

  // Yere eşya bırakma (soyutlama/breakdown) — her bırakılan eşya ayrı drop olur.
  sendDrop(itemId, n, x, y) {
    this.emit("drop", { itemId, n, x, y });
  }

  sendPickupDrop(id) {
    this.emit("pickup", { id });
  }

  sendTimeSkip(ms) {
    this.emit("timeSkip", { ms });
  }

  // Sohbet: sunucu mesajı doğrular, yayar ve son mesajları saklar.
  sendChat(kind, text, to) {
    this.emit("chatSend", { kind, text, to });
  }

  requestChatHistory() {
    this.emit("chatRequest");
  }

  update() {
    this.remotePlayers.forEach((remote) => remote.interpolate());
  }
}
