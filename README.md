# Mapex.io

Mapex.io, tarayıcıda çalışan 2D kuşbakışı bir pixel art toplama ve keşif oyunudur.
Yeşil çayırlar, göller ve ormanlarla dolu sonsuz bir dünyada doğarsın; ağaçları
kessin, taşları toplayın, envanterini doldurun — istersen tek başına, istersen
arkadaşlarınla. Gündüz gezip toplar, gece lambaların ışığında ateş böceklerini
izlersin.

![Oyundan bir görünüm](image.png)

Felsefemiz basit: **başlaması kolay, ustalaşması zor.** Kod tabanı tamamen açık
kaynaklıdır; fork edip kendi oyununu çıkarmak için tasarlandı — sihirli numara
yok, her şey tek bir veri dosyasından okunur.

---

## Özellikler

- **Sonsuz, deterministik dünya** — Harita prosedürel üretilir ama rastgele
  değildir: her oyuncu aynı dünyayı görür. Çayır, göller, ağaçlar, kayalar,
  taşlar, kütükler, çiçekler, gaz lambaları…
- **Gündüz / gece döngüsü** — 1 oyun günü = 15 gerçek dakika. Gece gerçekten
  karanlıktır: oyuncunun ışığı, gaz lambaları ve ateş böcekleri dışında her şey
  kapkara olur. Sağ üstteki saat herkeste aynıdır (sunucu saati).
- **Toplama ve kesme** — Taşları E ile al, ağaç ve kütükleri basılı sol tıkla
  kes. Kırılan nesnelerden odun düşer; yere düşen her şeyi herkes görebilir ve
  alabilir.
- **Envanter ve hotbar** — 15 slotluk envanter, ekranın altında 5 slotluk
  hızlı çubuk. Q ile eşya bırakırsın; bıraktığın eşya dünyada görünür.
- **Çok oyunculu** — Sunucuya bağlanan herkes aynı dünyayı paylaşır: birinin
  kestiği ağaç sende de düşer, bıraktığı eşyayı sen alabilirsin, sohbet eder,
  birbirinizin animasyonlarını görürsünüz.
- **Sohbet** — Genel mesaj + özel mesaj (`#isim mesaj`) + bahsetme (`@isim`).
  Sunucu mesajları doğrular ve geçmişi saklar.
- **Hesap sistemi (opsiyonel)** — Misafir olarak oynayabilir ya da hesap
  oluşturabilirsin. Hesabın altın, elmas ve seviyesi olur; envanterin veri
  tabanına kaydedilir ve nereden bağlanırsan bağlan, seninle gelir.
- **Tamamen prosedürel ses** — Kuşlar, cırcır böcekleri, su uğultusu dahil tüm
  sesler Web Audio ile anlık üretilir. Projede tek bir ses dosyası bile yok.
- **Ayarlara saygı duyan arayüz** — Ses seviyeleri, tüm tuş atamaları ve sohbet
  tercihleri oyun içi panelde değiştirilebilir.

## Nasıl Oynanır

1. Menüden bir karakter seç, adını gir, **OYUNA GİR**'e bas.
2. **WASD** veya **ok tuşları** ile yürü.
3. Yakınındaki taşı görünce **E**'ye bas: taşı alırsın.
4. Ağaç veya kütüğün üstüne gelip **sol tıkı basılı tut**: ilerleme çubuğu
   dolar, ağaç devrilir ve odun yere düşer.
5. Yere düşen odundan **E** ile al, **I** ile envanterini aç, **Q** ile eşya
   bırak.
6. Gece gelmeden kendine bir plan yap — ya da **Shift**'e basılı tutup zamanı
   hızlandır, günü atla.

### Kontroller

| Tuş | İşlev |
|---|---|
| WASD / Ok tuşları | Hareket |
| Sol tık (basılı) | Ağaç / kütük kes |
| E | Yerdeki eşyayı al |
| I | Envanteri aç / kapat |
| Q | Envanterden eşya bırak |
| Shift (basılı) | Zamanı hızlandır |
| Enter | Sohbeti aç / mesaj gönder |
| ESC | Menü — envanteri ve panelleri kapatır |

> Tüm tuşlar oyun içi **Ayarlar** panelinden değiştirilebilir.

---

## Çalıştırma

```bash
cd server
npm install
npm start          # http://localhost:12090
```

Sunucu kapalıysa üzülme: istemci bunu fark eder ve otomatik olarak **tek
kişilik yerel moda** geçer. Yani oyunu denemek için asla sunucu kurmak
zorunda değilsin — ama arkadaşlarınla oynamak için çalıştırman gerekir.

