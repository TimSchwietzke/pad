# DESIGN.md – Personal Assistant Dashboard (pad)

> **Status:** Entwurf v0.3 · Stand: 2026-07-05
> Visuelle Referenz für pad. Antwortet auf „Wie sieht es aus".
> Hinweis: Diese Datei wird von **impeccable** gelesen (`/impeccable *` liest PRODUCT.md + DESIGN.md).
> Empfohlen: einmal `/impeccable init` laufen lassen, um sie ins kanonische Format zu gießen
> und die noch fehlende PRODUCT.md zu erzeugen.

---

## 1. Project Overview

Das Personal Assistant Dashboard (pad) ist eine Produktivitäts- und Verwaltungsanwendung
im SaaS-Stil. Es bündelt **ToDos (Kanban/Listen), Kalender, Bewerbungs-Tracking** sowie –
später – **Email, Projekt-Übersicht und Smart-Home-Steuerung** in einer zentralen Oberfläche.

Das Interface ist datengetrieben, dashboard-orientiert (konfigurierbares Drag&Drop-Grid)
und unterstützt **mehrere umschaltbare Theme-Presets von Anfang an**. Das Theming ist
zweidimensional: **Preset × Modus**.

- **Preset „Standard"**
  - *Hell* – Orientierung *Excel*: weiß, eine wiederkehrende Akzentfarbe, Grau als Kontrast.
  - *Dunkel* – Orientierung *Notion*: ruhige, dunkle Flächen, dezente Rahmen statt harter Schatten.
- **Preset „Google"** – der bekannte, sofort verständliche Material-/Workspace-Look.
  - *Hell* – weiß, Google-Blau, große runde Ecken, Pill-Buttons, viel Whitespace.
  - *Dunkel* – Google-Dark (dunkles Grau, hellblauer Akzent `#8AB4F8`).

Presets und Modus sind **zur Laufzeit umschaltbar** und vollständig token-basiert (siehe §2).

---

## 2. Design Tokens

Tokens werden in SCSS gepflegt und als **CSS Custom Properties** ausgegeben, damit der
Theme-Wechsel zur Laufzeit ohne Komponenten-Änderung funktioniert (vgl. ARCHITECTURE.md §7.3).

> **Redesign v0.3 (2026-07-05):** Das Standard-Preset hat jetzt eine eigene **Teal/Petrol-
> Identität** (kein generisches Blau mehr), dark-first auf Linear-Niveau, mit gekonnt-sparsamem
> Akzent (nie großflächig). Umgesetzt als **zweischichtiges Token-System**: eine primitive
> OKLCH-Akzent-Ramp (`--accent-50..900`) + Semantic-Tokens (`--color-*`), plus ein echtes
> **Elevation-System** (3 Flächen-Ebenen `--color-bg-sidebar/surface/surface-2/surface-3` +
> `--shadow-sm/md/lg` + `--shadow-glow`). Ein späteres Design = Akzent-Ramp tauschen, ohne
> Komponenten anzufassen. **Quelle der Wahrheit ist `frontend/src/styles/tokens.scss`;** die
> Hex-Tabellen unten sind der frühere Stitch-Entwurf und historisch. Das **Google-Preset bleibt
> unverändert** (Google-Blau/Material).

**Theming-Modell:** Token-Werte hängen von zwei Achsen ab – **Preset** (`Standard` | `Google`)
und **Modus** (`hell` | `dunkel`). Auswahl über Attribute am Root-Element, z. B.
`[data-preset="google"][data-mode="dark"]`; `Standard` + `hell` ist der Default (`:root`).
Komponenten lesen **nur** die `--color-*`/`--radius-*`/`--font-*`-Tokens und kennen den Preset nicht.

### 2.1 Farben – Preset „Standard" (Excel hell / Notion dunkel)

Default = Hell (`:root`), Dunkel = `[data-mode="dark"]`.

