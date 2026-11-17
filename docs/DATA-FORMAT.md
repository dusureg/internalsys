# Data format

Everything the portal stores is JSON under `data/` in the repository, written and read through the GitHub contents API (admin) or `raw.githubusercontent.com` (clients). There is no other store. The admin site creates the folders on first use, so `data/` is not part of the code you upload.

```
data/
  public/
    brand.json                     plain: company profile shown to clients
    index.json                     plain: { v, skus: { <sku hash>: <client id> } }
  clients/
    <clientId>.json                encrypted client snapshot  { "payload": "<CryptoJS base64>" }
    <clientId>/<photoId>.t         encrypted thumbnail (AES-GCM, IV first)
    <clientId>/<photoId>.f         encrypted full-size photo
    <clientId>/<videoId>.v         encrypted video, with its poster <videoId>.t (4.6)
    <clientId>/<fileId>.d          encrypted file to download: a drawing, a 2D / 3D file, a PDF ... (4.6)
  private/
    vault.json                     master key wrapped by the admin password
    settings.json                  sealed settings (types, numbering, brand draft)
    <clientId>.json                sealed private record
    ops/
      suppliers.json               sealed list of suppliers (Supply chain)
      inventory.json               sealed list of materials with their movements (Inventory)
      logistics.json               sealed list of shipments with their steps (Logistics)
      expenses.json                sealed list of company expenses (Finance, 4.4)
      people.json                  sealed list of staff and casual workers with their pay rates (Staff & pay, 4.7)
    team.json                      sealed team list and roles (4.4)
    keys/<hash>.json               one login file per team member, and the administrator's own (4.4 / 4.5, readable by anyone: see SECURITY.md)
    profiles/<id>.json             sealed profile (phone, picture) of one signed-in person (4.5)
    files/<id>.bin                 sealed invoice or picture of a product kept with an expense, shipment or inventory item (4.6)
    audit/YYYY-MM[-n].json         sealed History of every change, one file per month (4.4)
    staff/pay-YYYY-MM.json         sealed time entries, bonuses and deductions of one month; "closed" makes the month read-only (4.7)
    staff/att/YYYY-MM/<id>.json    sealed sign-in records of ONE person for one month, written only by that person (4.7)
```

Schema tags (in `core/constants.js` and `admin/js/state.js`): **`dscl/2`** for the client snapshot, **`dscl-priv/2`** for the private record. Snapshots with `dscl/1` (older) are still opened and upgraded on the fly by `upgradePublic()`; the private record is normalised by `normalizeRec()` when loaded.

## Identifiers

| Thing | Format | Made by |
|---|---|---|
| Client ID | `<prefix>-CL-<n>`, e.g. `DS-CL-1001` | `settings.cseq` counter (starts at 1000, never below the highest ID in use) |
| Project number (SKU) | `<prefix>-<type code>-<yy><mm>-<seq>`, e.g. `DS-KIT-2610-0001` | `settings.seq` counter |
| Client secret key | `XXXX-XXXX-XXXX-XXXX` (alphabet without `I O 0 1`) | Random, 80 bits |
| Photo ID | file: random id; link: `l` + random | `uid()` |

A client ID in a URL must match `^[A-Za-z0-9_-]{3,40}$`.

## `data/public/brand.json` (plain)

```json
{
  "name":    { "en": "DUSUR", "ar": "DUSUR" },
  "tagline": { "en": "", "ar": "" },
  "phone": "+20 100 000 0000", "whatsapp": "201000000000",
  "email": "hello@example.com", "website": "https://example.com",
  "address": "", "logo": "<data: URL or empty>", "rating": true,
  "inbox": "https://script.google.com/macros/s/<id>/exec   (or empty: see docs/INBOX.md)",
  "look": { "fontEn": "plex|inter|roboto|opensans|lato|poppins|system", "fontAr": "plex|cairo|tajawal|almarai|kufi|naskh|amiri|system", "accent": "#rrggbb or empty" }   (4.5, optional)
}
```

Every field passes `sanitizeBrand()`: strings are trimmed and length-capped (names 80, tagline 120, logo up to 220,000 characters), `phone` keeps digits and `+ ( ) -`, `whatsapp` digits only, `email` must look like an address, `website` must start with `https://`, `inbox` must be exactly a Google Apps Script web-app address (`https://script.google.com/macros/s/<id>/exec`, nothing after `/exec`) or it is dropped. This file is public on purpose, so it never holds the inbox pick-up key.

## `data/public/index.json` (plain)

```json
{ "v": 1, "skus": { "3f9a0c5d7b21e684": "DS-CL-1001", "a1b2c3d4e5f60718": "DS-CL-1001" } }
```

