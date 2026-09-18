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

## Hesap Sistemi (Auth Katmanı)

Hesap sistemi oyunun çekirdeğinden **tamamen bağımsızdır**. Oyun motoru
(MainScene, kontroller, HUD) kullanıcının misafir mi, kayıtlı mı yoksa
çevrimdışı mı olduğunu **hiç sormaz**; yalnızca soyut bir `UserSession`
arayüzünü okur:

```js
session.displayName    // görünen ad (her modda dolu)
session.storageKey     // envanter anahtarı (her modda dolu)
session.can('trade')   // yetenek sorgusu (misafir ticaret yapamaz)
session.snapshot()     // { gold, gems, level, xp, items }
```

Üç adaptör aynı arayüzü uygular — oyun kodu üçünü ayırt etmez:

| Adaptör | Ne zaman | Kalıcılık | Ticaret |
|---|---|---|---|
| `AccountSession` | geçerli jeton | Veritabanı | ✅ |
| `GuestSession` | jeton yok | Bellek (6 saat) | ❌ |
| `OfflineSession` | sunucu kapalı | Yok | ❌ |

**Veritabanı olmadan da çalışır:** `DATABASE_URL` tanımlı değilse veya
`@prisma/client` kurulu değilse sunucu otomatik olarak bellek deposuna düşer
ve oyun misafir modunda eksiksiz oynanır.

### Kurulum (kalıcı hesaplar için)

```bash
cd server
npm i -D prisma && npm i @prisma/client
export DATABASE_URL="postgresql://kullanici:sifre@localhost:5432/mapex"
npx prisma migrate dev --name init
npx prisma generate
```

Şema: **`server/prisma/schema.prisma`** — `users`, `user_progress`,
`user_inventory`, `user_sessions`, `wallet_transactions`.

### Race Condition Koruması

Bakiye düşme "önce oku, sonra yaz" ile DEĞİL, koşullu tek `UPDATE` ile yapılır:

```sql
UPDATE users SET gold = gold - $1
WHERE id = $2 AND gold >= $1   -- koşul SQL'de
RETURNING gold
```

Etkilenen satır yoksa harcama gerçekleşmemiştir. Böylece eş zamanlı iki istek
aynı bakiyeyi okuyup iki kez harcayamaz. Envanterde de aynı yaklaşım kullanılır
(`count >= n` koşulu + `(user_id, item_id)` tekilliği).

### Uçlar (`/auth`)

| Uç | Açıklama |
|---|---|
| `POST /register` | e-posta + kullanıcı adı + şifre → jeton |
| `POST /login` | giriş → jeton |
| `POST /logout` | jetonu iptal et |
| `GET /session` | mevcut oturum (jeton geçersizse **misafir** döner, 401 değil) |
| `GET /me` | hesap bilgisi (kayıtlı kullanıcı) |
| `POST /change-password` | eski şifre doğrulanarak değişim |

Güvenlik: şifreler Node'un yerleşik `scrypt`'i ile özetlenir (ek bağımlılık yok),
jetonlar HMAC-SHA256 imzalıdır, giriş/kayıt uçlarında IP başına hız sınırı vardır.

> **Tasarım kararı:** `/session` ucu asla 401 dönmez. Misafir oyuncunun oyuna
> girmesini engellemek istemedik; "hesap var mı" bilgisi yalnızca bir alandır.

## Dizin Yapısı

```
shared/               → objectDefs.json (tek doğruluk kaynağı)
src/
  core/               → ObjectDefs, Inventory, WorldGenerator, Input, SoundFX,
                        StartRequest (menü → sahne isteği)
  account/            → ClientSession, SessionProvider, AuthApi, OfflineSession
                        (oyun tarafı oturum katmanı; Phaser'ı import etmez)
  scenes/             → PreloadScene (asset), MainScene (kurulum + döngü)
  entities/           → Player, RemotePlayer
  systems/            → TerrainSystem, InteractionSystem, DropSystem
  world/              → GroundLayer, ObjectLayer, DayNightCycle, WindowHelper
  chat/               → ChatModel, ChatService, ChatBox, ChatNotice
  network/            → NetworkManager (+ LocalServer: sunucusuz mod)
  ui/                 → Menu, AccountPanel, AccountRules, Hud, InventoryView,
                        PauseMenu, SettingsPanel
server/
  auth/               → UserSession (arayüz), Account/GuestSession (adaptörler),
                        AuthService, Password, TokenStore, Repository'ler,
                        middleware, routes, SessionFactory
  prisma/             → schema.prisma (PostgreSQL şeması)
  game/               → GameData, GameWorld, InventoryStore, StatsTracker,
                        GameClock, ChatStore, SocketHandlers
  test/               → assets, client-imports, flow, menu, settings, chat,
                        auth (birim), auth-http, e2e-*, browser-*
```

## Başlatma Akışı

1. `src/main.js` → `ensureGameData()` ile `shared/objectDefs.json` çekilir.
   Başarısız olursa menüde "Bağlantı hatası" gösterilir (takılı kalmaz).
2. Aynı yerde `initAccount()` → oturum çözülür. Sunucu yoksa veya jeton
   geçersizse sessizce misafir/çevrimdışı oturuma düşer; hata fırlatmaz.
3. `PreloadScene` → tüm sprite/karakter/arayüz dosyalarını JSON'dan türetip yükler.
4. `MainScene` → sistemleri kurar; menüden gelen `mapex:start` isteğini uygular.
   Menü erken tıklanırsa istek `src/core/StartRequest.js`'te bekletilir ve
   sahne hazır olduğunda işlenir (oturum da bu istekle taşınır).

## Test

```bash
cd server
npm test              # birim testleri (veri, modül grafı, akış, auth, sohbet, ayarlar)
npm run test:auth     # hesap katmanı (race condition dahil) + HTTP uçları
npm run test:e2e      # sunucu açıkken uçtan uca kontrol
npm run test:browser  # gerçek tarayıcı (Edge/Chrome CDP)
npm run test:http     # tüm asset'ler HTTP 200 döndürüyor mu
```

Sunucu açık olmalı; hız sınırı testleri için `MAPEX_ALLOW_TEST_HOOKS=1`:

```bash
MAPEX_ALLOW_TEST_HOOKS=1 npm start    # Windows: set MAPEX_ALLOW_TEST_HOOKS=1
```