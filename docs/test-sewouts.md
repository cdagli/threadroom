# Test dikişleri (300 × 200 mm)

Her dolgu, saten ve çizgi ayarının makinede nasıl dikildiğini göstermek için hazırlanmış, tek iplikli
3 numune projesi. 13.11.2026'da `embroidery-digitizing` skill'i (WebMCP araçları) ile oluşturuldu.
Bu dosya iki iş için var: dikilmiş kumaşta numuneleri tanımak ve aynı test kartlarını yeniden kurmak.

| Proje | Veritabanı kimliği | Nesne | Dikiş | Kesim | Süre* |
| --- | --- | --- | --- | --- | --- |
| Test dikişi 1 — Tatami ayarları | `1560e2dd-ed3d-4e9a-90db-4906f58a993c` | 45 | 64.008 | 164 | ~107 dk |
| Test dikişi 2 — Dolgu desenleri | `bafe1bda-0114-477c-af04-9746a21d5340` | 80 | 68.770 | 110 | ~111 dk |
| Test dikişi 3 — Saten ve çizgiler | `7a410288-682b-4505-ae67-517832c03fb9` | 80 | 23.060 | 111 | ~41 dk |

\* Dakikada 650 dikiş; renk değişimi ve kesimler dahil.

## Ortak ayarlar

- **Kasnak ve kumaş:** Kasnak `300x200`. Kumaş `woven` (dokuma pamuklu): yırtılan tela, dolgu sıklığı 0,42, saten 0,40, çekme telafisi 0,2.
- **Düğümler:** Başlangıç ve bitiş düğümü tack, 1 mm. `trimJump` 3.
- **İplik:** Hepsi tek iplik, Brother **588 Prusya mavisi** (`#111f77`).
- **Izgara:** 5 satır × 8 sütun, 26 mm'lik hücreler. Sütun merkezi `x = 27,5 + 35·i` (i = 0…7), satır merkezi `y = 21 + 37·r` (r = 0…4). Her hücrenin etiketi altında, `y = 21 + 37·r + 17,5` konumunda.
- **Etiketler:** Hershey Simplex saten yazı, 4 mm. Proje 1'de her satırın altında bir başlık var. Proje 2 ve 3'te her numunenin altında bir numara var.
- **Dikiş sırası:** Yılan düzeni; çift satırlar soldan sağa, tek satırlar sağdan sola dikilir. Her numuneden sonra numarası dikilir. Proje 1'in başlıkları en sonda dikilir.
- **Dolgu varsayılanı:** Aksi belirtilmedikçe dolgular 45° Tatami ve kumaş varsayılanlarıyla.

## Proje 1 — Tatami ayarları

Satırlar soldan sağa okunur. Köşeli ayraç içindeki metin, satırın altına dikilen başlıktır.

| Satır | Başlık | Numuneler |
| --- | --- | --- |
| 1 | `YOGUNLUK 0.30 > 2.00 MM` | Sıra aralığı 0,30 · 0,36 · 0,42 · 0,50 · 0,60 · 0,80 · 1,20 · 2,00 mm |
| 2 | `ACI 0 > 150` | Açı 0 · 15 · 30 · 45 · 60 · 90 · 120 · 150° |
| 3 | `ALT DIKIS: YOK KENAR TATAMI K+T   BOY 1.5 > 6` | Alt dikiş yok · kenar · tatami · kenar+tatami, ardından dolgu dikiş boyu 1,5 · 3 · 4,5 · 6 mm |
| 4 | `RAMPA PLATO  EL 1 3 5  CEKME 0 0.8  CIFT ALT` | Yoğunluk gradyanı rampa (0→1, uç aralık 2) · gradyan plato (merkez 0,5, genişlik 0,3, uç 2,5) · el dikişi 1 · 3 · 5 · çekme telafisi 0 · 0,8 · çift yönlü alt dikiş (0° + 90°, aralık 2,5, boy 3, içe 0,5, artı kenar yürüyüşü) |
| 5 | `KILAVUZ DAIRE YILDIZ KALP UCGEN ALTIGEN OVAL HALKA` | Açı kılavuzlu yönlü dolgu (2 kılavuz: üstte 0°, altta ~23°) · daire · yıldız · kalp · üçgen · altıgen · oval (26 × 18) · 11 mm delikli halka |