| Token | Hell (Excel) | Dunkel (Notion) | Verwendung |
|---|---|---|---|
| `--color-bg-app` | `#F7F8FA` | `#191919` | Haupt-Hintergrund |
| `--color-bg-surface` | `#FFFFFF` | `#202020` | Cards, Sidebar, Top-Nav |
| `--color-bg-surface-2` | `#F1F3F5` | `#262626` | dezente Sekundärfläche, Hover-Rows |
| `--color-border` | `#E3E6EA` | `#333333` | Rahmen für Cards/Inputs/Trennlinien |
| `--color-sidebar-active` | `#E9F2FF` | `#1C2A3A` | aktiver Menüpunkt |
| `--color-text-primary` | `#1F2329` | `#EDEDED` | Überschriften, Haupttext |
| `--color-text-secondary` | `#5C636A` | `#A1A1A1` | Sublines, Metadaten |
| `--color-text-placeholder` | `#868E96` | `#6B7280` | Platzhalter (Kontrast prüfen, ≥4.5:1) |
| `--color-primary` | `#0D6EFD` | `#3B82F6` | Buttons, aktive Links, Badges, Checkboxen |
| `--color-primary-hover` | `#0B5ED7` | `#60A5FA` | Hover-/Active-Zustand der Primärfarbe |
| `--color-primary-bg` | `#E9F2FF` | `#1C2A3A` | dezenter Akzent-Hintergrund (Badges, aktive States) |
| `--color-danger` | `#DC3545` | `#F87171` | High-Priority-Badges, Notification-Dots |
| `--color-danger-bg` | `#F8D7DA` | `#3A1D1F` | roter Badge-/Alert-Hintergrund |
| `--color-success` | `#198754` | `#4ADE80` | „Erledigt"-Status, Erfolg |
| `--color-success-bg` | `#D1E7DD` | `#14301F` | grüner Badge-/Alert-Hintergrund |

### 2.2 Farben – Preset „Google" (hell / dunkel)

Aktiv über `[data-preset="google"]` (+ optional `[data-mode="dark"]`). Werte orientieren sich an
Google Workspace / Material You; Google-typisch sind das ruhigere Blau und im Dunkelmodus das
hellblaue `#8AB4F8`.

| Token | Hell | Dunkel | Verwendung |
|---|---|---|---|
| `--color-bg-app` | `#FFFFFF` | `#202124` | Haupt-Hintergrund |
| `--color-bg-surface` | `#FFFFFF` | `#292A2D` | Cards, Sidebar, Top-Nav |
| `--color-bg-surface-2` | `#F1F3F4` | `#35363A` | dezente Sekundärfläche, Such-Input |
| `--color-border` | `#DADCE0` | `#3C4043` | Rahmen/Trennlinien (Google-Grau) |
| `--color-sidebar-active` | `#E8F0FE` | `#283B53` | aktiver Menüpunkt |
| `--color-text-primary` | `#202124` | `#E8EAED` | Überschriften, Haupttext |
| `--color-text-secondary` | `#5F6368` | `#9AA0A6` | Sublines, Metadaten |
| `--color-text-placeholder` | `#80868B` | `#80868B` | Platzhalter (Kontrast prüfen, ≥4.5:1) |
| `--color-primary` | `#1A73E8` | `#8AB4F8` | Buttons, aktive Links, Badges |
| `--color-primary-hover` | `#185ABC` | `#AECBFA` | Hover-/Active-Zustand |
| `--color-primary-bg` | `#E8F0FE` | `#283B53` | dezenter Akzent-Hintergrund |
| `--color-danger` | `#D93025` | `#F28B82` | High-Priority/Fehler |
| `--color-danger-bg` | `#FCE8E6` | `#3A1E1B` | roter Badge-/Alert-Hintergrund |
| `--color-success` | `#1E8E3E` | `#81C995` | „Erledigt"-Status, Erfolg |
| `--color-success-bg` | `#E6F4EA` | `#1E331F` | grüner Badge-/Alert-Hintergrund |

### 2.3 Schatten – themed

| Token | Hell | Dunkel |
|---|---|---|
| `--shadow-sm` | `0 1px 2px rgba(0,0,0,0.04)` | `0 1px 2px rgba(0,0,0,0.40)` |
| `--shadow-md` | `0 4px 12px rgba(0,0,0,0.06)` | `0 4px 12px rgba(0,0,0,0.45)` |

Im Dunkel-Modus tragen Schatten weniger, **Trennung erfolgt primär über `--color-border`**
(Notion-Charakter). Der Google-Preset (hell) darf bewusst etwas mehr Elevation zeigen
(`--shadow-md` an Cards) – Material-typisch.

### 2.4 Preset-spezifische Komponenten-Tokens

