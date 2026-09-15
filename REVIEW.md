# Prüfung und Überarbeitung: Family Tour Quiz

Ausgangspunkt: GitHub `famnex/family-tour-quiz`, Commit `c0579cdc386e42af24a2da57fc0026719ce90a3f`.

Die Überarbeitung wird im GitHub-Repository bereitgestellt. Ein laufender Server muss separat aktualisiert werden. Die Prüfung konzentriert sich auf Anmeldung, Live-Quiz, Admin-Funktionen, Eingabevalidierung, mobile Bedienung und den lokalen Start. Sie ersetzt keinen vollständigen Penetrationstest.

## Wichtigste gefundene Fehler und Korrekturen

| Priorität | Befund im Ausgangscode | Umsetzung / betroffene Dateien |
|---|---|---|
| Kritisch | Admin-Endpunkte konnten ohne Passwortprüfung Folien und Teilnehmer löschen, Touren ersetzen und das Quiz steuern. Die Freischaltung war überwiegend ein Browserzustand. | Server prüft eine separate, zeitlich begrenzte Admin-Sitzung vor allen geschützten Endpunkten. Sperren widerruft die Sitzung. `server.js`, `public/js/admin.js`. |
| Kritisch | Öffentlich sichtbare Spieler-IDs dienten zugleich als Anmeldetoken; Namen konnten fremde Profile übernehmen. | Zufällige Sitzungstoken getrennt von öffentlichen IDs, Tokenprüfung auch bei WebSocket-Identifikation, auf Nutzerwunsch Wiederanmeldung in dasselbe Konto über den Namen. `server.js`, `public/js/app.js`. |
| Hoch | Quizlösungen, Zielwerte und angeblich private Admin-Notizen wurden über Folien-API und Live-Zustand an alle ausgeliefert. | Rollenabhängige Ausgabefilter; Lösungen für Mitspieler erst bei Auflösung, private Notizen nur für gültige Admin-Sitzungen. `server.js`. |
| Hoch | Gestoppte Timer akzeptierten weiterhin Antworten; eine verspätete Server-Zeitüberschreitung konnte die Abgabe verlängern. | Abgabe nur bei laufendem Timer, Phase 3 und nicht überschrittener Serverfrist. Wiederaufnahme der ursprünglichen Frist nach Serverneustart. `server.js`. |
| Hoch | Schätzfragen meldeten schon beim Tippen Erfolg und speicherten Zwischenwerte; beim Ablauf wurde nochmals gesendet. | Auf Nutzerwunsch automatische Abgabe gültiger Eingaben, echte Serverbestätigung, sichtbare Fehlermeldung, normales Zahlenfeld auch für Dezimalzahlen. `public/js/app.js`. |
| Hoch | Zwei gleichnamige Upload-Routen; die tatsächlich erreichbare akzeptierte beliebige Dateiendungen. | Eine Route, Beschränkung auf Medienformate; HTML und SVG werden abgelehnt. Uploadpfad berücksichtigt `/family`. `server.js`. |
| Mittel | HTML-Interpolation von Namen, Antworttexten und Titeln. | HTML-Escaping an relevanten Darstellungsstellen, Validierung von Farben, Medienadressen und Import-IDs. Keine pauschale Zusicherung vollständiger XSS-Freiheit. `public/js/ui.js`, `app.js`, `admin.js`, `server.js`. |
| Mittel | Beim Löschen der aktiven Folie konnte der Zustand auf eine gelöschte ID zeigen; Import ließ alte Gesamtpunkte bestehen. | Aktive Folie/Index reparieren, Gesamtpunkte neu berechnen bzw. beim Tourimport zurücksetzen. Ausstehende Timer bei Reset/Import abbrechen. `server.js`. |
| Mittel | Null Punkte wurden durch `|| 100` zu 100 Punkten. | Null als gültiger Wert erhalten. `server.js`, `src/quizEngine.js`. |
| Mittel | Ungültige Phasen, Antwortindizes, Zielwerte, Folien und Reihenfolgen gelangten in die Verarbeitung. | Prüfungen vor Speicherung bzw. Quizabgabe; importierte Touren vor dem Ersetzen validieren. `server.js`. |
| Mittel | Admin-Teilnehmerliste erwartete `player.submission`, obwohl der Server flache Ergebnisfelder liefert. | Ergebnisdarstellung verwendet `is_correct` und `final_points`. `public/js/admin.js`. |
| Mittel | Viele Admin-Aufrufe ignorierten HTTP-Fehler und konnten scheinbaren Erfolg vermitteln. | Gemeinsame Request-Funktion, verständliche Fehleranzeige und erneutes Entsperren bei abgelaufener Sitzung. `public/js/admin.js`. |
| Mittel | Leere Antwortfelder verschoben den Index der korrekten Auswahl im Editor. | Index passend zu den tatsächlich übernommenen Optionen berechnen. `public/js/admin.js`. |
| Mittel | Startdatei und README verwiesen auf 3000, Server und PM2 auf 5500. | Konsistente lokale Adresse; Installationsfehler brechen den Windows-Start ab. `start.bat`, `README.md`. |
| Mittel | App entfernte alle Service Worker der Origin; Cachepfade waren auf `/` festgelegt. | Eigenen Service Worker registrieren, Cache an seinen Scope binden, API nicht zwischenspeichern. `public/sw.js`, `public/js/app.js`. |
| Mittel | Test-Suite arbeitete mit der normalen Datenbank und setzte ihre Tour zurück. | Tests verwenden temporäre Datenbanken; Routingtest hängt nicht mehr von einem öffentlichen Dienst ab. `test/`. |

