import { RemotePlayer } from '../entities/RemotePlayer.js';

export class NetworkManager {
  constructor(scene, serverUrl = 'http://localhost:3019', name = 'Oyuncu', char = 1) {
    this.scene = scene;
    this.name = name;
    this.char = char || 1;
    this.socket = io(serverUrl);
    this.remotePlayers = new Map();

    this.socket.on('connect', () => {
      console.log('Sunucuya bağlandı, id:', this.socket.id);
      // Karakter seçimi de isimle birlikte gönderilir
      this.socket.emit('setName', { name: this.name, char: this.char });
    });

    this.socket.on('currentPlayers', (players) => {
      Object.values(players).forEach((p) => {
        if (p.id !== this.socket.id) this.addRemotePlayer(p);
      });
    });

    this.socket.on('playerJoined', (playerInfo) => {
      this.addRemotePlayer(playerInfo);
    });

    this.socket.on('playerMoved', (playerInfo) => {
      const rp = this.remotePlayers.get(playerInfo.id);
      if (rp) rp.setServerPosition(playerInfo.x, playerInfo.y, playerInfo.facingLeft);
    });

    this.socket.on('playerNameSet', (info) => {
      const rp = this.remotePlayers.get(info.id);
      if (rp) {
        rp.setName(info.name);
        if (info.char) rp.setCharacter(info.char);
      }
    });

    this.socket.on('playerLeft', (id) => {
      const rp = this.remotePlayers.get(id);
      if (rp) {
        rp.destroy();
        this.remotePlayers.delete(id);
      }
    });

    // Stone pickup sync from other players
    this.socket.on('stonePicked', (data) => {
      if (this.scene && this.scene.chunkManager && data.id) {
        const [cx, cy] = data.id.split(',').map(Number);
        this.scene.chunkManager.invalidate(cx, cy);
      }
    });

    // Tree-break sync
    this.socket.on('objectRemoved', (data) => {
      if (this.scene.handleRemoteObjectRemoved) this.scene.handleRemoteObjectRemoved(data.kind, data.id);
    });

    // On connect, get the already-removed world objects from the server
    this.socket.on('worldState', (state) => {
      if (this.scene.applyWorldState) this.scene.applyWorldState(state);
    });
  }

  addRemotePlayer(playerInfo) {
    const rp = new RemotePlayer(this.scene, playerInfo.id, playerInfo.x, playerInfo.y, playerInfo.name || 'Oyuncu', playerInfo.char);
    this.remotePlayers.set(playerInfo.id, rp);
  }

  sendMove(x, y, facingLeft) {
    if (this.socket.connected) {
      this.socket.emit('playerMove', { x, y, facingLeft });
    }
  }

  // Generic world-object removal sync (kind: 'tree' | 'grass' | 'stone').
  // Works exactly like the old treeChopped flow, but for every decor kind.
  sendObjectRemoved(kind, id) {
    if (this.socket.connected) {
      this.socket.emit('objectRemoved', { kind, id });
    }
  }

  sendTreeChopped(id) {
    this.sendObjectRemoved('tree', id);
  }

  sendStonePicked(stoneId) {
    if (this.socket.connected) {
      this.socket.emit('stonePicked', { id: stoneId });
    }
  }

  sendStonePicked(id) {
    if (this.socket.connected) {
      this.socket.emit('stonePicked', { id });
    }
  }

  // MainScene'in update() döngüsünde her frame çağrılmalı
  update() {
    this.remotePlayers.forEach((rp) => rp.interpolate());
  }
}