Key: first 16 hex characters of `sha256("dscl-sku-v1:" + SKU)`. Value: the client id that owns that SKU. Rewritten on every publish and delete.

## `data/clients/<id>.json` (client snapshot)

File content:

```json
{ "payload": "U2FsdGVkX1+...base64..." }
```

Decrypted (`dscl/2`). This is the **only** data a client can ever see; it is built by `toPublic()` and contains no costs, no internal notes, no secret, no profit:

```json
{
  "schema": "dscl/2", "id": "DS-CL-1001", "name": "…", "phone": "…", "currency": "EGP",
  "createdAt": "ISO", "updatedAt": "ISO",
  "projects": [{
    "sku": "DS-KIT-2610-0001", "type": "KIT", "typeName": { "en": "Kitchen", "ar": "مطبخ" },
    "title": "", "description": "", "startDate": "YYYY-MM-DD", "dueDate": "YYYY-MM-DD",
    "price": 0,
    "payments": [{ "date": "YYYY-MM-DD", "amount": 0, "note": "" }],
    "schedule": [{ "id": "", "due": "YYYY-MM-DD", "amount": 0, "note": "", "deposit": true }],   (4.5, may be missing; "deposit" 4.6, only on the one row flagged Down payment)
    "stages": [{ "key": "cutting", "name": { "en": "", "ar": "" }, "status": "pending|in_progress|completed",
                 "checklist": [{ "text": { "en": "", "ar": "" }, "done": false }] }],
    "parts": [{ "name": "", "qty": 1, "status": "pending|in_progress|completed", "dueDate": "" }],
    "photos": [{ "id": "…", "kind": "file", "caption": "", "date": "" },
               { "id": "l…", "kind": "link", "url": "https://…", "caption": "", "date": "" },
               { "id": "…", "kind": "video", "mime": "video/mp4", "size": 0, "caption": "", "date": "" },     (4.6, bytes in <id>.v)
               { "id": "l…", "kind": "vlink", "url": "https://…", "caption": "", "date": "" }],              (4.6, a video on another site)
    "downloads": [{ "id": "…", "name": "kitchen.glb", "size": 0, "caption": "", "date": "" }],             (4.6, may be missing; bytes in <id>.d)
    "feedback": null
  }]
}
```

`schedule` (4.5) is the collection schedule: the instalments the client agreed to pay (note at most 80 characters). Which of them is collected, part paid or overdue is **derived** by `collectionPlan()` from `price`, `payments` and `schedule`: the part of the price that no instalment covers (a deposit) is taken off the money received first, the rest is matched to the instalments earliest first, so payments are never tagged. The same function runs in the admin page and on the client site.

`deposit` (4.6) marks the **down payment**: at most one row of a project; the client site shows it as *Down payment* and does not offer it a second time as the next payment. `downloads` (4.6) lists files the client may save: the name is cleaned (no path characters, 100 characters), the type must be one of `DL_EXT` in `core/photos.js` (GLB, GLTF, OBJ, STL, STEP, STP, SKP, 3DM, 3DS, FBX, DWG, DXF, PDF, ZIP, PNG, JPG, JPEG, WEBP, TXT, CSV, XLSX, DOCX, PPTX), at most 24 MB; the page decrypts and **saves** such a file, it never opens it.

Derived values (progress, state, remaining money, remaining time, the status of an instalment) are computed in the browser from this data (`core/domain.js`), not stored. Progress is the share of completed checklist items (a stage without checklist counts as one item).

## `data/private/<id>.json` (sealed private record)

File content (the same envelope for `settings.json`):

```json
{ "v": 1, "iv": "<base64, 12 bytes>", "ct": "<base64 AES-GCM ciphertext>" }
```

Decrypted record (`dscl-priv/2`):