## Proje 2 — Dolgu desenleri

| No | Desen | No | Desen |
| --- | --- | --- | --- |
| 1 | Even (düz) | 21 | Kalpler (küçük) |
| 2 | Tatami | 22 | Kalpler (orta) |
| 3 | Columns (sütunlar) | 23 | Baklavalar (küçük) |
| 4 | Offset columns (kaydırmalı sütunlar) | 24 | Baklavalar (orta) |
| 5 | Triangle (üçgen) | 25 | Daireler (küçük) |
| 6 | Walk (yürüyüş) | 26 | Daireler (orta) |
| 7 | Waves (dalgalar) | 27 | Hexweave (petek) |
| 8 | Zig-Zag | 28 | Chain (zincir) |
| 9 | Heartbeat (kalp atışı) | 29 | Stars (yıldızlar) |
| 10 | Spiral (sarmal) | 30 | Streamlines (akış çizgileri, aralık 1,5) |
| 11 | Staircase (merdiven) | 31 | Waves, genlik 6 |
| 12 | Rainfall (yağmur) | 32 | Hexweave, hücre 8 |
| 13 | Tornado (hortum) | 33 | Dairesel dolgu, kare üzerinde (aralık 0,5) |
| 14 | Wavy Walk (dalgalı yürüyüş) | 34 | Dairesel dolgu, daire üzerinde (aralık 0,5) |
| 15 | Jitter (titreşim) | 35 | Çarpı işi: çarpı (3 mm) |
| 16 | Bands (bantlar) | 36 | Çarpı işi: dik (upright) |
| 17 | Interlocked (kenetli) | 37 | Çarpı işi: çift (double) |
| 18 | Rails (raylar) | 38 | Çarpı işi: smyrna |
| 19 | Twill (dimi) | 39 | Çarpı işi: yarım (half) |
| 20 | Houndstooth (kazayağı) | 40 | Çarpı işi: çarpı, 6 mm, 4 kat iplik |

- 1–34 numaralar 26 mm kare, 45° ve varsayılan desen parametreleriyle. Yalnızca 31 ve 32'nin parametreleri farklı.
- Çarpı işi (35–40) `kind: 'cross'` ve **0°**. 45°'de çarpılar döner ve "çarpı", "dik" gibi görünür.

## Proje 3 — Saten ve çizgiler

- 1–16 numaralı saten çizgiler aynı 24 mm yüksekliğindeki S eğrisi üzerinde.
- 33–39 numaralı çizgiler keskin köşeli bir "M" zikzak üzerinde.

