# Product

## Register

product

## Users

Primär der Entwickler selbst: nutzt pad täglich, um persönliche Aufgaben, Termine,
Bewerbungen und später E-Mail, Projekte und Smart Home an einem Ort zu sehen — statt
zwischen fünf Apps zu springen. Kontext: meist am Laptop/PC, fokussiertes Arbeiten und
schnelles Triagieren; auch mobil nutzbar.

Später (sobald gehostet, mit echtem Login): Freunde, Familie und Uni-Kolleg:innen — auch
nicht-technische Menschen, die kein eingearbeitetes Power-Tool wollen, sondern etwas, das
sie sofort verstehen.

## Product Purpose

pad bündelt, was sonst über viele Tools verteilt ist (ToDos, Kalender, Bewerbungen, später
E-Mail, Projekt-Übersicht, Smart Home) — sauber getrennt in Modulen, an einem Ort. Ziel ist,
den App-Wechsel zu beenden und auf einen Blick zu zeigen, was ansteht.

Der Kern ist **flexibles Triagieren von Aufgaben**: nach Priorität, geschätztem Aufwand und
Zeit bis zur Deadline sortieren und kombinieren. Erfolg heißt: der Nutzer öffnet pad und weiß
sofort, was als Nächstes dran ist, ohne nachzudenken.

Erst lokal/Single-User, später im Heimnetz oder gehostet (Multi-User).

## Brand Personality

Ruhig, fokussiert, clean, zeitlos. Ein Werkzeug, das sich aus dem Weg hält und den Inhalt
führen lässt — kein Trend-Look, der nächstes Jahr alt aussieht. UX steht über allem: intuitiv
und nutzerfreundlich, freundlich genug für nicht-technische Menschen, ohne zu verflachen.
Sprache und Ton: schlicht und menschlich, kein Marketing-Sprech.

## Anti-references

- **Generischer AI-SaaS-Look** — keine Gradient-Hero, keine Riesen-Metrik-Kacheln, keine
  getrackten Mini-Eyebrows über jedem Abschnitt.
- **Überladenes Enterprise-Tool** — nicht der zugemüllte Jira/Confluence-Wust mit fünf Toolbars.
- **Verspielte Consumer-App** — nicht gamifiziert, keine Maskottchen, keine übertriebenen Effekte.

*Klarstellung:* **Informative, handlungsrelevante Indikatoren** (offen / heute fällig / überfällig / geschätzte Zeit heute) sind ausdrücklich **erwünscht** und abschaltbar. Vermieden wird nur der Vanity-/Gamification-Look — z. B. ein „Produktivitäts-Score" oder „+12%", der gut aussieht, aber keine Entscheidung stützt.

## Design Principles

1. **Aus dem Weg.** Das Interface dient der Aufgabe. Chrome und Reibung reduzieren, damit der
   Inhalt des Nutzers führt — nicht die UI.
2. **Triage zuerst.** Das Wichtigste sichtbar und sortierbar zu machen (Priorität, Aufwand,
   Deadline) ist die Kernaufgabe; Priorisieren muss mühelos sein.
3. **Intuitiv ohne Anleitung.** Auch eine nicht-technische Person findet sich ohne Handbuch
   zurecht.
4. **Ein ruhiges System.** Jedes Modul sieht aus und verhält sich wie Teil desselben Ganzen,
   auch wenn Module dazukommen oder wegfallen.
5. **Ehrlich statt laut.** Klarheit vor Effekt; keine Dekoration um ihrer selbst willen.

## Accessibility & Inclusion

WCAG AA als Grundlinie: Fließtext-Kontrast ≥ 4.5:1 (auch Platzhalter, nicht nur helles Grau),
große Texte ≥ 3:1 — in **beiden** Themes (hell und dunkel) und allen Presets. Vollständige
Tastaturbedienung mit sichtbarem Fokus, sinnvolle Labels. `prefers-reduced-motion` wird als
Grundanstand respektiert.
