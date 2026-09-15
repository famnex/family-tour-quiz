const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'family_tour.db');

// Ensure data & backup directory exists
const dataDir = path.dirname(DB_PATH);
const backupDir = path.join(dataDir, 'backups');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}
if (!fs.existsSync(backupDir)) {
  fs.mkdirSync(backupDir, { recursive: true });
}

// 🛡️ Auto-Restore: If main database is missing or empty, restore latest backup
if (!fs.existsSync(DB_PATH) || fs.statSync(DB_PATH).size === 0) {
  try {
    const backupFiles = fs.readdirSync(backupDir)
      .filter(f => f.endsWith('.db'))
      .sort((a, b) => b.localeCompare(a));
    
    if (backupFiles.length > 0) {
      const latestBackup = path.join(backupDir, backupFiles[0]);
      console.log(`[Database] 🛡️ Stelle Datenbank aus Backup wieder her: ${backupFiles[0]}`);
      fs.copyFileSync(latestBackup, DB_PATH);
    }
  } catch (err) {
    console.warn('[Database] Auto-Restore Prüfung fehlgeschlagen:', err);
  }
}

const db = new Database(DB_PATH);

// Optimize SQLite for high concurrency and speed
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.pragma('foreign_keys = ON');

// 🛡️ Automated Backup Function (Rotating up to 15 Backups)
function createAutomaticBackup() {
  try {
    if (!fs.existsSync(DB_PATH) || fs.statSync(DB_PATH).size === 0) return;
    
    const now = new Date();
    const dateStr = now.toISOString().replace(/[:.]/g, '-') + '-' + require('crypto').randomBytes(3).toString('hex');
    const backupTarget = path.join(backupDir, `family_tour_${dateStr}.db`);
    
    // Use SQLite backup API for 100% consistent transactional copy
    db.backup(backupTarget)
      .then(() => {
        // Also keep a static family_tour.db.bak for quick manual access
        fs.copyFileSync(backupTarget, path.join(dataDir, 'family_tour.db.bak'));

        // Rotate: keep only the newest 15 backups
        const files = fs.readdirSync(backupDir)
          .filter(f => f.endsWith('.db'))
          .sort((a, b) => b.localeCompare(a));
        
        if (files.length > 15) {
          files.slice(15).forEach(oldFile => {
            try { fs.unlinkSync(path.join(backupDir, oldFile)); } catch (e) {}
          });
        }
      })
      .catch(err => {
        console.warn('[Database] Backup fehlgeschlagen:', err);
      });
  } catch (err) {
    console.warn('[Database] Backup Fehler:', err);
  }
}

