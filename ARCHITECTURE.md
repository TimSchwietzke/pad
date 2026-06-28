# pad – Personal Assistant Dashboard

> **Status:** Planungsdokument (v0.1) · Stand: 2026-06-26
> Dieses Dokument ist die verbindliche Referenz für Vision, Architektur und Schnittstellen.
> Code folgt erst, wenn dieser Plan steht.

---

## 1. Vision & Scope

pad ist ein **Personal Assistant Dashboard**: ein Ort, der die Aufgaben eines persönlichen
Assistenten bündelt – ToDos, Kalender, Bewerbungen, Email, Projekt-Übersicht und Smart Home.
Alles sauber getrennt, modular, auf den Nutzer zugeschnitten.

**Nutzungsstufen:**
1. Lokal auf dem eigenen Rechner (MVP).
2. Im Heimnetz auf einem Raspberry Pi gehostet.
3. Optional später echtes Web-Hosting (offen).

Ab Stufe 2 ist pad über das Netz erreichbar → **Auth & Security sind dann Pflicht**
(siehe Abschnitt 8). Vorerst läuft pad single-user, aber das Datenmodell ist multi-user-fähig.

---

## 2. Leitprinzipien

| Prinzip | Bedeutung für pad |
|---|---|
| **Modularität** | Jedes Feature ist ein Modul mit klarer Schnittstelle. Module sind ein-/ausschaltbar und austauschbar. |
| **SoC** (Separation of Concerns) | Frontend ≠ Backend ≠ Persistenz. Innerhalb des Backends: Transport ≠ Logik ≠ Storage. |
| **DRY** | Gemeinsame Logik in Core-Paketen (Auth, Relations, Notifications, HTTP-Helfer). |
| **Schnittstelle vor Implementierung** | Module kommunizieren über Interfaces. Eine Implementierung weglassen oder ersetzen darf nichts anderes brechen. |
| **pad besitzt die Daten** | Eigene Datenhaltung als Single Source of Truth. Externe Dienste (Google, Outlook, GitHub) sind **optionale Sync-Adapter**, kein Fundament. |
| **Vertikale Slices** | Jeder Schritt liefert ein durchgestochenes, nutzbares Feature (UI → API → DB), nicht horizontale Schichten ohne Mehrwert. |
| **Security-ready by design** | `user_id` und Auth-Boundary existieren ab Tag 1, auch wenn Login anfangs deaktiviert ist. |

---

## 3. Tech-Stack

### Frontend
- **React + Vite + TypeScript** (reine SPA, kein SSR).
  - Begründung: saubere Trennung zum Go-Backend; leicht in **Tauri/Electron** zu packen (für nicht-technische Nutzer); auf dem Pi nur statische Dateien.
- **TanStack Query** für Server-State / Caching.
- **React Router** für Routing.
- **react-grid-layout** (o. ä.) für das Drag&Drop-Dashboard.
- **SCSS + CSS Custom Properties** für Theming (siehe Abschnitt 7.3).
- Styling-Quelle: eigene Skills + Google Stitch (vom Nutzer geliefert). Architektur hält UI token-basiert offen.

### Backend
- **Go** mit **`chi`**-Router (leichtgewichtig, nah an stdlib).
- **`sqlc`** für typsichere SQL-Queries (kein schweres ORM; echtes SQL lernen).
- **SQLite** für MVP, **Postgres-ready** (saubere Migrations, kein DB-spezifischer Code in der Logik).
- **Migrations** über `goose` oder `golang-migrate`.

### Worker / Skripte (später, nicht MVP)
- **Python** als separate Worker für Sonderaufgaben (Log-Analyse, Job-Scraper).
- Kein Framework nötig bis zum konkreten Bedarf. Andocken über das `Job`-Interface (Abschnitt 5.4).

### Deployment
- MVP: Go-Binary serviert API **und** die gebauten statischen Frontend-Files.
- Pi: dasselbe Binary, optional hinter Reverse Proxy (Caddy/Traefik) mit TLS.
- Desktop: Tauri/Electron-Wrapper um die SPA, spricht das lokale Go-Binary an.

---

## 4. Repo-Struktur (Monorepo)