```json
{
  "schema": "dscl-priv/2", "id": "DS-CL-1001", "secret": "XXXX-XXXX-XXXX-XXXX",
  "client": { "name": "", "phone": "", "phone2": "", "whatsapp": "(4.5: a number or a WhatsApp link, empty = made from the phone)", "email": "", "address": "", "notes": "" },
  "createdAt": "ISO", "updatedAt": "ISO",
  "projects": [{
    "...every field of the public project, plus:": "",
    "costs": [{ "type": "cogs|opex", "cat": "materials|hardware|labor|outsourced|delivery|installation|other|x + 6 hex (4.5: a category of your own, see settings.costCats)",
                "note": "", "amount": 0, "src": "bom (only when synced from the BOM)" }],
    "bom":   [{ "id": "", "code": "", "name": "", "cat": "board|…", "qty": 1, "unit": "pcs", "cost": 0,
                "itemId": "MAT-… (4.5: the inventory material this line uses, or empty)", "issued": "(4.5: how much of it was taken out of the stock for this project)" }],
    "schedule": [{ "id": "", "due": "YYYY-MM-DD", "amount": 0, "note": "" }],          (4.5, the same list as in the snapshot)
    "internalNotes": "",
    "feedback": { "score": 1, "comment": "", "at": "ISO" },
    "contract": { "lang": "", "no": "", "date": "YYYY-MM-DD or empty", "site": "", "warranty": "number of months or empty",
                  "payTerms": { "en": "", "ar": "" }, "extra": { "en": "", "ar": "" }, "clientSign": "true | false | null (null = use the default)",
                  "tpl": "(4.6) id of a template of Settings, or empty", "own": "(4.6) true = the clauses below are this project's own",
                  "terms": { "en": "", "ar": "" }, "status": "draft | issued | signed", "issuedAt": "YYYY-MM-DD or empty", "signedAt": "YYYY-MM-DD or empty" }
  }]
}
```

Finance definitions (`core/domain.js`): revenue = `price`; COGS = costs whose `type` is not `opex`; operating cost = costs of type `opex`; gross = revenue − COGS; net = gross − operating cost; gross margin = gross / revenue; net margin = net / revenue; markup = gross / COGS; collected = paid / revenue; remaining = revenue − paid.

## `data/private/settings.json` (sealed)

```json
{
  "v": 2, "prefix": "DS", "currency": "EGP", "seq": 0, "cseq": 1000, "defaultDays": 30,
  "reportFooter": { "en": "", "ar": "" },
  "brand": { "…": "same shape as brand.json" },
  "types": [{ "code": "KIT", "name": { "en": "Kitchen", "ar": "مطبخ" },
              "stages": [{ "key": "cutting", "name": { "en": "", "ar": "" }, "items": [{ "en": "", "ar": "" }] }] }],
  "contract": {
    "lang": "ar|en|both", "warrantyMonths": 12, "clientSign": true,
    "owner": { "name": { "en": "", "ar": "" }, "title": { "en": "Owner", "ar": "المالك" } },
    "signature": "data:image/png;base64,...   (a PNG, at most 150,000 characters, or empty)",
    "terms": { "en": "clauses separated by a blank line; first line = heading; {tokens}", "ar": "..." }
  }
}
```

`contract` is optional (added in 4.2); when it is missing the defaults are used (`defaultContract()` and `normContract()` in `admin/js/contract-terms.js` complete and clean whatever is stored). It lives only in this sealed file: the signature image and the clause text are never written to `brand.json`, the search index or a client snapshot.

4.6 adds three optional things. `contract.templates` is a list of at most 12 named sets of clauses `[{ "id", "name": { "en", "ar" }, "terms": { "en", "ar" } }]` (a project can point at one with `contract.tpl`). `"labels": { "size": "sq|strip", "length": 3-30 (cm, for a strip), "slogan": "at most 40 characters", "fields": ["logo", "flag", "clientId", "clientName", "sku", "title", "piece", "date", "qr", "barcode"], "copies": 1-20 }` is what a label prints. `"brands": [{ "id", "name" }]` is the list of brands (at most 80, a name at most 60 characters); an inventory item points at one with `brandId`. The settings file (4.5) also carries `labels`.

4.5 adds four optional fields: `"codes": { "inventory": "MAT-{CAT}-{N:4}", "suppliers": "SUP-{CAT}-{N:3}", "logistics": "SHP-{YY}{MM}-{N:4}" }` (the patterns of the internal codes: tokens `{CAT} {YY} {YYYY} {MM}` and exactly one `{N:n}`, at most 40 characters), `"paper": "A4|A3|Letter|Legal"` (the paper size of every printed document), `"costCats": { "direct": [{ "id": "x1a2b3c", "en": "", "ar": "" }], "indirect": [...] }` (cost categories of your own: an id of `x` + 6 hex digits that never changes, at most 20 per list, names up to 60 characters, one language is enough) and, inside `brand`, `look` (below). `normCodes()`, `normPaper()` and `normCostCats()` complete and clean whatever is stored.

4.4 adds two optional fields: `"budget": { "direct": 0, "indirect": 0 }` (the monthly budget for direct and indirect cost, set on the Finance screen; numbers, empty = no budget) and `"inboxKey": ""` (the private pick-up key of the client rating inbox, 16 to 64 letters, digits, `_` or `-`; it is never written to `brand.json` and never to the History).

