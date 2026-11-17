# Feature checklist, A to Z

Status: ✅ delivered and tested (4.8 and before) · 🔧 built in the working copy and being tested · ⬜ not built yet (version it is planned for).
Dates are estimates. Every version is split so that nothing is half-done at delivery; what could not be tested here is always named in the changelog.

## What comes when (about ten days per version, estimates)

| Version | What it brings | State |
|---|---|---|
| 4.7 Control | Sessions and shifts, staff and pay, costs into Finance, language fixes | ✅ delivered |
| 4.8 Labels and receipts | Labels of every kind in bulk with QR code and barcode, a receipt for every cost, a label designer, find by code, on-demand loading | ✅ delivered |
| 4.9 Pricing and Contract designer | Price by the meter, by cost plus margin, by cabinet price; quotes into the contract; the 267 pricing strategies; the contract paper designer | ⬜ |
| 5.0 to 5.5 Industrial Zone | Six phases: foundation (standards, materials), cutting list, matching, optimization and offcuts, costing and quality, dataset | ⬜ |
| 5.6 | Dashboard charts (15 types), layout for large screens, faster loading, language check list | ⬜ |
| 5.7 | Team sign-in request form, more security layers, faster loading | ⬜ |
| 5.8 | Business strategy and marketing, campaigns, strategy check lists | ⬜ |
| 5.9 | Documentation inside the system, tokens and API connections, other storage | ⬜ |
| 6.0 | Business Hub (three modes), company finance profile | ⬜ |
| 6.1 | Equipment and tools, browser notifications | ⬜ |
| 6.2 | Google Drive uploads and automations | ⬜ |
| 6.3 | Offline work, payroll and attendance reports, HR file, call center | ⬜ |
| 6.4 | AI with Gemini, client traffic reports | ⬜ |
| Later | Industrial AI layer (phase 7), the unapproved items of the industrial assessment | ⬜ |

## Access & team
- ✅ Administrator sign-in: admin password + token, or user name + password on any device
- ✅ Team members with user name and password (they choose their own at the first sign-in)
- ✅ Roles: five ready ones and your own; No access / View / Edit for each area
- ✅ Pause or block a member (takes effect within minutes)
- ✅ Change the encryption key (re-seals every private file)
- ✅ Profile: name, phone, picture
- ✅ Built-in IT role and two new areas (Staff & pay, Technical)
- ⬜ Team sign-in request by form (v5.7)

## AI (Gemini)
- ⬜ Assess work, suggest improvements, solve problems, predictive reports, briefs, printable, with its own settings (v6.4)

## Attendance & shifts
- ✅ Sign-in records per person (sign-in, last seen, how it ended)
- ✅ Shifts per role; at the end of the shift: Stay (the rest is overtime) or Sign out
- ✅ Idle sign-out per role (default 30 minutes for the team)
- ✅ Option to refuse sign-in outside the shift
- ✅ Live status: online now, last seen, hours today and this month
- ✅ Sessions and shifts logged in the History

## Automation
- ⬜ Google Drive, Docs, Excel and WhatsApp automations with full settings (v6.2)

## Backup & other storage
- ✅ Connection screen: change repository, token, password
- ✅ Repository connection test (repo, branch, write access, data folders, vault, requests left)
- ⬜ Save data to other free hosting and other repositories (v5.9)
- ⬜ Upload pictures, contract papers and 2D/3D files to Google Drive with branded preview and download (v6.2)

## Business Hub
- ⬜ Three modes: Contracting & Construction, Industrial Line, Furniture Manufacturing; every hub feature in all modes (v6.0)
- ⬜ Hub launcher page for the sections to come (v6.0)
- ⬜ Company finance profile: gross, profitability, valuation, partnership, shares, taxes, investments, debts and loans (v6.0)

## Call center
- ⬜ Client calls: call periods, feedback, follow-up (v6.3)

## Charts & dashboard
- ✅ Report charts (bar, line, donut) in PDF, picture and Excel
- ✅ Company overview report
- ⬜ Growth and revenue charts on the dashboard (v5.6)
- ⬜ Chart types you can switch between, with the best one as the default for each chart: KPI cards, bar, line, pie, donut, area, stacked bar, funnel, gauge, waterfall, treemap, heatmap, scatter, Gantt, Pareto (v5.6)

## Client portal (client site)
- ✅ Live search by Client ID or project number, private page opened with the secret key
- ✅ Stages, parts, photos, time left, balance, down payment and next payment
- ✅ Ratings out of 10 with a comment, sent from the site itself
- ✅ Video, zoom viewer, downloads (2D/3D, drawings), save our contact
- ✅ Search suggestions: tap-to-complete, Arabic digits, spaces and dashes understood
- ⬜ Client traffic sent to the admin with traffic reports (v6.4)

## Collections
- ✅ Collection schedule per project, money matched to instalments, overdue, report, down payment

## Contracts
- ✅ Printable contract with logo and signature, per-project wording, named templates, Arabic / English / both
- ✅ Formal black-and-white copy, Contracting section and report
- ⬜ Contract paper designer: theme, colours, fonts, a proper editor, extra fields and paragraphs, wrapping, format tools (v4.9, with Pricing)

