# Architektur & Funktionsweise: Familienausflug-Rallye Companion App

Dieses Dokument beschreibt die Architektur, Datenflüsse, Echtzeit-Synchronisation und Gamification-Mechaniken der Anwendung.

---

## 🎯 1. Systemübersicht

Die Anwendung ist als hochgradig synchrone, mobile-first Web-Applikation konzipiert, die eine Gruppe (z. B. Familie oder Schulklasse) live und unterbrechungsfrei durch eine Stationen-Rallye oder Stadtführung begleitet.

```
┌─────────────────────────────────────────────────────────────┐
│                 📱 Admin-Smartphone (Leiter)                │
│    - Wählt Stationen / Folien                              │
│    - Schaltet 5 Phasen durch                                │
│    - Steuert Timer & Eilmeldungen                           │
│    - Baukasten im Slide Studio                              │
└──────────────────────────────┬──────────────────────────────┘
                               │  REST & WebSocket
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                 🚀 Node.js / Express Server                 │
│    - WebSocket State Distribution (Live-Broadcasts)         │
│    - Session-Management ohne Passwort                       │
│    - Zeitstempel-basierte Punkte- und Geschwindigkeits-Engine│
│    - better-sqlite3 persistente Speicherung (WAL-Modus)     │
└──────────────────────────────┬──────────────────────────────┘
                               │  WebSocket Live Stream
        ┌──────────────────────┼──────────────────────┐
        ▼                      ▼                      ▼
┌──────────────┐       ┌──────────────┐       ┌──────────────┐
│ 📱 Teilnehmer│       │ 📱 Teilnehmer│       │ 📱 Teilnehmer│
│  "Papa" 🌟   │       │  "Jonas" 🚀  │       │  "Lea" 🦄    │
│  - Sync Slide│       │  - Sync Slide│       │  - Sync Slide│
│  - Sync Timer│       │  - Sync Timer│       │  - Sync Timer│
│  - Odometer  │       │  - Odometer  │       │  - Odometer  │
│  - Sounds    │       │  - Sounds    │       │  - Sounds    │
└──────────────┘       └──────────────┘       └──────────────┘
```

---

## ⏱️ 2. Das 5-Phasen-Quizsystem

Jede Quiz- oder Schätzaufgabe folgt einem strikten deterministischen Phasenablauf:

1. **Phase 1: Frage & Medien anzeigen**:
   - Die Aufgabe, Beschreibungen und Medien werden auf allen Displays gerendert.
   - Alle Antwortbuttons und Eingabefelder sind verborgen und gesperrt.
2. **Phase 2: Antworten einblenden (Gesperrt)**:
   - Die Multiple-Choice Optionen oder das Schätz-Eingabefeld werden sichtbar gemacht.
   - Eingabe bleibt inaktiv („Warten auf Timer-Start“).
3. **Phase 3: Timer & Abstimmung starten**:
   - Der Countdown (z. B. 20s) beginnt synchron auf allen Smartphones zu laufen.
   - Die Buttons und Zahlenfelder werden sofort interaktiv.
   - Antworten werden mit Millisekunden-Zeitstempel auf dem Server erfasst.
   - Bei Ablauf des Timers oder manuellem Stopp sperrt das System die Eingabe unverzüglich.
4. **Phase 4: Auflösung & Punkteanimation**:
   - Der Admin klickt auf „Auflösen“.
   - Die richtige Antwort bzw. der Zielwert wird hervorgehoben.
   - Bei Punktgewinn ertönt der Web-Audio Gong/Chime, das Konfetti explodiert und der Kilometerzähler dreht sich animiert hoch.
5. **Phase 5: Zwischen-Leaderboard**:
   - Das Gesamt-Ranking aller Familienmitglieder wird angezeigt.
   - Der Admin kann die Punkte besprechen und dann zur nächsten Station schalten.

---

## 💯 3. Punkte- & Geschwindigkeits-Berechnung

### Multiple Choice:
- Basis-Punkte: z. B. $100$ Punkte
- Speed-Faktor:
  - 1. korrekte Antwort: **100%** der Punkte
  - 2. korrekte Antwort: **85%** der Punkte
  - 3. korrekte Antwort: **70%** der Punkte
  - Ab 4. korrekte Antwort: **55%** der Punkte

### Zahlen- & Schätzfragen (Gradient):
- Es dürfen nur numerische Eingaben getätigt werden.
- Abweichung: $d = | \text{Eingabe} - \text{Zielwert} |$
- Genauigkeit: $A = \max(0, 1 - \frac{d}{\text{Skalierungsfaktor}})$
- Basis-Punkte: $\text{Rohpunkte} = \text{MaxPunkte} \times A$
- Endpunkte: $\text{Rohpunkte} \times \text{SpeedBonus}$

---

## 🔊 4. Web Audio API Synthesizer (Zero Externe Assets)

Die Datei `public/js/audioSynth.js` erzeugt alle Soundeffekte in Echtzeit über Oszillatoren und Gain-Nodes:
- **Klick**: Kurzer Sinus-Impuls (800 Hz -> 400 Hz)
- **Timer-Tick**: Dreieckswelle (1200 Hz -> 600 Hz)
- **Timer-Urgent**: Rechteck-Piepen (880 Hz)
- **Richtig-Chime**: Harmonischer C-Dur Dreiklang-Arpeggio (C5, E5, G5, C6)
- **Falsch-Buzzer**: Dissonante Sägezahnwelle (150 Hz -> 110 Hz)
- **Odometer-Tick**: Hochfrequente mechanische Ratter-Impulse bei jeder Zifferndrehung
- **Fanfare**: Triumphale Dur-Akkordfolge

---

## 📦 5. Caching & Offline-Fähigkeit

- **Service Worker (`public/sw.js`)**:
  - Pre-cached alle JavaScript-, CSS- und HTML-Dateien.
  - Wendet eine **Cache-First** Strategie für entfernte Bilder (z.B. Unsplash) und Audioinhalte an, um mobile Daten auf der Führung zu schonen.
- **Content Versioning**:
  - Bei Änderungen von Folien im Studio wird `content_version` auf dem Server inkrementiert, wodurch alle Clients ihre Folien-Caches aktualisieren.

---

## 🚀 6. PM2 Prozess-Management

Die App ist für PM2 vorkonfiguriert:
```bash
pm2 start ecosystem.config.js
pm2 logs family-tour-quiz
```