4.7 adds two optional objects. `"control"` holds the sessions and the pay rules: `idleDefault` (minutes, 5 to 480, default 30), `roles` (role id or `owner` -> `{ idle (0 = device setting), shiftId, closeAtEnd, grace (minutes), outside: "allow|block" }`), `shifts` (at most 6: `{ id, name: { en, ar }, start "HH:MM", end "HH:MM" }`, the end must be after the start: a shift cannot cross midnight), `workDays` (0 = Sunday; default Saturday to Thursday), `ping` (minutes between "last seen" writes, 5 to 60) and `pay` (`monthDays` 26, `dayHours` 8, `otDay` 1.5, `otRest` 2, `round` 15, `minOt` 15, `toFinance` true). `"tech"` holds the technical switches: `features` (one flag per `FEATURE_KEYS`: suppliers, inventory, logistics, finance, collections, contracting, labels, staff; a missing key means on), `videoMb`, `fileMb` (1 to 50, default 24), `accessWatch` (seconds between checks that a team member is still allowed in, 30 to 900, default 120) and `siteUrl` (an `https://` address that share links are built from; empty = the address in use). Both are completed by `normControl` and `normTech` in `staff-data.js`; a repository without them behaves with these defaults.

4.8 adds one optional object. `"labelKinds"` holds the designs of the Labels screen, one per kind (`project`, `part`, `inventory`, `shipment`, `receipt`), each only when saved with *Save as default*: `{ "size": "p50x30", "length": 6, "w": 50, "h": 30, "fields": ["logo", "sku", ...] (in the order printed), "slogan": "", "copies": 1, "bg": "#ffffff", "fg": "#000000", "accent": "#555555", "font": "sans", "scale": 100, "align": "start", "border": "thin", "extra": [{ "text": "...", "b": false, "i": false, "size": "m", "align": "start" }], "mode": "page" }`. Sizes: `sq`, `strip`, `p50x30`, `p70x40`, `p100x60`, `p100x150`, `custom` (labels) or `a4`, `a5`, `roll80` (receipts); fonts `sans`, `serif`, `mono`, `rounded`; borders `none`, `thin`, `thick`, `round`; `scale` 70 to 160; at most six `extra` paragraphs of 160 characters; colours `#rrggbb`. Whatever is read is checked again (`lkNorm()`): an unknown value is replaced by the default, so a hand-edited file cannot break the screen. A page older than 4.8 keeps the object untouched when it saves other settings.

### Codes on labels and numbers of receipts (4.8, not stored)

| What | Code | Where it comes from |
|---|---|---|
| Project | `DS-KIT-2610-0001` | the project's SKU |
| Part / one piece | `<SKU>.<part>` / `<SKU>.<part>.<piece>` | the position of the part in the project (from 1) and of the piece in its quantity |
| Inventory item | `MAT-0001` | the item's number (the configured pattern) |
| Shipment / line | `LG-0001` / `LG-0001.<line>` | the shipment's number and the line (from 1) |
| Expense receipt | `V-EXP-0007`, `V-EXP-0007-2611` | the expense's number; a repeating expense adds the year and month of the repeat |
| Shipment cost receipt | `V-LG-0003` | the shipment's number |
| Payroll receipt | `V-PAY-2026-10-PPL-001` | month and person's number |
| Project cost receipt | `V-<SKU>-<line>` | the cost line's position in the project (from 1) |

Nothing here is written to any file: the number is worked out from the record every time, so renumbering a record changes its code, and an old sticker then no longer finds it (print again).

Eight project types ship as defaults (Kitchen, Dressing room, TV unit, Bathroom unit, Bedroom, Office furniture, Joinery, Custom project). They are editable in Settings.

## `data/private/ops/*.json` (sealed: suppliers, inventory, logistics)

Added in 4.3. Each file uses the same envelope as `settings.json` (`{ "v": 1, "iv": "...", "ct": "..." }`, AES-GCM under the master key). Decrypted, each is one list:

```json
{ "v": 1, "seq": 3, "updatedAt": "ISO", "items": [ ... ] }
```

`seq` is the highest number given so far, so an id is never reused after a delete. Ids: `SUP-001`, `MAT-0001`, `LG-0001`. A file does not exist until its first record is saved, and the client loader ignores the `ops/` folder (it lists files only). The sealed text of each file is limited to about 780,000 characters (`OPS_MAX_SEALED`) so it stays inside what the contents API returns for one file; the app refuses a save that would pass it.

