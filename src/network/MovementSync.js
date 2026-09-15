// Ağ senkronu: oyuncunun konumu, animasyon durumu ve kesme ilerlemesi
// değiştiğinde sunucuya bildirir. Pozisyon sabitken (durma, kesme) animasyon ve
// progress değişebildiği için hepsi izlenir; aksi halde karşı taraf eski
// animasyonda kalır ve kesme barı görünmez.
export class MovementSync {
  constructor(scene) {
    this.scene = scene;
    this.lastX = null;
    this.lastY = null;
    this.lastAnim = null;
    this.lastFacing = null;
    this.hold = { id: null, progress: 0, x: 0, y: 0 }; // kesme hedefi + ilerleme
    this.lastHoldKey = null;
  }

  reset() {
    this.lastX = null;
    this.lastY = null;
    this.lastAnim = null;
    this.lastFacing = null;
    this.hold = { id: null, progress: 0, x: 0, y: 0 };
    this.lastHoldKey = null;
  }

  // InteractionSystem kesme durumu değiştikçe bunu çağırır.
  setHold(hold) {
    this.hold = hold;
  }

  update() {
    const scene = this.scene;
    const network = scene.network;
    if (!network) return;

    const player = scene.player;
    const x = Math.round(player.x);
    const y = Math.round(player.y);
    const anim = player.animState;
    const facing = player.facingLeft;
    // Kesme barı %5'lik adımlarla gönderilir: gereksiz paket üretmeden akıcı görünür.
    const holdProgress = this.hold.id ? Math.round(this.hold.progress * 20) / 20 : 0;
    const holdKey = `${this.hold.id}|${holdProgress}`;

    const changed = x !== this.lastX || y !== this.lastY || anim !== this.lastAnim ||
      facing !== this.lastFacing || holdKey !== this.lastHoldKey;
    if (changed) {
      network.sendMove(x, y, facing, anim, {
        id: this.hold.id,
        progress: holdProgress,
        x: this.hold.x,
        y: this.hold.y
      });
      this.lastX = x;
      this.lastY = y;
      this.lastAnim = anim;
      this.lastFacing = facing;
      this.lastHoldKey = holdKey;
    }

    if (scene.playerNameText) {
      scene.playerNameText.setPosition(player.x, player.y - 44);
    }
    network.update();
  }
}