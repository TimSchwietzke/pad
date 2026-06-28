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
- [ ] TLS aktiv (Reverse Proxy mit Zertifikat), wenn über das Netz erreichbar.
- [ ] Default-User aus dem Dev-Modus ist entfernt/deaktiviert.

## Eingebaute Schutzmechanismen (Soll-Zustand)
1. Startup-Banner: lauter Warn-Log + UI-Hinweis, solange `AUTH_MODE=none`.
2. Bind-Guard: `0.0.0.0` nur mit aktivem Auth-Modus, sonst Abbruch beim Start.
3. Diese Checkliste als manueller Gate vor jedem Publish/Deploy.