**Supplier** (`suppliers.json`): `id`, `code` (4.5, from the pattern in `settings.codes`), `whatsapp` (4.5: a number or a WhatsApp link, empty = made from `phone`), `name`, `category` (`boards|edge|hardware|finish|glass|accessories|transport|tools|services|other`), `contact`, `phone`, `phone2`, `email`, `website`, `location`, `mapLink`, `link`, `address`, `terms`, `leadDays` (number or empty), `notes`, `active` (false = inactive), `createdAt`, `updatedAt`.

**Material** (`inventory.json`): `id`, `code`, `name`, `category` (the BOM categories), `unit` (the BOM units), `qty`, `min`, `max`, `reorderQty`, `cost` (the last four are numbers or empty), `supplierId`, `location`, `expiry` (`YYYY-MM-DD` or empty), `notes`, `createdAt`, `updatedAt`, and `moves`, newest first, at most 40:

```json
{ "at": "ISO", "type": "in|out|count", "delta": 25, "qty": 15, "note": "", "ref": "LG-0001 (only for stock received from a shipment)" }
```

`type` is `in` (received), `out` (used) or `count` (a stock-take: `qty` is the counted total). `ref` marks stock that came from a shipment, which is what makes receiving idempotent.

**Shipment** (`logistics.json`): `id`, `code` (4.5, from the pattern in `settings.codes`), `title`, `kind` (`inbound|outbound|transfer`), `supplierId` (inbound), `clientId`, `clientName`, `project` (SKU) (outbound), `ref`, `carrier`, `tracking`, `from`, `to`, `eta`, `cost`, `notes`, `cancelled`, `received` (date the lines were added to the stock, or empty), `createdAt`, `updatedAt`, `lines` and `steps`:

```json
"lines": [{ "id": "", "itemId": "MAT-0001 or empty", "name": "", "qty": 60, "unit": "sheet" }],
"steps": [{ "id": "", "name": "", "status": "pending|in_progress|done|blocked", "due": "YYYY-MM-DD", "doneAt": "YYYY-MM-DD", "note": "" }]
```

Derived, never stored: a shipment's state (`planned`, `in_progress`, `blocked`, `completed`, `cancelled`, from the steps), whether it is late (not finished and `eta` has passed), a material's alerts (out, low = at or below `min`, expired, expiring within 30 days, above `max`, no supplier, no minimum) and the suggested order quantity (`max(target - qty, reorderQty) - on order`, where `target` is `max`, or twice `min` when there is no `max`, and *on order* is the linked, unreceived lines of open incoming shipments).

Every record goes through a normaliser when read and when written (`normSupplier`, `normItem`, `normShipment` in `ops-data.js`): unknown values fall back to defaults and text is length-capped, so a hand-edited or older file cannot break a screen.

## `data/private/ops/expenses.json` (sealed, 4.4)

Same envelope and list shape as the other `ops` files (`seq` never reuses an id). Ids `EXP-0001`. One record is one **company expense**, a cost that belongs to no single project:

```json
{ "id": "EXP-0001", "date": "YYYY-MM-DD", "name": "Workshop rent", "kind": "direct|indirect",
  "cat": "rent", "amount": 4500, "repeat": "none|monthly|yearly", "until": "YYYY-MM-DD or empty",
  "supplierId": "SUP-001 or empty", "notes": "", "createdAt": "ISO", "updatedAt": "ISO" }
```

`kind` decides the side of the Finance screen: **direct** = production cost shared by the work (category from the BOM cost categories, e.g. materials, labour), **indirect** = overhead (`rent, utilities, salaries, marketing, vehicles, maintenance, insurance, taxes, depreciation, software, other`). A recurring expense counts once per month (or year) from `date` up to `until` or the end of the current month, never into the future. Derived and never stored: the period totals, the share of each project, the break-even point (`finCompute()` in `fin-data.js`).

4.7 adds one optional field to an expense, `"discount": 0` (what the supplier took off the invoiced `amount`; at most the amount). Finance counts the **net** (`amount - discount`, `expNet` in `ops-data.js`); the invoiced amount stays visible on the record. A guest or hospitality expense is an ordinary expense of kind `indirect` and category `hospitality`. A shipment (`logistics.json`) gains `"fin": "none|direct|indirect"`: how its cost reaches Finance. Old shipments read as `none`, so no past figure changes; a new shipment starts as `direct`.

## `data/private/team.json` (sealed, 4.4)

Only exists after the first member is added. Sealed with the master key like `settings.json`:

```json
{ "v": 1, "rev": 12, "kid": 1, "updatedAt": "ISO", "ownerName": "Abdo",
  "ownerLogin": { "username": "abdo", "file": "<32 hex>", "pub": { "RSA public JWK" }, "created": "ISO" },     (4.5: the administrator's own sign-in, or null)
  "roles": [{ "id": "manager", "name": "", "perms": { "clients": 2, "progress": 2, "finance": 2, "suppliers": 2, "inventory": 2, "logistics": 2, "reports": 2, "ratings": 2, "settings": 2, "audit": 1 } }],
  "users": [{ "id": "u-1a2b3c4d5e", "username": "mona.acc", "name": "Mona", "role": "accountant", "status": "active|paused|blocked",
              "file": "<32 hex>", "pub": { "RSA public JWK" }, "note": "", "created": "ISO", "createdBy": "", "changed": "ISO" }] }
```

`perms` has one number per area: `0` none, `1` view, `2` edit. The areas are `clients, progress, finance, suppliers, inventory, logistics, reports, ratings, settings, audit`. The five built-in roles (`manager, accountant, production, sales, viewer`) can be edited but never disappear; extra roles are free text ids. **Team** and **Configuration** (admin password, token, connection codes, encryption key) are not areas: only the administrator can open them. `rev` rises with every save (two devices that save at the same moment are merged by re-applying the change); `kid` is the number of the current encryption key, raised by *Change the encryption key*.

## `data/private/keys/<hash>.json` (a team member's login file, 4.4)

`<hash>` is the first 32 hex characters of SHA-256 of `dsp-user-v1:<user name in lower case>`, so the sign-in screen finds the file from the user name alone.

```json
{ "v": 1, "uid": "u-1a2b3c4d5e", "pub": { "RSA public JWK" }, "must": true,
  "env": { "k": "<RSA-OAEP(AES key), base64>", "iv": "", "ct": "<AES-GCM of {m: master key, t: GitHub token, kid}>" },
  "salt": "<base64>", "iv": "", "ct": "<member's RSA private key, AES-GCM under PBKDF2-SHA256(310,000) of the member's password>" }
```

The administrator's own sign-in (4.5) is the same kind of file with `"owner": true`; it counts only while `team.json` still lists it as `ownerLogin`. The file is **public like every file in a public repository**: it is only as strong as the member's password (at least 10 characters is enforced; a long phrase is better). `must` makes the member choose their own password at the first sign-in. Blocking a member deletes the file; the next *Change the encryption key* makes any copy that was downloaded useless (see SECURITY.md).

## `data/private/profiles/<id>.json` (sealed, 4.5)

One file per signed-in person (`<id>` is the member's id, or `owner`), sealed with the master key like `settings.json`. Decrypted:

```json
{ "v": 1, "phone": "digits, + ( ) - and spaces, at most 30", "pic": "data:image/jpeg|png|webp;base64,...  (at most 60,000 characters, or empty)" }
```

The name of a member lives in `team.json`; the administrator's name in `team.json.ownerName`. Each person may write only their own file (the write guard in `perm.js`); the Team list reads them all.

## `data/private/files/<id>.bin` (sealed, 4.6)

An invoice (pdf, or a picture shrunk to JPEG) kept with an expense or a shipment, or the full picture of an inventory item. Bytes, not JSON: `IV (12 bytes) || AES-GCM ciphertext` with the **master key** (the same sealing as a client's photo, but the administrator's key); at most about 780 KB sealed, because the contents API of GitHub hands out files up to 1 MB. The record holds only `{ id, name, type, size, at }` in its `files` list (expenses and shipments) or, for an inventory item, `image` (the file id), `thumb` (a JPEG data URL of 72 px, at most 4,500 characters, shown in lists) and `brandId`. A file is uploaded when its record is saved and deleted after a record that dropped it is saved; the key change (re-encryption) re-seals these files with the rest.

## `data/private/ops/people.json` (sealed, 4.7)

Same envelope and list shape as the other `ops` files; ids are `PPL-001`, never reused. One record is one person who is paid by the business (the people are not the team members who sign in; a person may point at a team member with `memberId` so that the sign-in records can fill the time sheet):

```json
{ "id": "PPL-001", "name": "", "kind": "staff|casual", "basis": "month|day|hour", "rate": 0,
  "cost": "direct|indirect", "memberId": "", "phone": "", "start": "YYYY-MM-DD or empty", "end": "YYYY-MM-DD or empty",
  "active": true, "otDay": "", "otRest": "", "notes": "", "createdAt": "ISO", "updatedAt": "ISO" }
```

`rate` is a whole month, a day or an hour according to `basis`. `otDay` and `otRest` replace the company's overtime multipliers for this person (empty = use the company's). `cost` says whether this person's pay reaches Finance as a direct or an indirect cost. The normaliser is `normPerson` in `staff-data.js`.