| No | Nesne | Ayarlar |
| --- | --- | --- |
| 1–7 | Saten çizgi | Genişlik 1 · 2 · 3 · 4 · 5 · 7 · 10 mm |
| 8 | Zikzak dikiş | Genişlik 5 mm |
| 9–11 | Saten 5 mm | Sıklık 0,3 · 0,6 · 1,0 |
| 12–14 | Saten 5 mm | Alt dikiş yok · kenar · kenar+zikzak |
| 15–16 | Saten 5 mm | Çekme telafisi 0 · 1,0 |
| 17 | Saten 8 mm | 3 mm'de bölünmüş (bölme saten dokusu) |
| 18 | Saten 8 mm | 7 mm'de bölünmüş (varsayılan) |
| 19 | Saten yay 6 mm (r 8) | Kısa dikiş **kapalı** |
| 20 | Saten yay 6 mm (r 8) | Kısa dikiş **açık** |
| 21 | Saten blok | Sivrilen yaprak, genişlik 0,6 → 8 → 0,6 mm |
| 22 | Saten blok | Kavisli bant, 4,5 mm |
| 23 | E-dikişi | Genişlik 3 mm |
| 24 | Zikzak dikiş | Genişlik 3 mm, aralık 1 |
| 25 | Saten dolgu (sweepSatin) | Düz kare, 0° |
| 26 | Saten dolgu | Kabarık (puf), 1 kat dolgu |
| 27 | Saten dolgu | Kabarık (puf), 2 kat dolgu |
| 28 | Saten dolgu | Kabarık daire (kubbe), 2 kat dolgu |
| 29 | Uzun-kısa dikiş | Radyal daire, tek renk |
| 30 | Uzun-kısa dikiş | Düz 90°, değişkenlik 60 (varsayılan) |
| 31 | Uzun-kısa dikiş | Düz 90°, değişkenlik 0 (düzenli) |
| 32 | Dolgu yazı | "Aa", Nunito 18 mm |
| 33 | Koşu dikişi | Boy 1,0 mm |
| 34 | Koşu dikişi | Boy 2,5 mm |
| 35 | Fasulye dikişi | — |
| 36 | Geri dikiş | — |
| 37 | Çift halat dikişi | — |
| 38 | Üçlü halat dikişi | Halat genişliği 0,8 |
| 39 | Alt dikiş çizgisi | — |
| 40 | Elle yerleştirilmiş dikişler | 61 noktalı iğne sarmalı |

## Kalan kontrol uyarıları

Başarısız (fail) uyarı yok. Aşağıdaki kontroller bir test kartında beklenen şeyler:

- `long-jump` ve `many-trims`: hücreler arası 35 mm mesafeden ve saten numaralar/başlıklardan kaynaklanıyor.
- `satin-wide`: Proje 3'teki 7, 17, 18 ve 21 numaralarda.
- `fill-thin-part`: Proje 1'deki yıldızın uçlarında.

## Yeniden kurmak için notlar

- **Nokta sınırı.** Bir proje en fazla 12.000 halka noktası taşır.
  - `add_shape` ve `add_path` eğrileri yaklaşık 0,5 mm'de örnekler; 26 mm'lik bir kare yaklaşık 208 nokta tutar.
  - Bir saten etiket karakter başına yaklaşık 50 nokta tutar.
  - Bu yüzden düz numuneleri 4 noktalı halkalarla JSON nesnesi olarak hazırlayıp `load_project` ile yükleyin.
  - Yazıları (`add_text`, ardından `satinFont:'simplex'` ile `update_text`) ve özel şekilleri sonra araçlarla ekleyin.
  - 40 eğri numunenin yanına 40 tam etiket sığmaz; numaralar sığar.
- **Açı kılavuzları.** `angleGuides`, `update_objects` ile düzenlenemez. Proje JSON'unda ayarlayın: `export_design` json → düzenle → `load_project`.
- **Ayrı projeler.** `new_design` ve `load_project` açık tasarımın yerine geçer. Yeni projeyi `POST /api/projects` (`{data, thumbnail:null}`) ile oluşturup `/projects/<id>` adresini açın.
- **Büyük kasnakta uzun atlamalar.**
  - Sorun: PEC'de bir atlama en fazla 204,7 mm olabilir. pystitch daha uzun, kesimli bir atlamayı iki kesimli parçaya böler. Derleyici bunları iki kesim sayıp tasarımı reddediyordu.
  - Düzeltme: `embroidery/compiler.py`'de arada dikiş olmayan art arda kesimler artık tek kesim sayılıyor.
  - Test: `test_trimmed_jump_longer_than_pec_range_counts_as_one_trim`.
- **Saten ilmek sınırı.** Bölünmemiş 7 mm'den uzun saten ilmekleri başarısız sayılır (`satin-long`). Bölme karşılaştırmasını 7 mm'den geniş satenlerde, bölme ≤ 7 ile yapın.
- **Dikiş süresi.** Süreyi kısaltmak için 22 mm'lik hücreler kullanın; dikiş sayısı yaklaşık %30 azalır.