```
pad/
├── ARCHITECTURE.md          # dieses Dokument
├── SECURITY.md              # Security-Checkliste vor jedem Publish
├── README.md
├── docker-compose.yml       # für Pi-Deployment (später)
│
├── backend/                 # Go
│   ├── cmd/pad/main.go      # Entry: lädt Config, registriert Module, startet Server
│   ├── internal/
│   │   ├── core/
│   │   │   ├── module/      # Module-Interface + Registry
│   │   │   ├── auth/        # Auth-Boundary, Middleware, (später) OAuth
│   │   │   ├── relations/   # generische Verknüpfungen zwischen Entitäten
│   │   │   ├── notify/      # Notification-Service + Kanäle (Telegram/Email)
│   │   │   ├── jobs/        # Scheduler / Worker-Interface
│   │   │   ├── httputil/    # JSON-Helfer, Fehlerformat, Pagination
│   │   │   └── storage/     # DB-Verbindung, Migrations-Runner
│   │   └── modules/
│   │       ├── todo/
│   │       ├── calendar/
│   │       ├── jobs_tracker/   # Bewerbungen
│   │       ├── mail/
│   │       ├── projects/
│   │       └── smarthome/
│   ├── migrations/
│   └── queries/             # sqlc-Eingabe (.sql)
│
├── frontend/                # React + Vite
│   ├── src/
│   │   ├── app/             # Shell, Router, Dashboard-Grid, Provider
│   │   ├── core/            # API-Client, Auth-Context, Theme, UI-Primitives
│   │   ├── features/
│   │   │   ├── todo/
│   │   │   ├── calendar/
│   │   │   ├── jobs/
│   │   │   ├── mail/
│   │   │   ├── projects/
│   │   │   └── smarthome/
│   │   └── styles/          # SCSS-Tokens, Themes (hell/dunkel)
│   └── vite.config.ts
│
└── workers/                 # Python (später)
    └── ...
```

---

## 5. Backend-Architektur

### 5.1 Module-Interface (Kern der Modularität)

Jedes Feature implementiert dasselbe Interface und meldet sich bei der Registry an.
Ein Modul nicht zu registrieren = Feature ist weg, ohne dass etwas anderes bricht.

```go
type Module interface {
    // Eindeutiger Name, z.B. "todo". Auch Prefix für Routen: /api/todo/...
    Name() string

    // Registriert die HTTP-Routen des Moduls am übergebenen Router.
    RegisterRoutes(r chi.Router, deps Deps)

    // SQL-Migrationen, die zu diesem Modul gehören.
    Migrations() []Migration

    // Optional: wiederkehrende Jobs (z.B. Sync, Scraper). Leer = keine.
    Jobs() []jobs.Job
}

// Deps bündelt, was Core den Modulen bereitstellt (DI-Container).
type Deps struct {
    DB        *storage.DB
    Auth      auth.Service
    Relations relations.Service
    Notify    notify.Service
    Config    Config
}
```

**Feature-Flags:** `main.go` liest aus der Config, welche Module aktiv sind, und registriert nur diese.

### 5.2 Auth-Boundary

- Eine Middleware umschließt **alle** `/api/*`-Routen.
- **MVP:** `AUTH_MODE=none` → injiziert einen festen Default-User (`user_id = 1`), Middleware lässt durch, aber **gibt beim Start eine laute Warnung aus** (siehe Abschnitt 8).
- **Später:** `AUTH_MODE=oauth` → Google-OAuth (Login + zugleich Consent für Kalender/Gmail).
- Jede Anfrage trägt einen `user_id` im Context. Module filtern **immer** nach `user_id`.

### 5.3 Relations (Verknüpfungen)

Generischer Mechanismus, um Entitäten modulübergreifend zu verbinden
(z. B. ToDo ↔ Kalender-Event, Bewerbung ↔ ToDo).

```
relations(id, user_id, from_type, from_id, to_type, to_id, kind, created_at)
```
`from_type` = `"todo"`, `to_type` = `"calendar_event"`, `kind` = `"linked"|"blocks"|...`.
Module kennen sich gegenseitig nicht – sie verknüpfen nur über typisierte IDs.

### 5.4 Jobs / Worker

- `jobs.Job` = `{ Name, Schedule (cron), Run(ctx) error }`.
- Core betreibt einen Scheduler. Module liefern Jobs (z. B. Kalender-Sync).
- Python-Worker docken später als externe Prozesse an, angestoßen über dieses Interface.

