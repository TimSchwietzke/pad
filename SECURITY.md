# SECURITY – pad

## ⚠️ Pre-Publish-Checkliste

**pad darf NIEMALS mit deaktiviertem Auth (`AUTH_MODE=none`) über das Netzwerk
erreichbar gemacht, gehostet oder veröffentlicht werden.**

Bevor pad über `localhost` hinaus erreichbar wird (Pi, Heimnetz, Web), MUSS gelten:

- [ ] `AUTH_MODE=oauth` (oder ein anderer echter Auth-Modus) ist aktiv.
- [ ] Login getestet – ohne gültige Session kommt man an keine `/api/*`-Route.
- [ ] Jede Query filtert nach `user_id` (kein modulübergreifendes Datenleck).
- [ ] Server bindet nur dann auf `0.0.0.0`, wenn Auth aktiv ist (Code-Guard vorhanden).
- [ ] Secrets (Email, API-Keys, OAuth-Tokens) liegen **verschlüsselt**, nicht im Klartext.
- [ ] Keine `.env` / keine Secrets im Git-Repo.
- [ ] Keine Secrets/Tokens/Passwörter in Logs (strukturierte Logs dürfen kein Leck sein).
- [ ] TLS aktiv (Reverse Proxy mit Zertifikat), wenn über das Netz erreichbar.
- [ ] Default-User aus dem Dev-Modus ist entfernt/deaktiviert.

## Eingebaute Schutzmechanismen (Soll-Zustand)
1. Startup-Banner: lauter Warn-Log + UI-Hinweis, solange `AUTH_MODE=none`.
2. Bind-Guard: `0.0.0.0` nur mit aktivem Auth-Modus, sonst Abbruch beim Start.
3. Diese Checkliste als manueller Gate vor jedem Publish/Deploy.

## Bind-Guard im Container: `PAD_ALLOW_NONLOOPBACK_BIND`

Ein Prozess im Container muss auf `0.0.0.0` lauschen, damit ein veröffentlichter
Port ihn erreicht — was der Bind-Guard (Punkt 2) bei `AUTH_MODE=none` sonst
verbietet. `PAD_ALLOW_NONLOOPBACK_BIND=1` ist der **explizite, bewusste Opt-out**
genau für diesen Fall. Er ist **nur sicher**, solange der Port auf den **Host-
Loopback** veröffentlicht wird (`127.0.0.1:8080:8080` in `docker-compose.yml`), die
App also weiterhin nicht aus dem Netz erreichbar ist. Beim Start wird zusätzlich
laut gewarnt.

- Default ist **aus** — für alle Nicht-Container-Läufe gilt der Guard unverändert.
- Diesen Schalter **niemals** mit einer netz-erreichbaren Port-Veröffentlichung
  (`0.0.0.0:8080:8080`, Reverse-Proxy ohne Auth, …) kombinieren — das ist genau
  das, was die Pre-Publish-Checkliste oben verbietet. Netz-Exposition erst mit
  echtem Auth (OAuth).
