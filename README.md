# Mapex.io

Mapex.io, Phaser.js ve HTML5/JS altyapısıyla geliştirilmiş, tarayıcıda çalışan 2D
kuşbakışı bir oyundur. "Başlaması kolay, ustalaşması zor" bir oynanış sunar.
Backend tarafında Node.js kullanılan proje, açık kaynak kodlu yapısı sayesinde
doğrudan çatallanmaya (fork) ve özelleştirilmeye uygundur.

## Çalıştırma

```bash
cd server
npm install
npm start          # http://localhost:3019
```

Sunucu kapalıysa istemci otomatik olarak yerel (tek kişilik) moda geçer.

## Veri Odaklı Nesne Sistemi

Tüm oyun içeriği tek bir dosyadan yönetilir: **`shared/objectDefs.json`**.
İstemci (`src/core/ObjectDefs.js`) ve sunucu (`server/game/GameData.js`) aynı
dosyayı okur — bir nesneyi iki yerde tanımlamak gerekmez.

Yeni bir nesne eklemek için JSON'a bir kayıt eklemek yeterlidir:

```json
"iron": {
  "name": "Demir",
  "kind": "resource",
  "interaction": "pickup",
  "shape": { "w": 1, "h": 1 },
  "sprite": { "atlas": "assets/Objects/Stone/{n}.png", "variants": 16, "display": 0.42, "depth": 2 },
  "spawn": { "chance": 0.1, "cells": 4, "salt": 7, "size": "small" },
  "pickup": { "range": 52 }
}
```

Bu kayıt otomatik olarak: üretilir (deterministik), çizilir, toplanır, envantere
girer, HUD/envanterde görünür ve sunucu tarafında doğrulanır.

### Alanlar

| Alan | Anlamı |
|---|---|
| `kind` | `resource` \| `obstacle` \| `harvestable` \| `decor` |
| `interaction` | `pickup` (E ile al) \| `hold` (basılı tut, kes) \| `none` |
| `shape` | Kapladığı karo sayısı (`w`, `h`) |
| `sprite` | `atlas` içindeki `{n}` yerine sıra numarası/`variants`; `scale`, `display`, `depth`, `origin` |
| `spawn` | Deterministik üretim: `chance`, `cells`, `salt`, `bigOnly`, `size`, `texMin`/`texMax` |
| `harvest` | `holdTime`, `range`, vuruş alanı |
| `pickup` | Alma menzili |
| `drop` | Kırılınca düşen eşya (`itemId`, `count`) |
| `stump` | Kırıldıktan sonra kalan görsel |
| `light` | Gece ışığı (`radius`, `strength`) |

### Sayaçlar

Oyun içi istatistikler de JSON'dan gelir (`stats` dizisi):

```json
"stats": [ { "id": "chopped", "label": "Kesilen Ağaç", "resource": "wood" } ]
```

`resource` alanı hangi kaynağın bu sayacı artıracağını belirler; kodda sabit
sayaç adı geçmez. Sunucu envanterin, istatistiklerin ve dünya durumunun tek
sahibidir (server authority).

## Dizin Yapısı

```
shared/               → objectDefs.json (tek doğruluk kaynağı)
src/
  core/               → ObjectDefs, Inventory, WorldGenerator, Input, SoundFX
  scenes/             → PreloadScene (asset), MainScene (kurulum + döngü)
  entities/           → Player, RemotePlayer
  systems/            → TerrainSystem, InteractionSystem, DropSystem
  world/              → GroundLayer, ObjectLayer, DayNightCycle, WindowHelper
  network/            → NetworkManager (+ LocalServer: sunucusuz mod)
  ui/                 → Menu, Hud, InventoryView, PauseMenu
server/
  game/               → GameData, GameWorld, InventoryStore, StatsTracker,
                        GameClock, SocketHandlers
  test/               → assets.test.mjs (veri), client-imports.mjs (modül grafı),
                        flow.test.js (soket), http-assets.mjs (HTTP erişimi)
```

## Başlatma Akışı

1. `src/main.js` → `ensureGameData()` ile `shared/objectDefs.json` çekilir.
   Başarısız olursa menüde "Bağlantı hatası" gösterilir (takılı kalmaz).
2. `PreloadScene` → tüm sprite/karakter/arayüz dosyalarını JSON'dan türetip yükler.
3. `MainScene` → sistemleri kurar; menüden gelen `mapex:start` isteğini uygular.
   Menü erken tıklanırsa istek `src/core/StartRequest.js`'te bekletilir ve
   sahne hazır olduğunda işlenir.

## Test

```bash
cd server
npm test            # veri tutarlılığı + istemci modül import + soket akışı
npm run test:http   # sunucunun tüm asset'leri HTTP 200 döndürüyor mu (sunucu açık olmalı)
```