Nicht nur Farben unterscheiden die Presets, sondern auch Form und Schrift. Diese semantischen
Tokens entkoppeln Komponenten von konkreten Skalenwerten – Komponenten nutzen `--radius-button`
etc., der Preset entscheidet den Wert.

| Token | Preset „Standard" | Preset „Google" | Verwendung |
|---|---|---|---|
| `--font-family-base` | `Inter` | `"Google Sans", Roboto` ¹ | Grundschrift |
| `--radius-button` | `var(--radius-sm)` (8px) | `var(--radius-pill)` | Buttons |
| `--radius-input` | `var(--radius-sm)` (8px) | `var(--radius-pill)` | Inputs |
| `--radius-card` | `var(--radius-md)` (12px) | `var(--radius-lg)` (16px) | Cards |
| `--radius-badge` | `var(--radius-sm)` (8px) | `var(--radius-pill)` | Status-Badges |

¹ *„Google Sans" ist proprietär und nicht frei für Web-Hosting lizenziert. Für eine
selbst gehostete App ist **Roboto** (frei, Google-eigen) der korrekte Stand-in; `Inter`
funktioniert ebenfalls als naher Verwandter.*

Google-Preset zeigt zusätzlich einen **FAB** (Floating Action Button, rund, unten rechts) als
primäre Aktion – Standard-Preset nutzt stattdessen den regulären Primary-Button.

### 2.5 Skalen – theme-unabhängig