- Oyun portu `shared/serverSettings.json` dosyasından değiştirilebilir.
- Ekran/ölçekleme ayarları (tile boyutu, 3× ölçek, görüş alanı, font)
  `shared/scalingSettings.json` dosyasındadır.

## Çok Oyunculu ve Hesaplar

Sunucu **yetkilidir**: envanterin, dünyadan kaldırılan nesneler, yere düşen
eşyalar ve oyun saati hep sunucuda tutulur. İstemci yalnızca tahminde
bulunur, gerçeği sunucudan alır — bu yüzden hile yapmak zor, senkronizasyon
sağlamdır.

- **Misafir:** hesap açmadan oynarsın; envanterin tarayıcı oturumuna bağlıdır.
- **Hesap:** e-posta + kullanıcı adı + şifre ile kayıt olursun; altın, elmas,
  seviye ve kalıcı envanter kazanırsın. PostgreSQL varsa kalıcıdır, yoksa
  sunucu bellek içi çalışır ve yine de eksiksiz oynanır.

## Oyun İçi Ayarlar

ESC menüsünden **Ayarlar**'ı aç:

- Ana ses ve ortam sesleri (kuşlar, cırcırlar, su)
- Her tuşun ataması (hareket, alma, envanter, bırakma, zaman, sohbet)
- Sohbet tercihleri: seni "ben" sayacak ek ad ve bahsetme kelimeleri

---

## Teknik Bakış (fork edecekler için)


## Çalıştırma

```bash
cd server
npm install
npm start          # http://localhost:12090
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
| `sprite` | `atlas` içindeki `{n}` yerine sıra numarası/`variants`; `scale`, `display`, `depth`, `origin`, **`groundOffset`** |
| `shadow` | Zemin gölgesi: `n` (1-6), `offsetY`, `width`, `height`, `alpha` |
| `spawn` | Deterministik üretim: `chance`, `cells`, `salt`, `bigOnly`, `size`, `texMin`/`texMax` |
| `collider` | Çarpışma kutusu: `colliderW` × `colliderH` (piksel), `collider` (karo oranı yedeği) |
| `harvest` | `holdTime` (saniye), `range`, vuruş alanı |
| `pickup` | Alma menzili |
| `drop` | Kırılınca düşen eşya (`itemId`, `count`, `countMax`) |
| `stump` | Kırıldıktan sonra kalan görsel (+ isteğe bağlı `shadow`) |
| `light` | Gece ışığı (`radius`, `strength`) |

### Kütük: tek tür, dört görsel

`log` tanımı ağaçla **aynı kırma akışını** kullanır ama daha kısa sürer:

```json
"log": {
  "kind": "harvestable", "interaction": "hold",
  "sprite": { "atlas": "assets/Objects/Decor/Log{n}.png", "variants": 4, "scale": 1.15,
              "depth": 2, "collider": 0.5, "colliderOffsetY": 6 },
  "shadow": { "atlas": "assets/Objects/Shadow/{n}.png", "n": 3, "offsetY": 6,
              "width": 26, "height": 11, "alpha": 0.36 },
  "harvest": { "holdTime": 5.6, "range": 62, "hitHalfWidth": 26, "shakes": 2 },
  "drop": { "itemId": "wood", "count": 1, "countMax": 2 }
}
```

`variants: 4` sayesinde dört kütük duruşu (eğik yatay `Log1`, eğik dikey `Log2`,
tam yatay `Log3`, tam dikey `Log4`) **deterministik** olarak rastgele seçilir —
kaya ve taşla aynı mekanizma, ek kod yok.

**Kırma süresi oranı:** ağaç `holdTime: 8` → kütük `holdTime: 5.6`
(8 × 0.7). Yani kütük ağaçtan **tam %30 daha hızlı** kırılır. Bu oran
`assets.test.mjs` içinde kilitlenmiştir; JSON'daki süre değişirse test uyarır.

### Gölge Efekti

`assets/Objects/Shadow/1..6.png` küçükten büyüğe giden yumuşak lekelerdir.
Hangi nesneye hangisinin yakıştığı JSON'daki `shadow` bloğuyla belirlenir:

| Nesne | Gölge | Neden |
|---|---|---|
| `stone` | `1.png` | tek karo, en küçük nesne |
| `lamp` | `2.png` | ince direk |
| `log` | `3.png` | tek karo ama uzun gövde |
| `woodPile` | `4.png` | yığılmış odun |
| `tree`, `rock` | `6.png` | en geniş kütle (2×2 taç / kaya) |

> `5.png` şu an kullanılmıyor; ara boyut gerekirse hazır duruyor.

Kurallar:

- Gölge her zaman nesnenin **bir alt katmanında** (`depth - 1`) çizilir; ağaç
  gibi y-sıralı nesnelerde `refreshDepths()` ikisini birlikte günceller.
- `width`/`height` ile hedef piksel boyutu verilir (`setDisplaySize`), böylece
  gölgeyi tek bir asset'ten farklı ölçeklerde kullanabilirsiniz.
- Kırılan nesnenin gölgesi de silinir (sızıntı olmaz); ağaç kütüğünün kendi
  gölgesi `stump.shadow` ile tanımlanır.
- `alpha` 0-1 arasıdır; önerilen aralık 0.3-0.45 (daha koyusu yapay durur).

**Yeni nesneye gölge eklemek:** JSON'a tek satır yeter, kod değişmez:

```json
"shadow": { "atlas": "assets/Objects/Shadow/{n}.png", "n": 4,
            "offsetY": 8, "width": 30, "height": 12, "alpha": 0.34 }