### 5.5 Notifications

```go
type Notifier interface { Send(ctx, msg Message) error }   // Kanal
type Service interface {                                    // Core-Dienst
    Notify(ctx, userID, event NotificationEvent) error
}
```
- Kanäle: **Telegram**, **Email** (weitere später).
- **Pro Task/Item konfigurierbar:** ob, was und wohin benachrichtigt wird.
- Konfiguration liegt beim jeweiligen Item (z. B. ToDo-Reminder) + globalen User-Settings.

### 5.6 API-Konventionen

- REST/JSON unter `/api/<modul>/...`.
- Einheitliches Fehlerformat: `{ "error": { "code": "...", "message": "..." } }`.
- Listen mit Pagination (`?limit=&cursor=`).
- Zeitstempel ISO-8601 UTC.
- Validierung am Rand (Handler), Logik in der Service-Schicht, SQL in `queries/`.

---

## 6. Datenmodell (Kern)

Gemeinsame Konventionen für alle Tabellen:
- `id` (PK), `user_id` (ab Tag 1, FK), `created_at`, `updated_at`.
- Soft-Delete optional über `deleted_at`, wo sinnvoll.

**Core-Tabellen:**
- `users(id, email, oauth_provider, oauth_subject, created_at)` – anfangs ein Default-User.
- `relations(...)` – siehe 5.3.
- `notification_settings(...)` – globale Kanal-Konfig pro User.

Modul-Tabellen werden im jeweiligen Modul beschrieben (Abschnitt 9).

---

## 7. Frontend-Architektur

### 7.1 Feature-Module
Jedes Feature unter `src/features/<name>/` kapselt: API-Hooks, Komponenten, Widget(s).
Ein Feature **registriert seine Widgets** im Dashboard-Grid – analog zur Backend-Registry.

### 7.2 Dashboard
- Konfigurierbares **Drag&Drop-Grid**: was wird wo, wie groß angezeigt.
- Layout pro User persistiert (Backend).
- Schneller Wechsel zwischen Unterkategorien/Ansichten.

### 7.3 Theming
- **Design-Tokens** (Farben, Spacing, Radius, Typo) als SCSS-Variablen → exportiert als **CSS Custom Properties**, damit Themes **zur Laufzeit** umschaltbar sind.
- Mindestens zwei Themes:
  - **Dunkel:** Orientierung Notion.
  - **Hell:** Orientierung Excel (weiß, eine wiederkehrende Akzentfarbe, Grau als Kontrast).
- Theme-Wechsel = nur Token-Set tauschen, keine Komponenten-Änderung.
- Stitch-/Skill-Output fließt als Token-Werte + Komponenten-Styles ein.

### 7.4 API-Client
- Zentraler typisierter Client in `core/`. Module nutzen ihn, reden nie direkt mit `fetch`.
- Auth-Header / Session zentral, damit OAuth später ein Drop-in ist.

---

## 8. Auth & Security

### 8.1 Stufenplan
| Stufe | Auth |
|---|---|
| MVP (lokal) | `AUTH_MODE=none`, Default-User, **laute Startwarnung** |
| Pi / Netz | `AUTH_MODE=oauth` (Google), Pflicht |
| Web (offen) | OAuth + ggf. 2FA/Passkeys, Secrets-Hardening |

### 8.2 ⚠️ Kritischer Reminder
**pad darf NIEMALS mit `AUTH_MODE=none` über das Netzwerk erreichbar gemacht / gehostet / published werden.**
Absicherung dagegen:
1. Beim Start im `none`-Modus → **großes, rotes Log-Banner** + Hinweis in der UI.
2. `SECURITY.md` mit Pre-Publish-Checkliste (siehe Datei).
3. Default-Bind nur auf `127.0.0.1` im `none`-Modus; Bind auf `0.0.0.0` erfordert aktivierten Auth-Modus (harte Prüfung im Code).

### 8.3 Secrets
- Email-Passwörter, API-Keys, OAuth-Tokens **verschlüsselt** speichern (nie im Klartext in DB).
- MVP: Master-Key aus Env/Datei; später Integration eines Passwort-Managers (z. B. Bitwarden) denkbar.
- Keine Secrets ins Repo (`.env` in `.gitignore`).

