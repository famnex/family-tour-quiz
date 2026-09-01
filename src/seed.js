const { db, bumpContentVersion } = require('./db');
const { v4: uuidv4 } = require('uuid');

function seedDatabase() {
  console.log('Seeding initial tour data...');

  const sampleSlides = [
    {
      id: 'slide-01',
      tour_id: 'default',
      order_index: 0,
      type: 'info',
      title: 'Station 1: Historischer Marktplatz',
      description: 'Willkommen zur großen Familien-Rallye! Wir starten am alten Marktplatz. Schaut euch einmal in Ruhe um: Das prächtige Rathaus und die bunten Fachwerkhäuser stehen hier schon seit Jahrhunderten.',
      location_name: 'Marktplatz 1 (Vor dem Brunnen)',
      meeting_time: '14:00 Uhr',
      media_url: 'https://images.unsplash.com/photo-1513584684374-8bab748fbf90?auto=format&fit=crop&w=1200&q=80',
      media_type: 'image',
      question: null,
      options_json: null,
      correct_option_index: null,
      target_value: null,
      tolerance: 0,
      scale_factor: 100,
      max_points: 0,
      countdown_seconds: 20,
      admin_notes: 'Begrüßungs-Tipp: Am Brunnen versammeln, App-Verbindung aller Kinder prüfen und kurz die Spielregeln erklären!',
      latitude: 50.9778,
      longitude: 11.0287
    },
    {
      id: 'slide-02',
      tour_id: 'default',
      order_index: 1,
      type: 'multiple_choice',
      title: 'Rätsel 1: Der Rathausturm',
      description: 'Blickt hoch zur Turmspitze des Rathauses mit der goldenen Uhr.',
      location_name: 'Altes Rathaus',
      meeting_time: null,
      media_url: 'https://images.unsplash.com/photo-1569336415962-a4bd9f69cd83?auto=format&fit=crop&w=1200&q=80',
      media_type: 'image',
      question: 'In welchem Jahrhundert wurde dieser gotische Rathausturm fertiggestellt?',
      options_json: JSON.stringify([
        '12. Jahrhundert (1180)',
        '15. Jahrhundert (1485)',
        '18. Jahrhundert (1720)',
        '20. Jahrhundert (1910)'
      ]),
      correct_option_index: 1, // 15. Jahrhundert
      target_value: null,
      tolerance: 0,
      scale_factor: 100,
      max_points: 100,
      countdown_seconds: 25,
      admin_notes: 'Historischer Fun-Fact zum Vorlesen bei Auflösung: Der Turm brannte 1480 fast ab und wurde 1485 mit dem berühmten Glockenspiel neu eröffnet!',
      latitude: 50.9776,
      longitude: 11.0290
    },
    {
      id: 'slide-03',
      tour_id: 'default',
      order_index: 2,
      type: 'estimation',
      title: 'Schätzfrage: St. Martin Turmstufen',
      description: 'Gleich neben dem Marktplatz ragt die Kirche St. Martin in den Himmel. Wer hinauf zur Aussichtsplattform will, muss viele Stufen steigen!',
      location_name: 'Kirchturm St. Martin',
      meeting_time: null,
      media_url: 'https://images.unsplash.com/photo-1548625361-16eb1a25db95?auto=format&fit=crop&w=1200&q=80',
      media_type: 'image',
      question: 'Wie viele steinerne Treppenstufen führen insgesamt bis ganz nach oben?',
      options_json: null,
      correct_option_index: null,
      target_value: 284,
      tolerance: 20,
      scale_factor: 120,
      max_points: 150,
      countdown_seconds: 30,
      admin_notes: 'Vorlese-Tipp: Bei Auflösung verraten, dass der Turmwächter früher jeden Tag 3x hinaufsteigen musste!',
      latitude: 50.9782,
      longitude: 11.0315
    },
    {
      id: 'slide-04',
      tour_id: 'default',
      order_index: 3,
      type: 'transit',
      title: 'Station 2: Weg zum Neptunbrunnen',
      description: 'Wir spazieren nun gemütlich durch die malerische Fußgängerzone hinüber zum Neptunbrunnen. Folgt den Schildern Richtung Marktgasse!',
      location_name: 'Neptunplatz',
      meeting_time: '14:45 Uhr',
      media_url: 'https://images.unsplash.com/photo-1572972985160-b8ec66d93427?auto=format&fit=crop&w=1200&q=80',
      media_type: 'image',
      question: null,
      options_json: null,
      correct_option_index: null,
      target_value: null,
      tolerance: 0,
      scale_factor: 100,
      max_points: 0,
      countdown_seconds: 20,
      admin_notes: 'Wegweiser: Rechts am Bäcker vorbei durch die Gasse.',
      latitude: 50.9790,
      longitude: 11.0330
    },
    {
      id: 'slide-05',
      tour_id: 'default',
      order_index: 4,
      type: 'multiple_choice',
      title: 'Rätsel 2: Das Wappentier am Zeughaus',
      description: 'Über dem Torbogen des alten Zeughauses befindet sich das historische Stadtwappen aus Sandstein.',
      location_name: 'Altes Zeughaus',
      meeting_time: null,
      media_url: 'https://images.unsplash.com/photo-1599839575945-a9e5af0c3fa5?auto=format&fit=crop&w=1200&q=80',
      media_type: 'image',
      question: 'Welches Tier hält den Schild im Stadtwappen?',
      options_json: JSON.stringify([
        'Ein geflügelter Löwe',
        'Ein stolzer Adler',
        'Ein goldener Hirsch',
        'Ein schwarzer Bär'
      ]),
      correct_option_index: 0, // Ein geflügelter Löwe
      target_value: null,
      tolerance: 0,
      scale_factor: 100,
      max_points: 100,
      countdown_seconds: 20,
      admin_notes: 'Hinweis für Spielleiter: Der geflügelte Löwe ist das Schutzsymbol der Marktgilde aus dem 16. Jahrhundert.',
      latitude: 50.9795,
      longitude: 11.0338
    },
    {
      id: 'slide-06',
      tour_id: 'default',
      order_index: 5,
      type: 'estimation',
      title: 'Schätzfrage: Die Glocke "Brummer"',
      description: 'Die größte Glocke der Altstadt wiegt einiges und wurde 1648 gegossen. Ihr tiefer Ton ist noch in 10 Kilometern Entfernung zu hören.',
      location_name: 'Glockenturm',
      meeting_time: null,
      media_url: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=1200&q=80',
      media_type: 'image',
      question: 'Wie schwer ist die Glocke "Brummer" in Kilogramm (kg)?',
      options_json: null,
      correct_option_index: null,
      target_value: 3450,
      tolerance: 250,
      scale_factor: 1500,
      max_points: 200,
      countdown_seconds: 30,
      admin_notes: 'Trivia: Die Glocke besteht aus Bronze (78% Kupfer, 22% Zinn).',
      latitude: 50.9772,
      longitude: 11.0250
    },
    {
      id: 'slide-07',
      tour_id: 'default',
      order_index: 6,
      type: 'action',
      title: 'Familien-Challenge: Schlossgarten-Selfie!',
      description: 'Findet die große Sonnenuhr im Schlossgarten! Macht alle zusammen ein lustiges Gruppen-Selfie, bei dem jeder eine historische Statue nachahmt.',
      location_name: 'Schlossgarten (Sonnenuhr)',
      meeting_time: '15:30 Uhr',
      media_url: 'https://images.unsplash.com/photo-1585320806297-9794b3e4eeae?auto=format&fit=crop&w=1200&q=80',
      media_type: 'image',
      question: 'Challenge abgeschlossen? Zeigt euer Bild dem Admin für Bonuspunkte!',
      options_json: null,
      correct_option_index: null,
      target_value: null,
      tolerance: 0,
      scale_factor: 100,
      max_points: 100,
      countdown_seconds: 45,
      admin_notes: 'Prämien-Vergabe: Für besonders kreative Posen bis zu 100 Punkte freischalten!',
      latitude: 50.9773,
      longitude: 11.0232
    },
    {
      id: 'slide-08',
      tour_id: 'default',
      order_index: 7,
      type: 'info',
      title: 'Großes Finale & Siegerehrung 🏆',
      description: 'Herzlichen Glückwunsch! Ihr habt alle Stationen der Rallye gemeistert. Jetzt folgt die feierliche Siegerehrung und für jeden gibt es ein großes Eis!',
      location_name: 'Eis-Café Venezia am Schlossplatz',
      meeting_time: '16:00 Uhr',
      media_url: 'https://images.unsplash.com/photo-1501446529957-6226bd447c46?auto=format&fit=crop&w=1200&q=80',
      media_type: 'image',
      question: null,
      options_json: null,
      correct_option_index: null,
      target_value: null,
      tolerance: 0,
      scale_factor: 100,
      max_points: 0,
      countdown_seconds: 20,
      admin_notes: 'Abschluss: Punktestand auf Phase 5 (Leaderboard) öffnen und feierlich die Urkunden/Eisgutscheine überreichen!',
      latitude: 50.9792,
      longitude: 11.0200
    }
  ];

  const insertSlide = db.prepare(`
    INSERT INTO slides (
      id, tour_id, order_index, type, title, description,
      location_name, meeting_time, media_url, media_type,
      question, options_json, correct_option_index,
      target_value, tolerance, scale_factor, max_points, countdown_seconds, admin_notes,
      latitude, longitude, created_at
    ) VALUES (
      ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?,
      ?, ?, ?, ?, ?, ?,
      ?, ?, datetime('now')
    )
  `);

  const seedTx = db.transaction(() => {
    // Clear old slides if starting clean seed
    db.prepare('DELETE FROM slides').run();
    db.prepare('DELETE FROM quiz_submissions').run();

    for (const slide of sampleSlides) {
      insertSlide.run(
        slide.id, slide.tour_id, slide.order_index, slide.type, slide.title, slide.description,
        slide.location_name, slide.meeting_time, slide.media_url, slide.media_type,
        slide.question, slide.options_json, slide.correct_option_index,
        slide.target_value, slide.tolerance, slide.scale_factor, slide.max_points, slide.countdown_seconds,
        slide.admin_notes || null,
        slide.latitude || null,
        slide.longitude || null
      );
    }

    // Reset app_state to slide 0, phase 1
    db.prepare(`
      UPDATE app_state SET 
        current_slide_id = 'slide-01',
        current_slide_index = 0,
        phase = 1,
        timer_start = 0,
        timer_duration = 20,
        timer_status = 'stopped',
        active_announcement = 'Willkommen zur Familienausflug-Rallye! 🎉',
        announcement_time = ?,
        content_version = ?,
        updated_at = datetime('now')
      WHERE id = 1
    `).run(Date.now(), Date.now().toString());

    // Insert demo admin and initial players if empty
    const adminExists = db.prepare("SELECT id FROM users WHERE role = 'admin'").get();
    if (!adminExists) {
      db.prepare(`
        INSERT OR IGNORE INTO users (id, name, role, avatar_color, avatar_emoji, score, created_at, last_seen)
        VALUES ('admin-01', 'Admin', 'admin', '#e11d48', '👑', 0, datetime('now'), datetime('now'))
      `).run();
    }
  });

  seedTx();
  bumpContentVersion();
  console.log(`Seeded ${sampleSlides.length} slides successfully.`);
}

if (require.main === module) {
  seedDatabase();
}

module.exports = { seedDatabase };
