# 🧭 Familienausflug-Rallye Companion App

Voraussetzung für diese geprüfte Version: **Node.js 22**.

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
Einfach die Datei **[`start.bat`](start.bat)** doppelklicken. Das Skript:
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
👉 `http://localhost:5500`

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
   - Öffnen `http://<SERVER-IP>:5500` auf ihren Smartphones.
   - Geben nur ihren Vornamen ein (z. B. "Papa", "Jonas", "Mama"), wählen ein Emoji und klicken auf *"Los geht's"*.
2. **Admin (Tour-Leiter)**:
   - Klickt oben rechts in der App auf den **👑 Admin-Button**.
   - Gibt das Admin-Passwort ein: **das selbst festgelegte Passwort**.
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

- [db.md](db.md): Ausführliche Dokumentation der SQLite-Datenbanktabellen und Felder.
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): Systemarchitektur, Protokolle und Punkteberechnungs-Algorithmus.


## Änderungen in dieser Überarbeitung

Siehe [REVIEW.md](REVIEW.md) für Fehler, Korrekturen, Tests und priorisierte Ausbauideen.

### Admin-Zugang und bestehende Installationen

Das Admin-Passwort wird dauerhaft als gesalzener scrypt-Hash in der Datenbank gespeichert. Bei der ersten Migration wird ein vorhandenes `ADMIN_PASSWORD` übernommen; danach gilt das gespeicherte Passwort. Ohne diese Variable den Zugang über die Wiederherstellung unten einrichten. Die Admin-Sitzung gilt acht Stunden. „Sperren“ widerruft sie serverseitig; „Beenden“ schließt nur die Ansicht.

Unter HTTPS `COOKIE_SECURE=true` setzen. Für lokale HTTP-Tests weglassen. Die Anwendung läuft standardmäßig auf Port 5500. Der Reverse Proxy muss WebSocket-Upgrades weiterleiten. PM2 weiterhin mit einer Instanz betreiben.

Spielersitzungen benutzen jetzt separate Tokens. Die Anmeldung mit einem bestehenden Namen öffnet dasselbe Spielerkonto einschließlich Punktestand. Groß-/Kleinschreibung und äußere Leerzeichen werden dabei ignoriert. „Rallye zurücksetzen & Teilnehmer löschen“ löscht alle Spielerkonten, Spielersitzungen und Antworten; Tourfolien und Admin-Zugang bleiben erhalten. Bestehende Tourinhalte bleiben erhalten. Vor dem Austausch der Anwendung den Server stoppen und `data/` sowie `public/uploads/` sichern und beibehalten. `npm run seed` ersetzt die Tour durch Beispieldaten und gehört nicht in einen Updateablauf.

### Lokaler Start unter Linux/macOS

```sh
npm ci
# Nur bei einer neuen Installation für Beispieldaten:
npm run seed
npm start
```

Auf Windows `start.bat` verwenden. Installation der Abhängigkeiten benötigt Internet. Karten und externe Medien benötigen ebenfalls Internet; Live-Abgaben benötigen immer eine Verbindung zum Rallye-Server. Der Service Worker speichert die App-Oberfläche und bereits geladene eigene Medien, keine vollständige Offline-Spielrunde.

### Entwurfsschutz und QR-Einladungen

Das Slide Studio zeigt ungespeicherte Änderungen an. Beim Folienwechsel, Verlassen des Studios, Schließen oder Sperren stehen **Speichern**, **Verwerfen** und **Abbrechen** zur Wahl. Schlägt das Speichern fehl, bleiben Eingaben erhalten. Beim Neuladen warnt der Browser; beim erneuten Öffnen des Studios kann der Entwurf aus demselben Tab wiederhergestellt werden. Diese lokale Sicherung ersetzt kein gespeichertes Tour-Backup: Nach dem endgültigen Schließen des Tabs oder bei gesperrtem Browserspeicher ist eine Wiederherstellung nicht garantiert.

In der Admin-Zentrale öffnet **Mitspieler einladen** einen QR-Code zur Teilnahmeadresse. Der Link kann kopiert, über die Gerätefreigabe geteilt und der QR-Code als SVG heruntergeladen werden. Die Erzeugung erfolgt auf dem eigenen Server ohne externen QR-Dienst. Unterpfade wie `/family/` bleiben erhalten. Bei lokalem Betrieb eine vom Handy erreichbare WLAN-Adresse eintragen, zum Beispiel `http://192.168.178.20:5500/`; `localhost` verweist auf das jeweilige Gerät. Der Link enthält keine Admin-Zugangsdaten.

Beim Update **`npm ci` ausführen und den Server neu starten**, da für QR-Codes die Abhängigkeit `qrcode` hinzugekommen ist. Datenbank und Uploads beibehalten.