## Gestaltung und Bedienung

- Ruhigerer dunkler Hintergrund mit mintfarbenen Akzenten, stärkerer typografischer Hierarchie und klareren Kartenflächen.
- Sichtbarer Tourfortschritt und ausgeschriebener Verbindungsstatus.
- Erklärende Wartehinweise vor der Antwortfreigabe.
- Größere Touch-Flächen, sichtbarer Tastaturfokus, Zoom-Sperre in der Livefläche auf Nutzerwunsch und Safe-Area-Abstand am unteren Bildschirmrand.
- Zahlenfeld bleibt während Live-Aktualisierungen bestehen; Fokus und Eingabe werden nicht bei jedem Heartbeat zerstört.
- Dezimalkomma und Dezimalpunkt werden akzeptiert. Gültige Änderungen werden automatisch abgegeben; Erfolg wird erst nach Serverbestätigung angezeigt.
- Rückmeldungen für gespeicherte Antworten und fehlgeschlagene Aktionen.
- Grundlegende Beschriftungen für Dialoge und Avatarwahl; reduzierte CSS-Bewegung bei entsprechender Systemeinstellung.

## Priorisierte nächste Schritte

1. **Tour-Generalprobe / Teilnehmervorschau.** Im Studio eine Vorschau aller fünf Phasen mit einem simulierten Mitspieler anbieten. So fallen fehlende Antworten, schlecht lesbare Bilder und ungeeignete Zeiten vor dem Ausflug auf.
2. **Löschen rückgängig machen.** Entwurfsschutz mit Speichern/Verwerfen/Abbrechen und Wiederherstellung nach Neuladen ist umgesetzt. Als nächster Schritt fehlt eine Rückgängig-Funktion für gelöschte Folien.
3. **Wiederanmeldung.** QR-Einladungen mit Kopieren, Teilen und SVG-Download sind umgesetzt. Als nächster Schritt bietet sich ein Wiederherstellungscode je Spieler an. Aktuell genügt auf Nutzerwunsch der Name zur Wiederanmeldung im bestehenden Konto.
4. **Familienfreundliche Wertung.** Optional Geschwindigkeitsbonus deaktivieren, Teamspiel erlauben und kooperative Gesamtziele ergänzen. Für Kinder und schwankendes Mobilfunknetz ist eine rein zeitabhängige Rangfolge oft frustrierend.
5. **Verlässliche Vorbereitung unterwegs.** Medien vor der Tour gezielt herunterladen und Downloadstatus anzeigen. Live-Spiel benötigt weiterhin Serverkontakt. Externe Karten, CDN-Skripte und Bilder werden nicht vollständig offline bereitgestellt.
6. **Zustandslogik bündeln.** Phasenwechsel, Timer, Auswertung und Folienwechsel als zentrale Übergänge mit klaren Regeln behandeln. `server.js` danach in Auth-, Tour-, Quiz- und Medienmodule aufteilen. Das erleichtert Wiederholungsrunden und verhindert Sonderfälle beim manuellen Zurückspringen.
7. **Medienbetrieb absichern.** Zusätzlich Dateiinhalte prüfen, Bilder verkleinern, Speicherquoten und Uploadbereinigung ergänzen. Video- und Audio-Autoplay auf echten Smartphones testen; Browser können automatisches Abspielen verhindern.
8. **Barrierefreiheit und Außeneinsatz.** Vollständige Dialog-Fokusführung, Screenreader-Prüfung, heller Modus für Sonne und echte iOS-/Android-Tests ergänzen. CSS-Bewegungsreduktion deaktiviert noch nicht sämtliche JavaScript-Konfetti-Effekte.
9. **Betrieb und Backups.** Wiederherstellung aus Backups praktisch erproben; zuverlässige Vorschalt-Backups vor Importen, Server-Ratenbegrenzung und CSP ergänzen. Die aktuelle Begrenzung fehlgeschlagener Admin-Anmeldungen ist einfach und pro Prozess.

