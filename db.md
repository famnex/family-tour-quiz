# Dokumentation der SQLite-Datenbank (`family_tour.db`)

Diese Datei dokumentiert das vollständige Datenbankschema der Familienausflug-Rallye Companion App sowie künftige Schema-Änderungen für Replikations- und Update-Skripte.

---

## 📊 Tabellenübersicht

### 1. `users` (Teilnehmer & Admins)
Speichert alle registrierten Familienmitglieder / Mitspieler.

| Spalte | Typ | Constraints | Beschreibung |
|---|---|---|---|
| `id` | `TEXT` | `PRIMARY KEY` | Eindeutige UUID der Benutzer-Session |
| `name` | `TEXT` | `UNIQUE NOT NULL COLLATE NOCASE` | Vorname (z.B. "Papa", "Jonas") |
| `role` | `TEXT` | `NOT NULL DEFAULT 'player'` | Rolle: `'player'` oder `'admin'` |
| `avatar_color` | `TEXT` | `NOT NULL DEFAULT '#4f46e5'` | Farbcode für das Spieler-Icon |
| `avatar_emoji` | `TEXT` | `NOT NULL DEFAULT '🌟'` | Ausgewähltes Avatar-Emoji |
| `score` | `INTEGER` | `NOT NULL DEFAULT 0` | Gesamter Punktestand |
| `created_at` | `TEXT` | `NOT NULL` | Registrierungszeitpunkt (ISO-String) |
| `last_seen` | `TEXT` | `NOT NULL` | Zeitstempel des letzten Heartbeats |

*Index*: `idx_users_score ON users(score DESC)`

---

### 2. `slides` (Tour-Folien, Fragen & Inhalte)
Verwaltet alle Folien der Rallye/Führung in chronologischer Reihenfolge.

| Spalte | Typ | Constraints | Beschreibung |
|---|---|---|---|
| `id` | `TEXT` | `PRIMARY KEY` | UUID der Folie |
| `tour_id` | `TEXT` | `NOT NULL DEFAULT 'default'` | Zuordnung zu einer Tour |
| `order_index` | `INTEGER` | `NOT NULL` | Sortierreihenfolge (0, 1, 2, ...) |
| `type` | `TEXT` | `NOT NULL` | Typ: `'info'`, `'transit'`, `'multiple_choice'`, `'estimation'`, `'action'` |
| `title` | `TEXT` | `NOT NULL` | Überschrift / Name der Station |
| `description` | `TEXT` | `NULLABLE` | Text, historische Infos, Erklärungen |
| `location_name` | `TEXT` | `NULLABLE` | Name des Ortes / Wegpunkt |
| `meeting_time` | `TEXT` | `NULLABLE` | Optionale Treffpunkt-Uhrzeit (z.B. "14:30") |
| `media_url` | `TEXT` | `NULLABLE` | URL oder lokaler Pfad zu Bild/Video/Audio |
| `audio_url` | `TEXT` | `NULLABLE` | Zusätzliche Audio-URL/Pfad (z.B. wenn Bild + Sound kombiniert werden) |
| `media_type` | `TEXT` | `DEFAULT 'image'` | `'image'`, `'audio'`, `'video'`, `'image_and_audio'` |
| `question` | `TEXT` | `NULLABLE` | Quiz- oder Schätzfrage |
| `options_json` | `TEXT` | `NULLABLE` | JSON-Array der Antwortoptionen für Multiple-Choice |
| `correct_option_index` | `INTEGER`| `NULLABLE` | 0-basierter Index der richtigen Option |
| `target_value` | `REAL` | `NULLABLE` | Exakter numerischer Zielwert bei Schätzfragen |
| `tolerance` | `REAL` | `DEFAULT 10` | Toleranz- oder Referenzbereich für Abweichung |
| `scale_factor` | `REAL` | `DEFAULT 100` | Gradienten-Skalierungsfaktor für Schätzpunkte |
| `max_points` | `INTEGER` | `NOT NULL DEFAULT 100`| Maximale Punktzahl für die Aufgabe |
| `countdown_seconds` | `INTEGER` | `NOT NULL DEFAULT 20` | Standard-Timer in Sekunden für Phase 3 |
| `admin_notes` | `TEXT` | `NULLABLE` | Private Gedächtnisstütze / Hinweise für den Admin (wird Spielern nie gezeigt) |
| `latitude` | `REAL` | `NULLABLE` | GPS-Breitengrad der Station (z. B. `50.9787`) |
| `longitude` | `REAL` | `NULLABLE` | GPS-Längengrad der Station (z. B. `11.0328`) |
| `created_at` | `TEXT` | `NOT NULL` | Erstellungszeitpunkt |