## `data/private/staff/pay-YYYY-MM.json` (sealed, 4.7)

```json
{ "v": 1, "month": "YYYY-MM", "closed": false, "closedAt": "", "updatedAt": "ISO",
  "entries": [{ "id": "", "date": "YYYY-MM-DD", "pid": "PPL-001", "type": "work|overtime|extra|absent|leave",
                "hours": 0, "days": 1, "amount": "", "sku": "", "note": "", "src": "manual|sheet|att" }],
  "adj": [{ "id": "", "pid": "PPL-001", "type": "bonus|deduction|advance", "amount": 0, "note": "", "date": "YYYY-MM-DD" }] }
```

At most 2,500 entries and 600 adjustments per month. An entry whose date is outside the month is dropped when read. `src` says where it came from (`att` = made from the sign-in records, `sheet` = the day sheet). The pay itself is **never stored**: it is a plain function of the person, the entries, the adjustments and the rules (`payFor` in `staff-data.js`), so the payroll screen, the report and Finance always show the same numbers.

## `data/private/staff/att/YYYY-MM/<id>.json` (sealed, 4.7)

One file per signed-in person and month, written **only by that person** (so records never collide):

```json
{ "v": 1, "uid": "", "name": "", "role": "owner|<role id>", "month": "YYYY-MM",
  "sessions": [{ "id": "", "in": "ISO", "seen": "ISO", "out": "ISO or empty", "how": "manual|idle|shift|lost|month", "shift": "", "stay": false }] }
```

`seen` is rewritten every `control.ping` minutes while the page is open; a session nobody closed ends where it was last seen (`how: "lost"`). At most 300 sessions per file. `how` is `manual` (signed out), `idle` (closed after inactivity), `shift` (closed at the end of the shift), `lost` (nobody closed it) or `month` (the month changed while the page stayed open); a stop forced by the administrator writes nothing, because the keys are taken away first. The times come from the clock of the device, not from a server.

## `data/private/audit/YYYY-MM[-n].json` (sealed, 4.4)

The History. One file per calendar month (a second `-2` file when one reaches about 700 KB). Sealed with the master key:

```json
{ "v": 1, "month": "2026-10", "part": 1, "items": [
  { "id": "9fa3c1d2", "at": "ISO", "uid": "u-1a2b3c4d5e", "who": "Mona", "role": "accountant", "area": "client|ratings|suppliers|inventory|logistics|expenses|settings|team|session|reports|config",
    "act": "create|update|delete|import|…", "ref": "DS-CL-1001", "title": "Ahmed Mohamed",
    "ch": [["payments[2].amount", "5000", "7500"]], "note": "", "h": "a1b2c3d4e5f6" } ] }
```

`ch` lists up to 30 fields as `[field, before, after]` (long values cut at 100 characters; `secret` and `inboxKey` are always shown as `•••`; photos as `(image)`). `h` chains the entries: the first 12 hex characters of SHA-256 of the previous entry's `h` followed by this entry as JSON without `h`. The History screen recomputes the chain and shows **Intact** or **Broken**. See SECURITY.md for what the chain does and does not prove.

## `data/private/vault.json`

```json
{ "v": 1, "salt": "<base64, 16 bytes>", "iv": "<base64>", "ct": "<base64>" }
```

`ct` is the AES-GCM encryption of the base64 of the 32-byte master key, under PBKDF2-SHA256(310,000) of the admin password and `salt`.

## Photos

`data/clients/<id>/<photoId>.t` and `.f`: `IV (12 bytes) || AES-GCM ciphertext` of a JPEG. `.t` is at most 360 px on the long side (quality 0.72), `.f` at most 1600 px (quality 0.82). Source files up to 30 MB are accepted; they are decoded and re-encoded in the browser, which also strips EXIF data such as GPS. Link photos (`kind: "link"`) store only a URL.

**Videos and files (4.6).** `<id>.v` is a video and `<id>.d` a file to download, both `IV (12 bytes) || AES-GCM ciphertext` with the client's own key, like `.f`; a video has a poster `<id>.t`. Videos and files are limited to 24 MB because the browser reads one whole. A video link (`kind: "vlink"`) stores only a URL: a direct file plays in the page, other sites open on their own page.

## Rating code

```
DSFB1.<clientId>.<base64url( CryptoJS.AES(json, clientPassphrase) )>
json = { "v": 1, "id": "<clientId>", "sku": "<project>", "score": 1..10, "comment": "…", "at": "ISO" }
```

The admin Dashboard imports any text that contains codes (pattern `DSFB1\.[A-Za-z0-9_-]{3,40}\.[A-Za-z0-9_-]+`).

