# 🧭 Familienausflug-Rallye Companion App

Eine reaktive, mobile-optimierte Web-Anwendung (PWA) für geführte Familienausflüge, Stadtrallyes und Sightseeing-Touren mit zentraler Admin-Steuerung, Live-Synchronisation via WebSockets und interaktiven Quiz- und Schätz-Stationen.

---

## ✨ Features

- 📱 **Mobile-First Design**: Optimiert für alle Smartphone-Displays mit Touch-Buttons und klaren Anzeigen.
- 👑 **Zentrale Admin-Steuerung**: Der Tour-Leiter steuert Folien, Countdown-Timer und Eilmeldungen live über sein Smartphone.
- ⚡ **Echtzeit-Synchronisation**: WebSocket-basierter Heartbeat synchronisiert Folien, Timer und Phasen millisekundengenau auf allen Teilnehmer-Geräten.
- 🔒 **Kein Passwort (Zero Friction)**: Teilnehmer tragen einfach ihren Vornamen ein, wählen Avatar & Farbe und sind sofort im Spiel.
- ⏱️ **Striktes 5-Phasen-Quizsystem**:
  1. *Frage & Medien anzeigen* (Antworten verborgen)
  2. *Antworten einblenden* (Gesperrt)
  3. *Timer & Abstimmung starten* (Freigeschaltet mit Countdown)
  4. *Auflösung & Punkteanimation* (Richtige Antwort, Odometer, Konfetti, Chimes)
  5. *Zwischen-Leaderboard* (Gesamtwertung der Familie)
- 💯 **Punkte-Engine mit Speed-Bonus & Gradient**:
  - Speed-Bonus bei Multiple-Choice: 1. Platz: 100%, 2. Platz: 85%, 3. Platz: 70%, ab 4. Platz: 55%.
  - Schätzfragen: Exakte Zielzahl mit mathematischem Gradienten und Geschwindigkeitsbonus.
- 🎨 **Gamification & Sound**:
  - **Kilometerzähler (Odometer)**: Punkte drehen sich bei jedem Punktgewinn mechanisch wie ein Auto-Tacho hoch.
  - **Konfetti-Effekt**: Canvas-Partikelregen bei richtigen Antworten und Siegerehrungen.
  - **Web Audio API Synthesizer**: Echte dynamisch generierte Sounds (Chimes, Buzzer, Ticks, Fanfaren) – keine externen MP3-Dateien nötig!
- 📢 **Live-Eilmeldungen (Push Banner)**: Der Admin kann spontan Hinweise (z. B. *"Eispause am Kiosk in 5 Min!"*) auf alle Bildschirme pushen.
- 🎨 **Slide Studio Designer**: Integrierter visueller Baukasten zum Erstellen, Bearbeiten, Sortieren und Löschen von Folien.
- 📦 **Offline & Cache-First**: Service Worker cached Medien und Folien, um mobile Daten unterwegs zu sparen.
- 🗄️ **High-Performance SQLite**: `better-sqlite3` im WAL-Modus für ausfallsichere, blitzschnelle Datenspeicherung.
- 🚀 **PM2 Ready**: Vollständig vorbereitet für PM2 unter Linux und Windows.

---

## 🚀 Schnellstart

### Option A: Per Doppelklick unter Windows
Einfach die Datei **[`start.bat`](file:///c:/Users/fleis/.gemini/antigravity/scratch/family_tour_quiz/start.bat)** doppelklicken. Das Skript:
1. Prüft Node.js & installiert bei Bedarf `npm install`.
2. Initialisiert die Datenbank automatisch mit der Muster-Tour.
3. Zeigt die lokale WLAN-IP für Smartphones an.
4. Öffnet den Browser und startet den Server.

---

### Option B: Über die Kommandozeile
```bash
# 1. Abhängigkeiten installieren
npm install

# 2. Datenbank mit Muster-Rallye initialisieren
node src/seed.js

# 3. Server starten
npm start
```

Die Anwendung ist nun erreichbar unter:
👉 `http://localhost:3000`

---

## 🛠️ Betrieb mit PM2 (Production)

```bash
# Starten mit PM2
pm2 start ecosystem.config.js

# Status prüfen
pm2 status

# Live-Logs ansehen
pm2 logs family-tour-quiz

# Stoppen oder Neustarten
pm2 restart family-tour-quiz
pm2 stop family-tour-quiz
```

---

## 👥 Verwendung während der Tour

1. **Teilnehmer**:
   - Öffnen `http://<SERVER-IP>:3000` auf ihren Smartphones.
   - Geben nur ihren Vornamen ein (z. B. "Papa", "Jonas", "Mama"), wählen ein Emoji und klicken auf *"Los geht's"*.
2. **Admin (Tour-Leiter)**:
   - Klickt oben rechts in der App auf den **👑 Admin-Button**.
   - Gibt das Admin-Passwort ein: **`casaxx`**.
   - Die Admin-Zentrale öffnet sich (Live-Steuerung & Slide Studio).
   - Steuert Folien und schaltet die 5 Phasen schrittweise per Knopfdruck durch.
   - Startet und stoppt den synchronen Countdown.
   - Sendet bei Bedarf Push-Eilmeldungen.

---

## 🧪 Tests ausführen

```bash
npm test
```

---

## 📚 Dokumentation

- [db.md](file:///c:/Users/fleis/.gemini/antigravity/scratch/family_tour_quiz/db.md): Ausführliche Dokumentation der SQLite-Datenbanktabellen und Felder.
- [docs/ARCHITECTURE.md](file:///c:/Users/fleis/.gemini/antigravity/scratch/family_tour_quiz/docs/ARCHITECTURE.md): Systemarchitektur, Protokolle und Punkteberechnungs-Algorithmus.