*Index*: `idx_slides_order ON slides(order_index)`

---

### 3. `quiz_submissions` (Antwortabgaben & Punktevergabe)
Speichert alle abgegebenen Antworten pro Folie und Teilnehmer mit exaktem Zeitstempel.

| Spalte | Typ | Constraints | Beschreibung |
|---|---|---|---|
| `id` | `TEXT` | `PRIMARY KEY` | UUID des Eintrags |
| `slide_id` | `TEXT` | `NOT NULL REFERENCES slides(id)` | Referenzierte Folie |
| `user_id` | `TEXT` | `NOT NULL REFERENCES users(id)` | Referenzierter Teilnehmer |
| `answer_text` | `TEXT` | `NULLABLE` | Rohantwort (z.B. Text / Optionstext) |
| `selected_option` | `INTEGER`| `NULLABLE` | Gewählter Optionsindex (Multiple Choice) |
| `numeric_value` | `REAL` | `NULLABLE` | Eingegebene Zahl (Schätzfrage) |
| `is_correct` | `INTEGER` | `NOT NULL DEFAULT 0` | 1 = Richtig / Treffer, 0 = Falsch |
| `raw_score` | `INTEGER` | `NOT NULL DEFAULT 0` | Basis-Punkte vor Geschwindigkeitsbonus |
| `speed_bonus_pct` | `REAL` | `NOT NULL DEFAULT 0` | Angewandter Zeitbonus-Faktor (1.0, 0.85, 0.70, 0.55) |
| `final_points` | `INTEGER` | `NOT NULL DEFAULT 0` | Gutgeschriebene Gesamtpunkte |
| `rank_in_speed` | `INTEGER` | `NOT NULL DEFAULT 0` | Eingangsplatzierung bei korrekten Antworten |
| `submitted_at` | `INTEGER` | `NOT NULL` | Server-Zeitstempel in Millisekunden |

*Constraints & Indizes*:
- `UNIQUE(slide_id, user_id)` (Verhindert Mehrfachabgaben pro Folie)
- `idx_submissions_slide ON quiz_submissions(slide_id)`
- `idx_submissions_user ON quiz_submissions(user_id)`

---

### 4. `app_state` (Zentraler Live-Synchronisationsstatus)
Singleton-Tabelle (immer nur `id = 1`) für den globalen Zustand der gesamten Rallye.

| Spalte | Typ | Constraints | Beschreibung |
|---|---|---|---|
| `id` | `INTEGER` | `PRIMARY KEY CHECK(id = 1)` | Singleton ID |
| `current_slide_id` | `TEXT` | `NULLABLE` | ID der aktuell aktiven Folie |
| `current_slide_index` | `INTEGER`| `NOT NULL DEFAULT 0` | 0-basierter Index der Folie |
| `phase` | `INTEGER` | `NOT NULL DEFAULT 1` | Aktuelle Quiz-Phase (1 bis 5) |
| `timer_start` | `INTEGER` | `NOT NULL DEFAULT 0` | Start-Zeitstempel in ms (für synchronen Client-Timer) |
| `timer_duration` | `INTEGER` | `NOT NULL DEFAULT 20` | Countdown-Dauer in Sekunden |
| `timer_status` | `TEXT` | `NOT NULL DEFAULT 'stopped'` | `'stopped'`, `'running'`, `'expired'` |
| `active_announcement` | `TEXT` | `NULLABLE` | Aktive Live-Eilmeldung des Admins |
| `announcement_time` | `INTEGER` | `NOT NULL DEFAULT 0` | Zeitstempel der Eilmeldung |
| `content_version` | `TEXT` | `NOT NULL DEFAULT '1'` | Hash/Timestamp für Offline-Medien-Cache-Invalidierung |
| `updated_at` | `TEXT` | `NOT NULL` | Letzte Zustandsänderung |