Since 4.4 the client site can also **send** the code itself to the company inbox (a Google Apps Script web app, [INBOX.md](INBOX.md)), and the admin site pulls it. The requests are plain `text/plain` POSTs (so the browser needs no preflight), JSON bodies, JSON answers:

```
client -> inbox   { "v": 1, "code": "DSFB1...." }                          <- { "ok": true }  or  { "ok": false, "error": "bad|limit|busy" }
admin  -> inbox   { "v": 1, "op": "ping", "key": "<pick-up key>" }          <- { "ok": true, "total": 12 }  or  { "ok": false, "error": "key" }
admin  -> inbox   { "v": 1, "op": "pull", "key": "…", "after": 7 }          <- { "ok": true, "items": [{ "n": 8, "code": "DSFB1…." }], "next": 8, "total": 12 }
```

`n` is the row number in the inbox sheet; at most 200 rows are returned per answer. The admin keeps the last `next` it fully imported in the browser (`localStorage`, key `dsp.inbox.<end of the address>`), so another device starts from 0 and recognises ratings it already has (same `at`).

## Connection code

```
DSPCONN1.<base64( JSON { "v": 1, "user": "…", "repo": "…", "salt": "…", "iv": "…", "ct": "…" } )>
```

Lets a second device join without retyping owner, repository and token. `salt`, `iv`, `ct` are the sealed token from `localStorage` `dsp.config.v1`, so the code is useless without the admin password. Validated on import (`user` and `repo` patterns, base64 fields, size cap).

## Compatibility

- The formats above are unchanged from the single-file version of the portal; a repository created by it keeps working with this layout.
- 4.8 only **adds** one thing: the optional `settings.labelKinds`. Nothing else changed in any file; a repository goes back to 4.7 without damage (the Labels screen is then the one-project screen of 4.6).
- 4.7 only **adds** things: `ops/people.json`, `staff/pay-YYYY-MM.json`, `staff/att/YYYY-MM/<id>.json`, the optional `settings.control` and `settings.tech`, an expense's `discount` and a shipment's `fin`. A repository without them behaves like 4.6 (no staff, no limits, no shift). Going back to 4.6 loses nothing, but 4.6 pages do not know `settings.control` and `settings.tech` and would drop them the next time settings are saved from that page: use 4.7 on every device that saves settings.
- 4.6 only **adds** things: `files/*.bin`, a client's `<id>.v` and `<id>.d` files, a project's `downloads`, photo kinds `video` and `vlink`, a schedule row's `deposit`, the contract fields `tpl`, `own`, `terms`, `status`, `issuedAt` and `signedAt`, the settings `labels`, `brands` and `contract.templates`, an inventory item's `brandId`, `thumb` and `image`, and `files` on expenses and shipments. An older page ignores them (and a page of 4.5 that saves a record drops the fields it does not know, so use 4.6 on every device that edits). Going back to 4.5 loses nothing in the repository; the new files are then simply not shown.
- 4.5 only **adds** things: `profiles/`, `team.json.ownerLogin` and a key file with `owner: true`, the optional `settings.codes`, `settings.paper` and `settings.costCats`, `brand.look`, a project's `schedule` (private record and client snapshot), a BOM line's `itemId` and `issued`, a client's and a supplier's `whatsapp`, a supplier's and a shipment's `code`. Older pages ignore them. A repository can go back to 4.4, but a 4.4 page that saves a project or the settings rewrites them without the 4.5 fields, so use 4.5 on every device that edits.
- 4.4 only **adds** things: `ops/expenses.json`, `team.json`, `keys/`, `audit/`, the optional `settings.budget` and `settings.inboxKey`, and `brand.inbox`. A repository with none of them behaves exactly like 4.3 (the administrator is the only user). Going back to 4.3 loses nothing, but older pages ignore the new files, do not write the History and do not enforce roles: do not let team members use an older page. After the first member is added, use 4.4 or newer on every device.
- 4.3 added the three sealed files under `data/private/ops/`. Nothing else changed; older versions ignore the folder, so a repository can go back to 4.2 without damage (the three sections are then simply not available).
- 4.2 added the optional `settings.contract` and the optional per-project `contract` of the private record. Old records open unchanged; use 4.2 or newer on every device that edits settings, so the contract settings are not lost by an older page that does not know them.
- Adding a field is safe: readers ignore unknown fields and fill defaults (`normalizeRec`, `upgradePublic`). Changing a salt string, an iteration count, a prefix or a schema tag **breaks existing data**; if you must, bump the tag (`dscl/3`) and keep the reader for the old one.