## Documentation
- ✅ Files: README, architecture, security, data format, deployment, development, user guide, code map, Arabic quick start, changelog
- ✅ This checklist
- ⬜ Documentation inside the system, searchable, in both languages (v5.9)

## Equipment & tools
- ⬜ Tools and equipment inventory with repair history and costs (v6.1)

## Finance
- ✅ Project finance (cost of goods, profit, margin), direct / indirect / total cost, expense ledger, repeating costs, budget, break-even
- ✅ Your own cost categories, shared costs spread over projects
- ✅ Payroll counted in Finance (monthly, direct or indirect), no double counting
- ✅ Shipment costs counted in Finance (a switch on each shipment; old shipments stay off)
- ✅ Discount on an expense (Finance counts the amount after the discount)
- ✅ Guests and hospitality: a "Guest expense" button that opens an indirect expense in the Hospitality category
- ✅ A printable receipt for every cost: company expenses (every repeat), shipment costs, payroll (Staff & pay only) and project cost lines; A4, A5 or an 80 mm roll; number, QR code, barcode and two signature lines (4.8). Not a tax invoice
- ⬜ Receipts for money coming in (client payments) (not built; say if you want it)
- ⬜ Company finance profile (v6.0)

## History
- ✅ History of every change with who, when, before and after; chained so an edited entry shows Broken; report
- ✅ History texts follow the language of whoever reads them

## Import & export
- ✅ Import CSV / Excel / JSON into inventory, suppliers, shipments, expenses, with a preview
- ✅ Reports as PDF, Excel and picture; settings file export and import
- ⬜ Export of payroll and attendance (v6.3)

## Industrial zone (furniture side, its own menu group, no AI in the first release)
Planned from the specification you attached on 1 November. It stays separate from Projects and is linked only by project and BOM item IDs.
- ⬜ Phase 1, foundation: the zone and its permissions; standards library (official external, manufacturer, Dusur internal, project-specific; a record is never shown as official unless verified); material library with colour, finish, texture and verification status; project and BOM links; revision history (v5.0)
- ⬜ Phase 2, cutting list engine: parts per project and product, finished and cutting sizes, saw kerf, edge banding compensation, grain rules, cutting allowances, validation, reports and labels (v5.1)
- ⬜ Phase 3, material matching: exact, compatible, similar appearance, technical alternative, needs review, no match; catalogue import; a substitution needs approval (v5.2)
- ⬜ Phase 4, optimization and inventory: sheet nesting with offcuts, utilisation and waste, stock and offcut tracking (v5.3)
- ⬜ Phase 5, costing and quality: manufacturing cost breakdown with assumptions, quality control, estimated against actual (v5.4)
- ⬜ Phase 6, dataset: collection with status, review, export, de-duplication (v5.5)
- ⬜ Import and export in CSV and JSON first; XLSX and XML next; DXF, SVG, PDF as data extraction only where tested; DWG, STEP and machine formats named as not supported until an adapter is built and tested (v5.1 onward)
- ⬜ Colour indicator that reads colours from a picture (in the browser, no AI) (v5.0 / v5.2)
- ⬜ Phase 7, AI layer (Gemini; cannot be tested in the build workspace): only after enough verified data (later)
- ⬜ Not approved yet, from the assessment: routing and work orders, labour-cost source of truth, material requirements from open projects, inspection and corrective action, lead time and capacity, supplier scorecard, equipment maintenance, change control, work instructions (IR-01, 03, 04, 06 to 08, 10 to 13)

## Integrations (tokens and API)
- ✅ Google Apps Script inbox for ratings
- ⬜ Tokens and API connections to providers such as Cloudflare, kept sealed, in the technical section (v5.9)

## Inventory
- ✅ Materials, minimum / maximum, alerts for every item, receive / use / stock-take, to-order list, table and cards
- ✅ Internal codes, units linked to the BOM and "take from stock", brands and pictures, invoice files
- ⬜ Reorder from the inventory straight to a shipment (not planned yet, say if you want it)

## Labels
- ✅ 2.5 × 2.5 cm and strip labels, per project or per piece, QR code and Code 128 barcode
- ✅ Labels as their own section (Production group): projects, parts, inventory items, shipments, each with a QR code and a Code 128 barcode of its number (4.8)
- ✅ A lot of labels at once: every piece of every part, every line of a shipment, copies (up to 50 each), up to 400 labels in one go (4.8)
- ✅ Sizes 25 × 25, strip, 50 × 30, 70 × 40, 100 × 60, 100 × 150 mm and any size; one label per page, or side by side on a sheet (4.8)
- ✅ Save as picture: one PNG named after the code, or all labels in one ZIP (4.8)
- ✅ Label designer: five themes, free colours (with a readability warning), font, text size, alignment, border, order of the lines, up to six extra paragraphs with fields, saved per kind (4.8)
- ✅ Find a record from a scanned or typed code (a keyboard scanner works) (4.8)
- ⬜ Scan with the phone camera (not built; say if you want it)
- ⬜ Format tools inside the paragraphs (colour of one word, lists) and a free drag-and-drop layout (not planned yet)