---

### 5. `announcements` (Historie der Eilmeldungen)
Archiv für alle während der Tour ausgesendeten Eilmeldungen.

| Spalte | Typ | Constraints | Beschreibung |
|---|---|---|---|
| `id` | `TEXT` | `PRIMARY KEY` | UUID der Meldung |
| `message` | `TEXT` | `NOT NULL` | Text der Eilmeldung |
| `created_at` | `INTEGER` | `NOT NULL` | Zeitstempel in Millisekunden |

---

## 🔄 Phasen-Definitionen im System

- **Phase 1: Frage & Medien anzeigen**
  - Folie wird auf allen Geräten geladen.
  - Text/Bilder/Audio sichtbar.
  - Antwortoptionen und Eingabefelder sind verborgen/gesperrt.
- **Phase 2: Antworten einblenden (Gesperrt)**
  - Antwortmöglichkeiten werden bei allen Teilnehmern eingeblendet.
  - Buttons/Eingaben sind deaktiviert ("Warten auf Timer-Start").
- **Phase 3: Timer & Abstimmung starten**
  - Synchroner Countdown läuft auf allen Geräten los.
  - Eingabefelder und Antwort-Buttons werden freigeschaltet.
  - Submissions werden mit Millisekunden-Genauigkeit entgegengenommen.
  - Bei Timer-Ende oder manuellem Stopp: Sperrung aller Eingaben.
- **Phase 4: Auflösung & Punkteanimation**
  - Richtige Antwortoption / Zielzahl wird farblich hervorgehoben.
  - Individuelle Punkteberechnung (Basis x Geschwindigkeitsbonus).
  - Web Audio Soundeffekt & Odometer-Drehung & Konfetti bei Punktgewinn.
- **Phase 5: Zwischen-Leaderboard**
  - Anzeige des aktuellen Gesamt-Rankings aller Teilnehmer.
  - Vorbereitung für den Wechsel zur nächsten Folie.

---

## 📝 Änderungshistorie (Changelog)

- **Version 1.3.0 (2026-09-01)**:
  - Spalten `latitude` und `longitude` in Tabelle `slides` ergänzt: Optionale Geokoordinaten für Stationen (mit interaktivem Karten-Picker, Routen-Polyline & Richtungspfeilen sowie Teilnehmer-Navigation).
- **Version 1.2.0 (2026-09-01)**:
  - Spalte `admin_notes` in Tabelle `slides` ergänzt: Private Gedächtnisstützen / Trivia für den Spielleiter (bei Quizfragen in Phase 4, bei Info/Transit direkt sichtbar).
- **Version 1.1.0 (2026-08-19)**:
  - Spalte `audio_url` in Tabelle `slides` ergänzt, um Kombination aus Bild und Ton (Audio-Guide) zu ermöglichen.
  - Spalte `media_status` in Tabelle `app_state` hinzugefügt (`'stopped'`, `'playing'`, `'paused'`) für synchronen Live-Start von Audio/Video auf allen Geräten.
- **Version 1.0.0 (2026-08-19)**:
  - Initiales Schema erstellt mit `users`, `slides`, `quiz_submissions`, `app_state` und `announcements`.
  - WAL-Modus und Fremdschlüssel-Kaskadierung aktiviert.