```

### Sayaçlar

Oyun içi istatistikler de JSON'dan gelir (`stats` dizisi):

```json
"stats": [
  { "id": "chopped", "label": "Kesilen Ağaç", "resource": "wood", "source": "tree" },
  { "id": "logs",    "label": "Kesilen Kütük", "resource": "wood", "source": "log" }
]
```

`resource` alanı hangi kaynağın bu sayacı artıracağını belirler; kodda sabit
sayaç adı geçmez. Sunucu envanterin, istatistiklerin ve dünya durumunun tek
sahibidir (server authority).

**`source` alanı (isteğe bağlı):** sayaç yalnızca o nesne türü **kırıldığında**
artar. Ağaç ve kütük ikisi de `wood` düşürdüğü için bu ayrım şarttır: yoksa
"Kesilen Ağaç" sayacı kütük kesmeyi de sayardı. `source` verilmemiş sayaçlar
eşya **toplandığında** artar (mevcut `stone` davranışı).

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

### Yer Çizgisi: `groundOffset` ve Çarpışma

Nesne PNG'lerinin altında **şeffaf boşluk** vardır (kaya ~12-22px, ağaç 57px,
kütük 11-25px). Sprite merkezi (origin 0.5) esas alınırsa nesnenin görsel tabanı
merkezin *üstünde* kalır; bu yüzden gölge ve çarpışma kutusu aşağı kayar.

`groundOffset`, sprite merkezi ile nesnenin **yere bastığı nokta** arasındaki
farktır (piksel). Gölge ve collider bu tek "yer çizgisi"ne göre hizalanır:

```json
"sprite": {
  "atlas": "assets/Objects/Rock/{n}.png", "variants": 8, "display": 0.85,
  "groundOffset": -6, "collider": 0.85, "colliderW": 44, "colliderH": 16
}
```

| Nesne | `groundOffset` | Collider (px) | Gölge |
|---|---|---|---|
| `stone` | `0` | — (toplanır) | `1.png` |
| `log` | `-8` | 26 × 12 | `3.png` |
| `lamp` | `0` | — (dekor) | `2.png` |
| `woodPile` | `-8` | — (dekor) | `4.png` |
| `tree` | `-31` | 30 × 18 | `6.png` |
| `rock` | `-6` | 44 × 16 | `6.png` |

Kurallar:

- **Collider ayak izidir:** `colliderW` × `colliderH` kutusu yer çizgisine
  **alt kenarından oturur** (`y = groundY - h`). Eski `collider` alanı karo
  oranı olarak geriye dönük uyumludur (tek sayı verilirse kare kabul edilir).
- **Gölge `offsetY` yer çizgisinden ölçülür.** `0` gölgeyi tam ayağın üstüne
  oturtur; pozitif değer aşağı kaydırır.
- Ağaç gibi y-sıralı nesnelerde derinlik `data.y` yerine `groundY`'den
  hesaplanır; böylece oyuncu ağacın arkasına geçme sırası doğru kalır.
- Kırılan ağacın kalıntısı (`stump`) da yer çizgisine oturur (`stump.offsetY`
  bu çizgiden ölçülür).

> **Yeni nesne eklerken:** PNG'nin altındaki şeffaf boşluğu ölçüp
> `groundOffset`'i `-(boşluk - 1) × ölçek` civarında verin; collider'ı da
> nesnenin görsel genişliğinin ~%70'i kadar seçin.

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