function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT UNIQUE NOT NULL COLLATE NOCASE,
      role TEXT NOT NULL DEFAULT 'player',
      avatar_color TEXT NOT NULL DEFAULT '#4f46e5',
      avatar_emoji TEXT NOT NULL DEFAULT '🌟',
      score INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      last_seen TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS slides (
      id TEXT PRIMARY KEY,
      tour_id TEXT NOT NULL DEFAULT 'default',
      order_index INTEGER NOT NULL,
      type TEXT NOT NULL, -- 'info', 'multiple_choice', 'estimation', 'action'
      title TEXT NOT NULL,
      description TEXT,
      location_name TEXT,
      meeting_time TEXT,
      media_url TEXT,
      audio_url TEXT, -- Additional audio file/URL when image + sound is used
      media_type TEXT DEFAULT 'image', -- 'image', 'audio', 'video', 'image_and_audio'
      question TEXT,
      options_json TEXT, -- JSON Array: ["Option A", "Option B", "Option C", "Option D"]
      correct_option_index INTEGER, -- 0-based
      target_value REAL, -- Exact numeric target for estimation
      tolerance REAL DEFAULT 10,
      scale_factor REAL DEFAULT 100, -- Gradient scaling factor
      max_points INTEGER NOT NULL DEFAULT 100,
      countdown_seconds INTEGER NOT NULL DEFAULT 20,
      admin_notes TEXT, -- Private memory notes/background trivia for the admin only
      latitude REAL, -- GPS Latitude (e.g. 50.9787)
      longitude REAL, -- GPS Longitude (e.g. 11.0328)
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS quiz_submissions (
      id TEXT PRIMARY KEY,
      slide_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      answer_text TEXT,
      selected_option INTEGER,
      numeric_value REAL,
      is_correct INTEGER NOT NULL DEFAULT 0,
      raw_score INTEGER NOT NULL DEFAULT 0,
      speed_bonus_pct REAL NOT NULL DEFAULT 0,
      final_points INTEGER NOT NULL DEFAULT 0,
      rank_in_speed INTEGER NOT NULL DEFAULT 0,
      submitted_at INTEGER NOT NULL,
      UNIQUE(slide_id, user_id),
      FOREIGN KEY (slide_id) REFERENCES slides(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS app_state (
      id INTEGER PRIMARY KEY CHECK(id = 1),
      current_slide_id TEXT,
      current_slide_index INTEGER NOT NULL DEFAULT 0,
      phase INTEGER NOT NULL DEFAULT 1, -- 1: View Question/Media, 2: Show Options (Locked), 3: Timer & Voting, 4: Resolution & Points, 5: Leaderboard
      timer_start INTEGER NOT NULL DEFAULT 0,
      timer_duration INTEGER NOT NULL DEFAULT 20,
      timer_status TEXT NOT NULL DEFAULT 'stopped', -- 'stopped', 'running', 'expired'
      media_status TEXT NOT NULL DEFAULT 'stopped', -- 'stopped', 'playing', 'paused'
      active_announcement TEXT,
      announcement_time INTEGER NOT NULL DEFAULT 0,
      content_version TEXT NOT NULL DEFAULT '1',
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS announcements (
      id TEXT PRIMARY KEY,
      message TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_slides_order ON slides(order_index);
    CREATE INDEX IF NOT EXISTS idx_submissions_slide ON quiz_submissions(slide_id);
    CREATE INDEX IF NOT EXISTS idx_submissions_user ON quiz_submissions(user_id);
    CREATE INDEX IF NOT EXISTS idx_users_score ON users(score DESC);
  `);

  // Safe migrations for existing databases
  try {
    db.exec(`ALTER TABLE slides ADD COLUMN audio_url TEXT;`);
  } catch (e) {}
  try {
    db.exec(`ALTER TABLE slides ADD COLUMN admin_notes TEXT;`);
  } catch (e) {}
  try {
    db.exec(`ALTER TABLE slides ADD COLUMN latitude REAL;`);
  } catch (e) {}
  try {
    db.exec(`ALTER TABLE slides ADD COLUMN longitude REAL;`);
  } catch (e) {}
  try {
    db.exec(`ALTER TABLE app_state ADD COLUMN media_status TEXT NOT NULL DEFAULT 'stopped';`);
  } catch (e) {}

  if (!db.prepare('PRAGMA table_info(slides)').all().some(column => column.name === 'show_on_route')) {
    db.exec('ALTER TABLE slides ADD COLUMN show_on_route INTEGER NOT NULL DEFAULT 1 CHECK (show_on_route IN (0, 1))');
  }

  // Ensure singleton row in app_state exists
  const existingState = db.prepare('SELECT id FROM app_state WHERE id = 1').get();
  if (!existingState) {
    const firstSlide = db.prepare('SELECT id FROM slides ORDER BY order_index ASC LIMIT 1').get();
    db.prepare(`
      INSERT INTO app_state (id, current_slide_id, current_slide_index, phase, timer_start, timer_duration, timer_status, active_announcement, announcement_time, content_version, updated_at)
      VALUES (1, ?, 0, 1, 0, 20, 'stopped', NULL, 0, ?, datetime('now'))
    `).run(firstSlide ? firstSlide.id : null, Date.now().toString());
  }
}

// Helper to calculate or bump content version
function bumpContentVersion() {
  const version = Date.now().toString();
  db.prepare(`UPDATE app_state SET content_version = ?, updated_at = datetime('now') WHERE id = 1`).run(version);
  return version;
}

initSchema();

// Run initial backup and schedule hourly automated backups
setTimeout(() => createAutomaticBackup(), 3000).unref();
setInterval(() => createAutomaticBackup(), 3600000).unref();

module.exports = {
  db,
  initSchema,
  bumpContentVersion,
  createAutomaticBackup,
  DB_PATH
};