## Language & look
- ✅ Arabic and English with right-to-left, dark and light, fonts, accent colour, paper sizes
- ✅ Arabic words in English mode: history entries and shipment steps now follow the language in use
- ⬜ Language check: a list of content that is missing one language (v5.6; it was planned for 4.7 and is not built)
- ⬜ Layout for large screens (v5.6)

## Logistics
- ✅ Shipments from suppliers, to clients and between places, editable steps, progress, reports
- ✅ Shipment cost into Finance (a switch)

## Marketing & strategy
- ⬜ Business strategy and marketing section (v5.8)
- ⬜ Upcoming campaigns: plan, dates, budget, status (v5.8)
- ⬜ Strategy sections as check lists with a toggle for each item (v5.8)

## Notifications
- ⬜ Browser notifications (only while the portal is open; no server can wake a closed page) (v6.1)

## Offline
- ⬜ Offline sign-in and queued changes saved in the browser and uploaded later (v6.3)

## Pay & HR
- ✅ People list: staff and casual daily workers
- ✅ Pay by the hour, the day or the month; overtime and extra shifts with multipliers; bonuses, deductions, advances
- ✅ Payroll sheet per month, day sheet, fill from sign-in records, close a month
- ⬜ Payroll and attendance reports, pay slips, Excel (v6.3)
- ⬜ HR file per person (v6.3)

## Photos, video & files
- ✅ Photos from gallery or camera, sealed, video up to 24 MB or a link, downloads for the client, invoices on records

## Pricing & quotes
- ⬜ Pricing section: a price list and a calculator (v4.9)
- ⬜ Price by the meter (linear or square), by cost plus profit margin (markup and margin shown side by side), or by cabinet price (v4.9)
- ⬜ Options that change the price: material, finish, hardware, size, delivery, installation (v4.9)
- ⬜ A quote per client and project, with discounts, extras and tax, kept as numbered versions (v4.9)
- ⬜ Put the quote into the contract paper and into the project's money figures (v4.9)
- ⬜ Pricing strategies library: all 267 strategies in 15 groups (your list is numbered 1 to 267), in English and Arabic, each marked as calculated by the system, applied as a discount or payment plan, or guidance only (v4.9)
- ⬜ Pick a strategy on a quote; the system applies the ones it can calculate and notes the rest (v4.9)

## Production progress
- ✅ Progress screen: tick rows, tick all, part statuses, photos, "tell the client" on WhatsApp
- ✅ A Production group in the menu (Progress, Labels & receipts) (4.8)
- ⬜ A parts board across all projects with status changes in one place (found missing in the 4.8 scan of Production; needs a careful design because each project is saved and published separately)
- ⬜ Dimensions and material on parts, the cutting list (Industrial Zone, v5.1)
- ⬜ Work orders and routing; quality and defects (two items of the industrial assessment that wait for your approval)

## Reports
- ✅ Finance, BOM, production, satisfaction, inventory, reorder, movements, suppliers, shipments, collections, costs, contracts, history, company overview
- ⬜ Payroll and attendance (v6.3), campaigns (v5.8)

## Security & privacy
- ✅ Client files AES-256; private files AES-GCM under a master key; password-derived keys (PBKDF2, 310,000 rounds); strict page security policy; nothing hard-coded
- ⬜ Many more layers, chosen and explained honestly (v5.7)

## Settings & Control
- ✅ Company profile, business defaults, project types and stages, contract wording, codes, paper, fonts, brands, cost categories, labels
- ✅ Control screen for the IT role: feature switches, upload limits, share address, sessions and shifts per role, repository test
- ✅ Staff rules: week days, overtime, rounding, payroll into Finance

## Share & links
- ✅ Share button on every record and report (WhatsApp, e-mail, copy, phone share sheet)
- ✅ Share links built from the address the page is served from (custom domain works), or an address you type in Control

## Speed
- ✅ Loading budgets tested on every screen
- ✅ Lazy loading of whole screens: the Labels screen is read the first time it is opened, not on the first visit (4.8); the loader is ready for the other large screens
- ⬜ Faster data loading: fewer requests, caching, move more screens to the loader (v5.6 / v5.7)

## Suppliers
- ✅ Directory with safe call / WhatsApp / mail / website / map links, search and filters

## Troubleshooting & quality
- ✅ Troubleshooter, start-up diagnostics, 1,573 automated checks at 4.8, audits of every screen
- ✅ 4.7: new test suites for Control, staff and pay, costs in Finance and language, and a quality audit of the new screens (it found a stray word "null" in the payroll entry form and a role table too narrow on phones; both fixed)

## Zero server (the standing rules)
- ✅ No backend, no database, no build step; GitHub Pages and the GitHub API only
- ✅ No token, password or repository detail in the code
- Cannot be done without a server (so not promised): a push to a closed browser, limiting wrong-password tries, an e-mail sent by the portal itself, calling Cloudflare's API straight from the browser
