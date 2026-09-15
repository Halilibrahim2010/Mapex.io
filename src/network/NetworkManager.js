import { RemotePlayer } from '../entities/RemotePlayer.js';
import { LocalServer } from './LocalServer.js';

const SERVER_URL = 'http://' + (typeof window !== 'undefined' ? window.location.hostname : 'localhost') + ':3019';

export class NetworkManager {
  constructor(scene, name = 'Oyuncu', char = 1) {
    this.scene = scene;
    this.name = name;
    this.char = char || 1;
    this.remotePlayers = new Map();
    // Sunucu yoksa yerel mod aynı olayları üretir; oyun tek kişilik devam eder.
    this.socket = this._connect();
    this._bindEvents();
  }

  _connect() {
    if (typeof io !== 'function') return new LocalServer(this.scene);
    const socket = io(SERVER_URL, { reconnectionAttempts: 1, timeout: 2500 });
    socket.on('connect_error', () => {
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
    this.emit('hello', { name: this.name, char: this.char, trackerId: this.name });
  }

  on(event, callback) {
    if (this.socket instanceof LocalServer) {
      this.socket.on(event, callback);
      return;
    }
    if (event === 'connect' && this.socket.connected) {
      callback();
      return;
    }
    this.socket.on(event, callback);
  }

  emit(event, data) {
    this.socket.emit(event, data);
  }

  _bindEvents() {
    this.on('connect', () => {
      this.emit('hello', { name: this.name, char: this.char, trackerId: this.name });
    });

    this.on('currentPlayers', (players) => {
      const self = this.socket.id;
      for (const player of Object.values(players || {})) {
        if (player.id !== self) this.addRemotePlayer(player);
      }
    });

    this.on('playerJoined', (info) => this.addRemotePlayer(info));

    this.on('playerMoved', (info) => {
      const remote = this.remotePlayers.get(info.id);
      if (remote) remote.setServerPosition(info.x, info.y, info.facingLeft);
    });

    this.on('playerNameSet', (info) => {
      const remote = this.remotePlayers.get(info.id);
      if (!remote) return;
      remote.setName(info.name);
      if (info.char) remote.setCharacter(info.char);
    });

    this.on('playerLeft', (id) => {
      const remote = this.remotePlayers.get(id);
      if (!remote) return;
      remote.destroy();
      this.remotePlayers.delete(id);
    });

    this.on('worldState', (state) => {
      if (this.scene.applyWorldState) this.scene.applyWorldState(state);
    });

    this.on('objectRemoved', (data) => {
      if (this.scene.handleRemoteObjectRemoved) this.scene.handleRemoteObjectRemoved(data.kind, data.id);
    });

    this.on('inventoryState', (state) => {
      if (this.scene.applyInventoryState) this.scene.applyInventoryState(state);
    });

    this.on('dropsSpawned', (data) => {
      if (this.scene.drops) this.scene.drops.spawnMany(data.drops, 900);
    });

    this.on('dropRemoved', (data) => {
      if (this.scene.drops) this.scene.drops.remove(data.id);
    });

    this.on('timeState', (state) => {
      if (this.scene.dayNight) this.scene.dayNight.syncTime(state);
    });
  }

  addRemotePlayer(info) {
    if (!info || !info.id) return;
    if (this.remotePlayers.has(info.id)) return;
    const remote = new RemotePlayer(this.scene, info.id, info.x, info.y, info.name || 'Oyuncu', info.char);
    this.remotePlayers.set(info.id, remote);
  }

  sendMove(x, y, facingLeft) {
    this.emit('playerMove', { x, y, facingLeft });
  }

  // Dünya nesnesi kaldırıldı (kesilen ağaç, toplanan taş, akan kaya…).
  sendObjectRemoved(kind, id) {
    this.emit('objectRemoved', { kind, id });
  }

  // Kesme tamamlandı: sunucu istatistik ve dünya durumunu günceller.
  sendHarvest(kind, id) {
    this.emit('harvest', { kind, id });
  }

  sendPick(itemId) {
    this.emit('pick', { itemId });
  }

  // Yere eşya bırakma (soyutlama/breakdown) — her bırakılan eşya ayrı drop olur.
  sendDrop(itemId, n, x, y) {
    this.emit('drop', { itemId, n, x, y });
  }

  sendPickupDrop(id) {
    this.emit('pickup', { id });
  }

  sendTimeSkip(ms) {
    this.emit('timeSkip', { ms });
  }

  update() {
    this.remotePlayers.forEach((remote) => remote.interpolate());
  }
}