## Start und Update

Diese Version wurde unter Node.js 22 getestet; die Laufzeit ist in `package.json` eingetragen. Für lokal erzeugte QR-Einladungen wurde `qrcode` als Laufzeitabhängigkeit ergänzt; beim Update `npm ci` ausführen. Browser-Testwerkzeuge gehören nicht zum Projektpaket.

Das Admin-Passwort ist dauerhaft als scrypt-Hash gespeichert. Zur Einrichtung und Wiederherstellung gibt es einen Frontend-Dialog mit einem einmaligen Code aus einer privaten Serverdatei. Bestehende Spielertoken werden durch die Umstellung ungültig. Bereits vorhandene Namen öffnen auf Nutzerwunsch dasselbe Spielerkonto. Daten und Uploads bei einem Update erhalten, nicht erneut seeden. Details stehen in der README.

## Prüfung

- Unit-Tests: Geschwindigkeitsfaktoren, Schätzgenauigkeit, Punkteabrechnung, Datenbankschema und GPS-Felder erfolgreich.
- REST-/WebSocket-Integrationstests: Anmeldung, Admin-Passwort, Phasenablauf, Timer, Auswertung, Mitteilungen, Folienerstellung/-änderung und Medienupload erfolgreich.
- Zusätzliche Regressionstests: unerlaubte Admin-Aktion, Lösungen/Notizen in öffentlichen Antworten, Trennung von Token und Spieler-ID, doppelte Namen, ungültige Phase/Timer/Antwort, gesperrte Abgabe und unzulässiger Upload erfolgreich geprüft.
- JavaScript-Syntax und Git-Diff auf Formatfehler geprüft.
- Nicht vollständig abgedeckt: parallele reale Smartphones, Mobilfunkausfälle, Proxy-/TLS-Konfiguration, Kartenanbieter, Medien-Autoplay, Backup-Wiederherstellung und sämtliche freien Phasenwechsel.

### Browserprüfung der überarbeiteten Oberfläche

Headless Chromium: Anmeldung, Admin-Freischaltung, mobile Ansicht bei 390 × 844, Schätzabgabe mit Dezimalkomma, Erhalt der Sitzung beim Neuladen, gesperrter Abgabebutton nach Timerstopp und Desktopansicht bei 1440 × 1000 erfolgreich geprüft. Keine JavaScript-Laufzeitfehler in diesem Ablauf; kein horizontaler Seitenüberlauf auf dem geprüften mobilen Viewport. Screenshots der Quiz- und Adminansicht wurden angesehen. Externe Requests waren für diesen Test gesperrt; Karten, externe Bilder, Schriften und echte Geräte sind damit nicht visuell verifiziert. Fehlende Stationsbilder erhalten nun einen lesbaren Ersatzhinweis.

### Prüfung von Entwurfsschutz und Einladungen

Chromium: Abbrechen, Verwerfen und Speichern beim Wechsel, Entwurfswiederherstellung nach Neuladen, Erhalt der Eingabe bei simuliertem Speicherfehler sowie serverseitiges Sperren über das mobile Menü erfolgreich geprüft. Der erzeugte QR-Code wurde aus dem Bild zurückgelesen; die Teilnahmeadresse einschließlich `/family/` stimmt überein. Eine nachträgliche URL-Änderung deaktiviert den alten QR-Code. Die mobile Dialogansicht wurde bei 390 × 844 geprüft. REST-Regressionstests prüfen zusätzlich Zugriffsschutz, SVG-Ausgabe und ungültige Einladungsadressen.

### Passwort-Wiederherstellung

Dauerhafte Passwortspeicherung als gesalzener scrypt-Hash, Wiederherstellung über einen privaten Einmalcode und Widerruf aller Admin-Sitzungen. API-Tests prüfen ungültige und verbrauchte Codes, Passwortvalidierung, Codewechsel, Anmeldung mit dem neuen Passwort und fehlende öffentliche Auslieferung des Codes.
