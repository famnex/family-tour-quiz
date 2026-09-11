process.env.DB_PATH = require('path').join(require('fs').mkdtempSync(require('path').join(require('os').tmpdir(), 'rallye-unit-')), 'test.db');
const assert = require('assert');
const http = require('http');
const { db } = require('../src/db');
const { getSpeedBonusFactor, calculateEstimationAccuracy, settleSlideScores, getLeaderboard } = require('../src/quizEngine');
const { seedDatabase } = require('../src/seed');

async function runTests() {
  console.log('🧪 Starte Test-Suite für Familienausflug-Rallye Companion App...\n');

  // Test 1: Speed Bonus Factors
  console.log('👉 Test 1: Geschwindigkeitsbonus Faktoren...');
  assert.strictEqual(getSpeedBonusFactor(1), 1.00, '1. Platz muss 100% (1.00) sein');
  assert.strictEqual(getSpeedBonusFactor(2), 0.85, '2. Platz muss 85% (0.85) sein');
  assert.strictEqual(getSpeedBonusFactor(3), 0.70, '3. Platz muss 70% (0.70) sein');
  assert.strictEqual(getSpeedBonusFactor(4), 0.55, '4. Platz muss 55% (0.55) sein');
  assert.strictEqual(getSpeedBonusFactor(5), 0.55, '5. Platz muss 55% (0.55) sein');
  console.log('✅ Test 1 erfolgreich bestanden.\n');

  // Test 2: Estimation Accuracy Gradient
  console.log('👉 Test 2: Schätzfragen Genauigkeits-Gradient...');
  const exactAcc = calculateEstimationAccuracy(284, 284, 100);
  assert.strictEqual(exactAcc, 1.0, 'Exakte Schätzung muss 1.0 Genauigkeit ergeben');

  const closeAcc = calculateEstimationAccuracy(274, 284, 100);
  assert.strictEqual(closeAcc, 0.9, '10 Abweichung bei Scale 100 muss 0.9 ergeben');

  const farAcc = calculateEstimationAccuracy(184, 284, 100);
  assert.strictEqual(farAcc, 0.0, '100 Abweichung bei Scale 100 muss 0.0 ergeben');
  console.log('✅ Test 2 erfolgreich bestanden.\n');

  // Test 3: Database Seeding & Schema Integrity
  console.log('👉 Test 3: Datenbank Seed & Schema-Integrität...');
  seedDatabase();
  const slides = db.prepare('SELECT * FROM slides ORDER BY order_index ASC').all();
  assert.strictEqual(slides.length, 8, 'Es müssen 8 Seed-Folien vorhanden sein');
  const appState = db.prepare('SELECT * FROM app_state WHERE id = 1').get();
  assert.ok(appState, 'app_state Eintrag mit id=1 muss existieren');
  assert.strictEqual(appState.phase, 1, 'Startphase muss 1 sein');
  console.log('✅ Test 3 erfolgreich bestanden.\n');

  // Test 4: Submissions Settlement Engine (Multiple Choice)
  console.log('👉 Test 4: Multiple-Choice Punkteabrechnung & Speed-Bonus...');
  const mcSlide = slides.find(s => s.type === 'multiple_choice');
  assert.ok(mcSlide, 'MC Slide muss existieren');

  // Create test players
  db.prepare("INSERT OR REPLACE INTO users (id, name, role, score, created_at, last_seen) VALUES ('test-user-1', 'Jonas', 'player', 0, datetime('now'), datetime('now'))").run();
  db.prepare("INSERT OR REPLACE INTO users (id, name, role, score, created_at, last_seen) VALUES ('test-user-2', 'Lea', 'player', 0, datetime('now'), datetime('now'))").run();
  db.prepare("INSERT OR REPLACE INTO users (id, name, role, score, created_at, last_seen) VALUES ('test-user-3', 'Papa', 'player', 0, datetime('now'), datetime('now'))").run();

  // User 1 submitted correct answer first (timestamp 1000)
  db.prepare(`
    INSERT OR REPLACE INTO quiz_submissions (id, slide_id, user_id, selected_option, submitted_at)
    VALUES ('sub-1', ?, 'test-user-1', ?, 1000)
  `).run(mcSlide.id, mcSlide.correct_option_index);

  // User 2 submitted correct answer second (timestamp 2000)
  db.prepare(`
    INSERT OR REPLACE INTO quiz_submissions (id, slide_id, user_id, selected_option, submitted_at)
    VALUES ('sub-2', ?, 'test-user-2', ?, 2000)
  `).run(mcSlide.id, mcSlide.correct_option_index);

  // User 3 submitted wrong answer
  const wrongOption = (mcSlide.correct_option_index + 1) % 4;
  db.prepare(`
    INSERT OR REPLACE INTO quiz_submissions (id, slide_id, user_id, selected_option, submitted_at)
    VALUES ('sub-3', ?, 'test-user-3', ?, 3000)
  `).run(mcSlide.id, wrongOption);

  // Settle scores
  settleSlideScores(mcSlide.id);

  const sub1 = db.prepare('SELECT * FROM quiz_submissions WHERE id = ?').get('sub-1');
  const sub2 = db.prepare('SELECT * FROM quiz_submissions WHERE id = ?').get('sub-2');
  const sub3 = db.prepare('SELECT * FROM quiz_submissions WHERE id = ?').get('sub-3');

  assert.strictEqual(sub1.is_correct, 1);
  assert.strictEqual(sub1.speed_bonus_pct, 1.00);
  assert.strictEqual(sub1.final_points, 100);

  assert.strictEqual(sub2.is_correct, 1);
  assert.strictEqual(sub2.speed_bonus_pct, 0.85);
  assert.strictEqual(sub2.final_points, 85);

  assert.strictEqual(sub3.is_correct, 0);
  assert.strictEqual(sub3.final_points, 0);

  const leaderboard = getLeaderboard();
  assert.strictEqual(leaderboard[0].id, 'test-user-1');
  assert.strictEqual(leaderboard[0].score, 100);
  assert.strictEqual(leaderboard[1].id, 'test-user-2');
  assert.strictEqual(leaderboard[1].score, 85);
  console.log('✅ Test 4 erfolgreich bestanden.\n');

  // Test 5: Submissions Settlement Engine (Estimation)
  console.log('👉 Test 5: Schätzfragen Punkteabrechnung...');
  const estSlide = slides.find(s => s.type === 'estimation');
  assert.ok(estSlide, 'Estimation Slide muss existieren');

  // Jonas guesses exact target (e.g. 284)
  db.prepare(`
    INSERT OR REPLACE INTO quiz_submissions (id, slide_id, user_id, numeric_value, submitted_at)
    VALUES ('sub-est-1', ?, 'test-user-1', ?, 1000)
  `).run(estSlide.id, estSlide.target_value);

  // Lea guesses close value (diff = 12, scale = 120 -> acc = 0.9)
  db.prepare(`
    INSERT OR REPLACE INTO quiz_submissions (id, slide_id, user_id, numeric_value, submitted_at)
    VALUES ('sub-est-2', ?, 'test-user-2', ?, 2000)
  `).run(estSlide.id, estSlide.target_value + 12);

  settleSlideScores(estSlide.id);

  const subEst1 = db.prepare('SELECT * FROM quiz_submissions WHERE id = ?').get('sub-est-1');
  const subEst2 = db.prepare('SELECT * FROM quiz_submissions WHERE id = ?').get('sub-est-2');

  assert.strictEqual(subEst1.is_correct, 2); // Exact hit
  assert.strictEqual(subEst1.final_points, estSlide.max_points);

  assert.strictEqual(subEst2.is_correct, 1); // Close estimate
  assert.ok(subEst2.final_points > 0 && subEst2.final_points < estSlide.max_points);
  // Test 6: GPS Coordinates & Route Data Integrity
  console.log('👉 Test 6: GPS-Koordinaten & Routen-Wegpunkte Schema-Integrität...');
  const slidesWithGps = db.prepare('SELECT id, title, latitude, longitude FROM slides WHERE latitude IS NOT NULL AND longitude IS NOT NULL').all();
  assert.ok(slidesWithGps.length >= 8, 'Mindestens 8 Folien müssen gültige GPS-Koordinaten besitzen');
  
  const slide1 = slidesWithGps.find(s => s.id === 'slide-01');
  assert.strictEqual(typeof slide1.latitude, 'number');
  assert.strictEqual(typeof slide1.longitude, 'number');
  assert.strictEqual(slide1.latitude, 50.9778);
  assert.strictEqual(slide1.longitude, 11.0287);
  console.log('✅ Test 6 erfolgreich bestanden.\n');

  console.log('🎉 ALLE TESTS ERFOLGREICH ABGESCHLOSSEN!');
}

runTests().catch(err => {
  console.error('❌ Test fehlgeschlagen:', err);
  process.exit(1);
});