### Admin-Passwort ohne Konsole neu festlegen

1. Diese Version installieren und die Anwendung über das Hosting-Panel neu starten.
2. Im Dateimanager oder per SFTP `data/admin-recovery-code.txt` im Projektordner öffnen und den Code kopieren. Bei einem eigenen `DB_PATH` liegt die Datei neben der Datenbank. Die Datei gehört nicht in `public/` und nicht auf GitHub.
3. In der App den Admin-Zugang öffnen und **Passwort vergessen / neu festlegen** wählen.
4. Den Code einfügen, ein eigenes Passwort zweimal eingeben und speichern. Danach mit dem neuen Passwort anmelden.

Der Code gilt einmal und wird anschließend in derselben Datei ersetzt. Alle bisherigen Admin-Sitzungen werden beendet. Das Passwort bleibt bei Neustarts und Updates erhalten, solange die Datenbank erhalten bleibt. Eine spätere Änderung von `ADMIN_PASSWORD` überschreibt es nicht. Für eine weitere Wiederherstellung die Datei frisch vom Server öffnen. Die Datei ist nur für den Server-Dateieigentümer lesbar; der Dateimanager benötigt entsprechenden Zugriff. Bei entferntem Code erzeugt der nächste Serverstart einen neuen. Tourimport und Beispieldaten ändern das Passwort nicht.

Die Liveansicht verzichtet auf Begrüßungstexte und das ausgeschriebene Verbindungssignal. Der Statuspunkt bleibt erhalten. Nur der Inhaltsbereich scrollt; die Fußleiste nimmt eigenen Platz ein. Pinch- und Doppeltipp-Zoom werden in der Livefläche über Touch-Regeln und Gestenbehandlung unterbunden, soweit der Browser dies zulässt.

Schätzfragen geben gültige Zahlen während des Tippens automatisch ab; der letzte vor Timerschluss erfolgreich beim Server gespeicherte Wert zählt. „Tipp abgeben“ bleibt zum Bestätigen und Schließen der Tastatur erhalten. Der Timerstart fokussiert das Zahlenfeld, soweit kein Dialog geöffnet ist. Ob dabei die Bildschirmtastatur erscheint und ein bestehender Zoom zurückgesetzt wird, hängt insbesondere unter iOS vom Browser ab. Speicherfehler werden am Feld angezeigt.

### Ton und echte Push-Eilmeldungen

Die Tonschaltfläche zeigt „Ton aktivieren“, solange der Browser Audio noch nicht freigegeben hat. Antippen aktiviert den Ton und spielt einen Testklang. Auch andere bewusste Berührungen können Audio freigeben; „Ton aus“ bleibt als Gerätewunsch gespeichert. Neue Eilmeldungen klingen einmal in der sichtbaren App, auch bei Polling statt WebSocket. Lautstärke, Lautlosmodus und Fokus werden vom Gerät bestimmt.

Über die Glocke können angemeldete Mitspieler Push-Nachrichten ausdrücklich erlauben oder abschalten. Auf iPhone/iPad ab iOS 16.4 zuerst zum Home-Bildschirm hinzufügen und die App von dort starten. HTTPS ist erforderlich. Push-Nachrichten erscheinen auch bei geschlossener PWA; ihr Systemton ist nicht frei durch die Webseite festlegbar. Eine Serverannahme ist keine Garantie für die Anzeige am Gerät. Nach dem Löschen der Teilnehmer beim Rallye-Reset Push über die Glocke erneut bestätigen.

Beim Update `npm ci` ausführen und den Server neu starten. Die Bibliothek `web-push` ist neu. VAPID-Schlüssel werden einmal erzeugt und in der Datenbank aufbewahrt; die Datenbank bei Updates erhalten. Optional `VAPID_SUBJECT` als eigene HTTPS-Kontaktadresse oder `mailto:`-Adresse setzen. Der Server benötigt ausgehendes HTTPS zu Apple-, Google-, Mozilla- bzw. Windows-Push-Diensten. Abgelaufene Abonnements werden bei 404/410 entfernt. Nicht zustellbare Meldungen werden nicht unbegrenzt wiederholt; ihre Push-Gültigkeit beträgt fünf Minuten.

### Weitere Studio-Folien

„Endauswertung / Siegerehrung“ lässt sich wie jede andere Folie anlegen und beliebig verschieben. Beim Aufrufen zeigt sie die bisherige Gesamtwertung mit Siegerehrung; danach kann die Tour weitergehen. Punkte und Timer sind nur bei Multiple Choice und Schätzfragen sichtbar. Medienfelder akzeptieren HTTPS-Adressen und eigene Upload-Pfade wie `/uploads/bild.jpeg`.