---

## 9. Module – Fachliche Spezifikation

### 9.1 ToDo *(MVP-Slice 1)*
- Tasks mit **Projekten, Tags, Prioritäten, Wiederholungen** (Recurrence-Regel).
- **Verknüpfung zum Kalender** (über Relations).
- Reminder über Notification-Service (pro Task konfigurierbar).
- Tabellen (Skizze): `todo_projects`, `todos`, `todo_tags`, `todo_tag_map`.

### 9.2 Kalender *(MVP-Slice 2)*
- Events **anlegen, anzeigen, bearbeiten** (eigene Datenhaltung).
- Verknüpfung zu ToDos.
- Sync-Adapter zu Google/Outlook (CalDAV/API) **später** als austauschbares Modul.

### 9.3 Bewerbungen / Jobs *(MVP-Slice 3)*
- „Online-Excel": Tabelle mit Status-Tracking (beworben / Interview / Absage / …).
- Felder: Firma, Position, Quelle, Status, Link, Notizen, Datumsfelder.
- **Hook für späteren Job-Scraper** (Python-Worker, schlägt automatisch Jobs vor) – nicht MVP.
- Optionale StepStone-/Portal-Integration später.

### 9.4 Email *(nach MVP)*
- **Read-only Anzeige** von Gmail + Outlook (ungelesene / Übersicht).
- „Im jeweiligen Client öffnen"-Link.
- Vollwertiger IMAP/SMTP-Client = Fernziel, nicht eingeplant.

### 9.5 Projekt-Übersicht *(nach MVP)*
- Zusammenführung eigener Projekte (Uni, privat, Job, Selbstständigkeit).
- GitHub/GitLab-Status; später CI/CD-Status (Pipelines grün/rot, Stand).
- „Angebote": Platzhalter für spätere Selbstständigkeits-/Auftrags-Übersicht.

### 9.6 Smart Home *(zuletzt)*
- Status anzeigen + steuern; inkl. **eigener Embedded-Systeme** des Nutzers.
- Anbindung über generische Adapter (MQTT / HTTP / Home Assistant) – Schnittstelle offen halten.

---

## 10. MVP-Roadmap (vertikale Slices)

| Slice | Inhalt | Ergebnis |
|---|---|---|
| **0 – Skelett** | Monorepo, Go-Server serviert React-App, ein End-to-End-Request, SQLite, Migrations-Runner, Module-Registry, Auth-Boundary mit `none`-Modus + Startwarnung, Theme-Token-Setup, Dashboard-Grid-Gerüst. | Durchgestochene leere App, lauffähig. |
| **1 – ToDo** | Volles ToDo-Modul (Projekte, Tags, Prios, Wiederholungen) + Widget. | Erstes echtes Feature. |
| **2 – Kalender** | Events CRUD + ToDo↔Kalender-Verknüpfung + Widget. | Verknüpfte Module sichtbar. |
| **3 – Bewerbungen** | Tabellen-Tracker + Widget. | MVP komplett. |

Danach: Email → Projekt-Übersicht → Smart Home. Auth (OAuth) wird gezogen, **bevor** pad ins Netz geht.

### Backlog (nach den Kernmodulen, bewusst nicht MVP)
- **Chat (User-zu-User):** Kommunikation zwischen pad-Nutzern – relevant, sobald gehostet/multi-user.
- **AI-Chat / Assistent:** KI-gestützter Chat als Bedien-/Assistenzschicht über den Modulen. Sehr praktisch, aber erst nach den Kernmodulen. (Bei Umsetzung: eigenes Modul in §9 + Chat-Komponente zurück in DESIGN.md.)

---

## 11. Offene Punkte / spätere Entscheidungen
- Konkrete Recurrence-Bibliothek/-Modell für Wiederholungen.
- Genaue Drag&Drop-Grid-Library final wählen.
- Migrations-Tool final wählen (`goose` vs. `golang-migrate`).
- Secrets-Verschlüsselung: konkretes Verfahren / Bitwarden-Integration.
- Desktop-Wrapper: Tauri vs. Electron (Tauri leichter/sicherer, Electron vertrauter).
- Reverse-Proxy/TLS-Setup für den Pi.