**Typografie**
* **Font-Family:** über `--font-family-base` (Fallback: `system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`).
* **Hierarchie:**
    * `h1` (Page Title, z. B. „Good Morning…"): `1.75rem` (~28px), Bold (700)
    * `h2` (Section Title, z. B. „Today's Schedule"): `1.125rem` (~18px), Semi-Bold (600)
    * `body` (Standardtext): `0.875rem` (~14px), Regular (400)
    * `small` (Metadaten, Zeitangaben): `0.75rem` (~12px), Regular (400)
* **Zeilenlänge:** Fließtext max. 65–75ch.
* **Icons:** konturbasiert (Stroke), einheitliche Strichstärke **1.5px**.

**Spacing-Skala** (4px-Basis) – Token `--space-*`
* `--space-1: 4px` · `--space-2: 8px` · `--space-3: 12px` · `--space-4: 16px`
* `--space-6: 24px` · `--space-8: 32px` · `--space-12: 48px`
* **Card-Gaps:** kompakt `--space-4` (16px), Seitenebene `--space-6` (24px).

**Border-Radius** – Token `--radius-*`
* `--radius-sm: 8px` → Buttons, Inputs, Badges
* `--radius-md: 12px` → Cards, Dropdowns
* `--radius-lg: 16px` → große Flächen, Modals
* `--radius-pill: 999px` → Pill-Tags (z. B. „AI SUGGESTION"), Such-Input

---

## 3. UI Components

Komponenten beziehen **ausschließlich Tokens** – keine hartkodierten Farben/Maße, damit
Theme-Wechsel und spätere Anpassung funktionieren.

### 3.1 Buttons
* **Primary:** Hintergrund `--color-primary`, Text weiß, Radius `--radius-button`; Hover `--color-primary-hover`. (z. B. „New Request", „Review Draft")
* **Secondary/Outline:** transparent/`--color-bg-surface`, Rahmen `--color-border`, Text `--color-text-secondary`, Radius `--radius-button`. (z. B. „Dismiss", „Edit Draft")
* **Icon-Buttons:** kreisförmig/quadratisch, ohne Hintergrund (z. B. Theme-Toggle, Notification-Glocke).
* **FAB (nur Google-Preset):** runder Floating Action Button, `--color-primary`, unten rechts – ersetzt dort den primären Button.

### 3.2 Cards (Surfaces)
* Hintergrund `--color-bg-surface`, Rahmen `--color-border` (1px), Radius `--radius-card`.
* Hell: zusätzlich subtiler `--shadow-sm`. Dunkel: Trennung über Rahmen, kaum Schatten.
* Häufig mit Header-Bereich, optional kombiniert mit Status-Badges. **Keine verschachtelten Cards.**

### 3.3 Navigation (Nav-Sidebar & Topbar)

**Grundsatz:** Globale Navigation und Modul-Kontext werden *getrennt*. Die Sidebar zeigt
**nur die Module** (dashboard, to-dos, calendar, applications); modul-spezifische Sub-Navigation
(Projekte, Tags bei den to-dos) lebt **im Modul** (Kontext-Rail, §4.1) — die globale Chrome bleibt
modul-agnostisch.

* **Nav-Sidebar (voll ein-/ausklappbar, schwebende Card):** Standard **komplett eingeklappt**
  (0 Breite) → der Inhalt hat die volle Breite. Auf-/Zuklappen ausschließlich per **Klick** auf **den
  einen** Panel-Toggle oben-links in der Kopfleiste (persistiert) — **kein zweiter Button auf der
  Card**. Die Card **beginnt unterhalb der Kopfleiste** (nicht ganz oben), sodass der Toggle in einer
  eigenen, aufgeräumten Ecke sitzt (Platz für spätere Elemente). Aufgeklappt ist sie eine **schwebende
  Card auf höherer Ebene**: `--color-bg-surface`, `--radius-lg`, `--shadow-lg`, mit **12px Abstand zu
  den Fensterkanten** ringsum — sie **verschiebt** den Inhalt (push), verdeckt ihn aber nicht. Die Card
  fährt per `transform` ein, während die Spaltenbreite den Push mitanimiert. Inhalt: Marken-Zeichen
  (Teal-Glyph) + Wortmarke oben, Modul-Icons mit Labels, unten settings + Account. Geschlossen ist die
  Sidebar `inert` (nicht fokussierbar); `Escape` schließt sie. Aktiver Eintrag: `--color-primary-bg` +
  `--color-primary`.
* **Topbar (keine eigenständige Leiste, volle Breite):** **kein gefüllter Hintergrund und keine
  Unterkante** — die Kopfzeile löst sich in die Canvas-Fläche auf, damit die Seite als *eine* Fläche
  liest; nur die einzelnen Elemente tragen Farbe. Eine gefüllte Bar mit eigener Farbe würde (zumal sie
  die Surface-Farbe der Sidebar teilt) die Seite sichtbar in Zonen rahmen — bewusst vermieden. Die
  Kopfzeile liegt **über** dem Sidebar-plus-Content-Bereich (volle Breite), damit der **Panel-Toggle
  oben-links fest an einer Stelle bleibt** und die zentrierte Suche beim Auf-/Zuklappen **nicht
  springt**. Die Sidebar-Card beginnt darunter und bleibt absichtlich eine abgehobene Fläche (sie *ist*
  eine höhere Ebene). Links der Panel-Toggle; mittig zentriert der Such-Input (mit Ruhe-Hairline +
  `⌘K`/`Ctrl K`-Hinweis); rechts die Quick-Actions (Theme-Toggle, Notifications, Account-Avatar).

### 3.4 Inputs & Forms
* **Search-Input:** Radius `--radius-pill`, Hintergrund `--color-bg-surface-2`, Leading-Icon (Lupe), Platzhalter `--color-text-placeholder`.
* **Standard-Input:** Radius `--radius-input`, Rahmen `--color-border`, Fokus-Ring in `--color-primary`.

### 3.5 Badges & Tags
* **Status-Badge:** Radius `--radius-badge`, Paarung Vordergrund/Hintergrund je Semantik
  (z. B. High Priority = `--color-danger` auf `--color-danger-bg`; Erledigt = `--color-success` auf `--color-success-bg`).
* **Pill-Tag:** Radius `--radius-pill` (z. B. „AI SUGGESTION").

---

## 4. Layout & Grid
* **Dashboard:** konfigurierbares Drag&Drop-Grid – was wird wo, wie groß angezeigt; Layout pro User persistiert.
* **Responsive Grids ohne Breakpoints:** `repeat(auto-fit, minmax(280px, 1fr))`.
* **Flexbox für 1D, Grid für 2D.** Tasks/Kanban: mehrspaltiges Grid; Dashboard: mehrspaltige Card-Anordnung.
* **Z-Index-Skala** (semantisch, keine 999-Magic): dropdown → sticky → modal-backdrop → modal → toast → tooltip.

### 4.1 To-dos-Arbeitsbereich – „Triage-Command"-Layout

Die to-dos-Ansicht ist bewusst **kein** generisches Sidebar-plus-zentrierte-Spalte-Layout, sondern
macht den Produktkern (*Triage: was ist als Nächstes dran*) zum sichtbaren Aufbau. Drei Elemente:

* **Focus-Band** (Seitenanker): Titel + persönliche Zeile, darunter eine ruhige Zeile **handlungs-
  relevanter Indikatoren** – `überfällig` / `heute fällig` / `geschätzte Zeit heute`. Keine großen
  Metrik-Kacheln (Anti-Referenz), sondern kleine, echte Werte, je Bedeutung ein Akzent (überfällig =
  `--color-danger`). Das Band erscheint nur, wenn es datum-getriebenes Signal gibt.
* **Datums-Buckets** als Rückgrat der Liste: `overdue → today → this week → later → no date → done`.
  Die Sortierung (Priorität/Aufwand/Deadline) ordnet **innerhalb** der Buckets; der manuelle
  („custom") Drag-Modus ist naturgemäß flach und gruppiert nicht. Nur die zwei dringlichen Bucket-
  Labels (`overdue`, `today`) tragen Farbe, damit der Akzent bedeutungstragend bleibt.
* **Kontext-Rail** (rechts, füllt sonst toten Raum auf breiten Schirmen): eine zweite Achse auf denselben
  Daten – `week ahead` (7-Tage-Überblick mit Zähl-Balken) und `by project` (offene Zähler, Klick
  filtert die Liste). Selbe Vokabel wie die Sidebar-Navigation, flach (keine Cards).

**Struktur, nicht flüssige Typografie** (Product-Register): Der zweispaltige Arbeitsbereich (`minmax(0,
1fr) 296px`) ist auf ~1080px zentriert; unter 1080px entfällt die Rail (eine ruhige Einzelspalte),
unter 760px klappt die Sidebar weg. Die Rail ist `sticky`. Das Skelett ist von der Akzent-Identität
entkoppelt: ein späteres Design tauscht Tokens, nicht dieses Layout.

### 4.2 Dashboard-Startseite („heute"-Home)

Die Landing-View liefert das Kernversprechen („pad öffnen und sofort wissen, was ansteht"). **Erste
Ausbaustufe** (bis konfigurierbare Widgets kommen): ein zeitbasierter Gruß, dieselben Live-Indikatoren
wie das Focus-Band, und ein **Panel-Raster** — anders als die flache Liste sind hier **Cards richtig**
(bounded overview objects, „Grid für 2D"): `today & overdue` (Fokusliste, volle Breite, Sprung in die
to-dos), darunter `week ahead` + `by project` (dieselben Bausteine wie die Kontext-Rail), plus dezente
gestrichelte „coming soon"-Kacheln für die noch fehlenden Module. Bewusste Trennung: **1D-Liste = flache
Hairlines, 2D-Dashboard = Panels.**

---

## 5. Schreibweise (UI-Text)

UI-Texte sind **standardmäßig klein geschrieben** — Navigation, Buttons, Abschnitts-Labels,
Überschriften, Platzhalter, Status- und Sortier-Begriffe (z. B. „to-dos", „new task",
„priority", „today", „high"). Das ist bewusst, passt zur kleingeschriebenen Wortmarke „pad"
und zum ruhigen, klaren Charakter (und ersetzt die getrackten Großbuchstaben-Labels).

**Ausnahme:** vom Nutzer eingegebene Inhalte (Aufgaben-Titel, Projekt- und Tag-Namen) werden
**genau so angezeigt, wie er sie getippt hat** — keine erzwungene Kleinschreibung seiner Daten.

## 6. Offene Punkte
* **Default-Preset festlegen:** startet pad in „Standard" oder „Google"? (Beeinflusst `:root`.)
* Akzentfarbe des Standard-Presets final wählen (Blau `#0D6EFD` ist Startwert aus Stitch; „Excel-Grün" o. a. denkbar – ist nur 1 Token).
* Finale Hex-Werte beim SCSS-Tokenset gegen die Stitch-Originale abgleichen.
* Kontraste prüfen: `--color-text-placeholder` und `--color-text-secondary` müssen in **allen** Preset/Modus-Kombinationen ≥4.5:1 erreichen (Google-Placeholder `#80868B` ist grenzwertig).
* Schrift-Lizenz klären: Google-Preset → `Roboto` (frei) statt „Google Sans" (proprietär).
* Optionale Mono-Schrift für Daten/Code (z. B. `JetBrains Mono`) – bei Bedarf.
* Per `/impeccable init` ins kanonische DESIGN.md-Format überführen + PRODUCT.md ergänzen.
