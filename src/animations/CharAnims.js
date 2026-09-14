export function createCharAnims(scene, charKey) {
  const anims = [
    { key: 'idle', start: 0, end: 3, frameRate: 6, repeat: -1 },
    { key: 'walk', start: 24, end: 29, frameRate: 10, repeat: -1 },
    { key: 'punch', start: 156, end: 161, frameRate: 11, repeat: 0 }
  ];

  anims.forEach(({ key, start, end, frameRate, repeat }) => {
    const fullKey = `${charKey}_${key}`;
    if (!scene.anims.exists(fullKey)) {
      scene.anims.create({
        key: fullKey,
        frames: scene.anims.generateFrameNumbers(charKey, { start, end }),
        frameRate,
        repeat
      });
    }
  });
}