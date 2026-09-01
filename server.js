const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const { WebSocketServer, WebSocket } = require('ws');
const { v4: uuidv4 } = require('uuid');

const { db, bumpContentVersion, createAutomaticBackup } = require('./src/db');
const { settleSlideScores, getLeaderboard, getSlideResults } = require('./src/quizEngine');
const { seedDatabase } = require('./src/seed');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });

// Handle WebSocket Upgrade for all proxy & subpath routes
server.on('upgrade', (request, socket, head) => {
  try {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  } catch (err) {
    console.error('WS Upgrade Error:', err);
    socket.destroy();
  }
});

const PORT = process.env.PORT || 5500;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(cookieParser());

// Subpath URL Rewriting (support https://cloud.mso-hef.de/family)
app.use((req, res, next) => {
  if (req.url === '/family') {
    return res.redirect(301, '/family/');
  }
  if (req.url.startsWith('/family/')) {
    req.url = req.url.slice(7) || '/';
  }
  next();
});

const staticMiddleware = express.static(path.join(__dirname, 'public'), {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html') || filePath.endsWith('.css') || filePath.endsWith('.js') || filePath.endsWith('.json')) {
      res.setHeader('Cache-Control', 'no-cache, must-revalidate');
    }
  }
});

app.use(staticMiddleware);
app.use('/family', staticMiddleware);

// Store active WebSocket client connections
const wsClients = new Map(); // ws -> { userId, role }

// Timer timeout reference for automatic expiration
let activeTimerTimeout = null;

// ==========================================
// WEBSOCKET BROADCASTING HELPERS
// ==========================================

function broadcast(data, filterFn = null) {
  const msg = JSON.stringify(data);
  for (const [clientWs, clientData] of wsClients.entries()) {
    if (clientWs.readyState === WebSocket.OPEN) {
      if (!filterFn || filterFn(clientData)) {
        clientWs.send(msg);
      }
    }
  }
}

function broadcastState() {
  for (const [clientWs, clientData] of wsClients.entries()) {
    if (clientWs.readyState === WebSocket.OPEN) {
      const state = getFullAppState(clientData?.userId || null);
      clientWs.send(JSON.stringify({ type: 'state_update', state }));
    }
  }
}

function broadcastAnnouncement(message) {
  broadcast({ type: 'announcement', message, timestamp: Date.now() });
}

function broadcastLeaderboard() {
  const leaderboard = getLeaderboard();
  broadcast({ type: 'leaderboard_update', leaderboard });
}

// ==========================================
// STATE MANAGEMENT HELPERS
// ==========================================

function getFullAppState(userId = null) {
  const state = db.prepare('SELECT * FROM app_state WHERE id = 1').get();
  const allSlides = db.prepare('SELECT * FROM slides ORDER BY order_index ASC').all();
  
  let currentSlide = null;
  if (state.current_slide_id) {
    currentSlide = allSlides.find(s => s.id === state.current_slide_id) || allSlides[0] || null;
  } else if (allSlides.length > 0) {
    currentSlide = allSlides[0];
  }

  // Parse options_json for current slide if present
  let sanitizedSlide = null;
  if (currentSlide) {
    sanitizedSlide = {
      ...currentSlide,
      options: currentSlide.options_json ? JSON.parse(currentSlide.options_json) : []
    };
  }

  // If user requested, fetch their submission for the current slide
  let userSubmission = null;
  if (userId && currentSlide) {
    userSubmission = db.prepare(`
      SELECT * FROM quiz_submissions 
      WHERE slide_id = ? AND user_id = ?
    `).get(currentSlide.id, userId) || null;
  }

  // Submission statistics & live player vote tracking for Admin
  let submissionCount = 0;
  const allUsers = db.prepare("SELECT id, name, role, avatar_emoji, avatar_color, score, last_seen FROM users ORDER BY score DESC, name ASC").all();
  let totalPlayers = allUsers.length;
  
  const submissions = currentSlide ? db.prepare(`
    SELECT user_id, submitted_at, is_correct, final_points, answer_text, selected_option, numeric_value
    FROM quiz_submissions 
    WHERE slide_id = ?
  `).all(currentSlide.id) : [];

  submissionCount = submissions.length;
  const submissionMap = new Map(submissions.map(s => [s.user_id, s]));

  const participantsStatus = allUsers.map(u => {
    const sub = submissionMap.get(u.id);
    return {
      id: u.id,
      name: u.name,
      avatar_emoji: u.avatar_emoji || '🌟',
      avatar_color: u.avatar_color || '#4f46e5',
      score: u.score || 0,
      has_submitted: !!sub,
      submitted_at: sub ? sub.submitted_at : null,
      is_correct: sub ? sub.is_correct : null,
      final_points: sub ? sub.final_points : null
    };
  });

  // Leaderboard data
  const leaderboard = getLeaderboard();
  
  // Results if in phase 4 or 5
  let slideResults = null;
  if (currentSlide && (state.phase === 4 || state.phase === 5)) {
    slideResults = getSlideResults(currentSlide.id);
  }

  return {
    phase: state.phase,
    current_slide_index: state.current_slide_index,
    total_slides: allSlides.length,
    current_slide: sanitizedSlide,
    timer: {
      status: state.timer_status,
      start: state.timer_start,
      duration: state.timer_duration,
      remaining: calculateRemainingTimer(state)
    },
    active_announcement: state.active_announcement,
    announcement_time: state.announcement_time,
    content_version: state.content_version,
    user_submission: userSubmission,
    submission_stats: {
      submitted: submissionCount,
      total_players: totalPlayers
    },
    participants_status: participantsStatus,
    leaderboard,
    slide_results: slideResults
  };
}

function calculateRemainingTimer(state) {
  if (state.timer_status !== 'running' || !state.timer_start) {
    return 0;
  }
  const elapsed = (Date.now() - state.timer_start) / 1000;
  const remaining = Math.max(0, Math.ceil(state.timer_duration - elapsed));
  return remaining;
}

function startTimerOnServer(durationSeconds) {
  if (activeTimerTimeout) {
    clearTimeout(activeTimerTimeout);
    activeTimerTimeout = null;
  }

  const duration = parseInt(durationSeconds, 10) || 20;
  const now = Date.now();

  db.prepare(`
    UPDATE app_state SET 
      timer_status = 'running',
      timer_start = ?,
      timer_duration = ?,
      phase = 3,
      updated_at = datetime('now')
    WHERE id = 1
  `).run(now, duration);

  broadcastState();

  // Set timeout to expire timer automatically
  activeTimerTimeout = setTimeout(() => {
    expireTimerOnServer();
  }, duration * 1000);
}

function stopTimerOnServer() {
  if (activeTimerTimeout) {
    clearTimeout(activeTimerTimeout);
    activeTimerTimeout = null;
  }

  db.prepare(`
    UPDATE app_state SET 
      timer_status = 'stopped',
      updated_at = datetime('now')
    WHERE id = 1
  `).run();

  broadcastState();
}

function expireTimerOnServer() {
  activeTimerTimeout = null;
  db.prepare(`
    UPDATE app_state SET 
      timer_status = 'expired',
      updated_at = datetime('now')
    WHERE id = 1
  `).run();

  broadcastState();
}

// ==========================================
// REST API ROUTES
// ==========================================

// Auth: Login / Register (No password required)
app.post('/api/auth/login', (req, res) => {
  const { name, avatar_color, avatar_emoji, role } = req.body;
  if (!name || name.trim() === '') {
    return res.status(400).json({ error: 'Name ist erforderlich' });
  }

  const cleanName = name.trim();
  const userRole = role === 'admin' ? 'admin' : 'player';
  const color = avatar_color || '#4f46e5';
  const emoji = avatar_emoji || '🚀';

  let user = db.prepare('SELECT * FROM users WHERE name = ? COLLATE NOCASE').get(cleanName);

  if (!user) {
    const id = uuidv4();
    db.prepare(`
      INSERT INTO users (id, name, role, avatar_color, avatar_emoji, score, created_at, last_seen)
      VALUES (?, ?, ?, ?, ?, 0, datetime('now'), datetime('now'))
    `).run(id, cleanName, userRole, color, emoji);

    user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  } else {
    // Update last_seen and avatar preferences if provided
    db.prepare(`
      UPDATE users SET 
        avatar_color = COALESCE(?, avatar_color),
        avatar_emoji = COALESCE(?, avatar_emoji),
        role = ?,
        last_seen = datetime('now')
      WHERE id = ?
    `).run(avatar_color, avatar_emoji, userRole, user.id);

    user = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id);
  }

  res.cookie('auth_token', user.id, { maxAge: 30 * 24 * 60 * 60 * 1000, httpOnly: false });
  res.json({ user, token: user.id });
});

// Auth: Get current session user
app.get('/api/auth/me', (req, res) => {
  const userId = req.headers.authorization?.replace('Bearer ', '') || req.cookies?.auth_token;
  if (!userId) {
    return res.status(401).json({ error: 'Nicht authentifiziert' });
  }

  let user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!user) {
    const fallbackName = req.headers['x-user-name'];
    if (fallbackName && fallbackName.trim() !== '') {
      user = db.prepare('SELECT * FROM users WHERE name = ? COLLATE NOCASE').get(fallbackName.trim());
      if (!user) {
        const newId = uuidv4();
        db.prepare(`
          INSERT INTO users (id, name, role, avatar_color, avatar_emoji, score, created_at, last_seen)
          VALUES (?, ?, 'player', '#4f46e5', '🌟', 0, datetime('now'), datetime('now'))
        `).run(newId, fallbackName.trim());
        user = db.prepare('SELECT * FROM users WHERE id = ?').get(newId);
      }
    }
  }

  if (!user) {
    return res.status(401).json({ error: 'Benutzer nicht gefunden' });
  }

  // Update last seen
  db.prepare("UPDATE users SET last_seen = datetime('now') WHERE id = ?").run(user.id);
  res.json({ user });
});

// Admin Password Verification
app.post('/api/admin/auth', (req, res) => {
  const { password, userId } = req.body;
  const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'casaxx';

  if (password === ADMIN_PASSWORD) {
    if (userId) {
      db.prepare("UPDATE users SET role = 'admin' WHERE id = ?").run(userId);
    }
    return res.json({ success: true, message: 'Admin-Bereich freigeschaltet' });
  }

  return res.status(401).json({ error: 'Falsches Admin-Passwort!' });
});

// App State
app.get('/api/state', (req, res) => {
  const userId = req.headers.authorization?.replace('Bearer ', '') || req.cookies?.auth_token;
  const state = getFullAppState(userId);
  res.json(state);
});

// All Slides (for Cache & Studio)
app.get('/api/slides', (req, res) => {
  const slides = db.prepare('SELECT * FROM slides ORDER BY order_index ASC').all();
  const parsedSlides = slides.map(s => ({
    ...s,
    options: s.options_json ? JSON.parse(s.options_json) : []
  }));
  res.json(parsedSlides);
});

// Single Slide
app.get('/api/slides/:id', (req, res) => {
  const slide = db.prepare('SELECT * FROM slides WHERE id = ?').get(req.params.id);
  if (!slide) {
    return res.status(404).json({ error: 'Folie nicht gefunden' });
  }
  res.json({
    ...slide,
    options: slide.options_json ? JSON.parse(slide.options_json) : []
  });
});

// Content Version (for Cache-First check)
app.get('/api/version', (req, res) => {
  const state = db.prepare('SELECT content_version FROM app_state WHERE id = 1').get();
  res.json({ version: state ? state.content_version : '1' });
});

// Leaderboard
app.get('/api/leaderboard', (req, res) => {
  res.json(getLeaderboard());
});

// Pedestrian / Foot Routing API Proxy (Kürzeste Fußgänger-Route über Fußwege, Parks & Straßen)
const routeCache = new Map();

app.get('/api/route', async (req, res) => {
  const { coords } = req.query;
  if (!coords) {
    return res.status(400).json({ error: 'coords parameter erforderlich (lng,lat;lng,lat...)' });
  }

  if (routeCache.has(coords)) {
    return res.json(routeCache.get(coords));
  }

  // 1. Priorisiere OpenStreetMap Fußgänger-Routing (routed-foot)
  const urls = [
    `https://routing.openstreetmap.de/routed-foot/route/v1/foot/${coords}?overview=full&geometries=geojson`,
    `https://router.project-osrm.org/route/v1/foot/${coords}?overview=full&geometries=geojson`
  ];

  for (const url of urls) {
    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': 'FamilienausflugRallye/1.5.4 (Pedestrian Route Planner)' },
        signal: AbortSignal.timeout(5000)
      });
      if (response.ok) {
        const data = await response.json();
        if (data.code === 'Ok' && data.routes && data.routes[0]) {
          routeCache.set(coords, data);
          return res.json(data);
        }
      }
    } catch (e) {
      // Nächste Routing-URL versuchen
    }
  }

  res.status(502).json({ error: 'Routing-Dienst aktuell nicht erreichbar' });
});

// Submit Quiz Answer
app.post('/api/submissions', (req, res) => {
  const userId = req.headers.authorization?.replace('Bearer ', '') || req.cookies?.auth_token || req.body.user_id;
  if (!userId) {
    return res.status(401).json({ error: 'Nicht angemeldet' });
  }

  const { slide_id, answer_text, selected_option, numeric_value } = req.body;
  if (!slide_id) {
    return res.status(400).json({ error: 'slide_id erforderlich' });
  }

  const state = db.prepare('SELECT * FROM app_state WHERE id = 1').get();
  if (state.current_slide_id !== slide_id) {
    return res.status(400).json({ error: 'Diese Folie ist nicht aktiv' });
  }

  // Submissions are only accepted in Phase 3 and while timer is not expired
  if (state.phase !== 3 || state.timer_status === 'expired') {
    return res.status(400).json({ error: 'Antwortabgabe ist aktuell gesperrt' });
  }

  const now = Date.now();
  const subId = uuidv4();

  try {
    db.prepare(`
      INSERT INTO quiz_submissions (
        id, slide_id, user_id, answer_text, selected_option, numeric_value,
        is_correct, raw_score, speed_bonus_pct, final_points, rank_in_speed, submitted_at
      ) VALUES (?, ?, ?, ?, ?, ?, 0, 0, 0, 0, 0, ?)
      ON CONFLICT(slide_id, user_id) DO UPDATE SET
        answer_text = excluded.answer_text,
        selected_option = excluded.selected_option,
        numeric_value = excluded.numeric_value,
        submitted_at = excluded.submitted_at
    `).run(subId, slide_id, userId, answer_text || null, selected_option !== undefined ? selected_option : null, numeric_value !== undefined ? numeric_value : null, now);

    const submission = db.prepare('SELECT * FROM quiz_submissions WHERE slide_id = ? AND user_id = ?').get(slide_id, userId);

    // Notify Admin of submission
    const user = db.prepare('SELECT name, avatar_emoji FROM users WHERE id = ?').get(userId);
    const subCount = db.prepare('SELECT COUNT(*) as count FROM quiz_submissions WHERE slide_id = ?').get(slide_id).count;
    
    broadcast({
      type: 'submission_received',
      slide_id,
      user_name: user?.name,
      user_emoji: user?.avatar_emoji,
      submission_count: subCount
    });
    broadcastState();

    res.json({ success: true, submission });
  } catch (err) {
    console.error('Submission error:', err);
    res.status(500).json({ error: 'Fehler beim Speichern der Antwort' });
  }
});

// Admin: Delete User / Participant
app.delete('/api/admin/users/:id', (req, res) => {
  const { id } = req.params;
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!user) {
    return res.status(404).json({ error: 'Benutzer nicht gefunden' });
  }

  db.transaction(() => {
    db.prepare('DELETE FROM quiz_submissions WHERE user_id = ?').run(id);
    db.prepare('DELETE FROM users WHERE id = ?').run(id);
  })();

  broadcastState();
  broadcastLeaderboard();

  res.json({ success: true, message: `Benutzer ${user.name} gelöscht` });
});

// ==========================================
// ADMIN CONTROLLER & STUDIO ENDPOINTS
// ==========================================

// Change Active Slide
app.post('/api/admin/set-slide', (req, res) => {
  const { slide_id, slide_index } = req.body;
  const allSlides = db.prepare('SELECT * FROM slides ORDER BY order_index ASC').all();
  
  let targetSlide = null;
  let targetIndex = 0;

  if (slide_id) {
    targetIndex = allSlides.findIndex(s => s.id === slide_id);
    if (targetIndex !== -1) {
      targetSlide = allSlides[targetIndex];
    }
  } else if (slide_index !== undefined) {
    const idx = parseInt(slide_index, 10);
    if (idx >= 0 && idx < allSlides.length) {
      targetSlide = allSlides[idx];
      targetIndex = idx;
    }
  }

  if (!targetSlide) {
    return res.status(400).json({ error: 'Ungültige Folie' });
  }

  // Clear timer
  if (activeTimerTimeout) {
    clearTimeout(activeTimerTimeout);
    activeTimerTimeout = null;
  }

  db.prepare(`
    UPDATE app_state SET 
      current_slide_id = ?,
      current_slide_index = ?,
      phase = 1,
      timer_status = 'stopped',
      timer_start = 0,
      timer_duration = ?,
      updated_at = datetime('now')
    WHERE id = 1
  `).run(targetSlide.id, targetIndex, targetSlide.countdown_seconds || 20);

  broadcastState();
  res.json({ success: true, current_slide: targetSlide, phase: 1 });
});

// Change Quiz Phase (1..5)
app.post('/api/admin/set-phase', (req, res) => {
  const { phase } = req.body;
  const phaseNum = parseInt(phase, 10);

  if (phaseNum < 1 || phaseNum > 5) {
    return res.status(400).json({ error: 'Ungültige Phase (1-5)' });
  }

  const state = db.prepare('SELECT * FROM app_state WHERE id = 1').get();

  // If transitioning to Phase 3 (Timer & Vote), automatically start countdown
  if (phaseNum === 3 && state.current_slide_id) {
    const currentSlide = db.prepare('SELECT countdown_seconds FROM slides WHERE id = ?').get(state.current_slide_id);
    const dur = currentSlide ? (currentSlide.countdown_seconds || 20) : 20;
    startTimerOnServer(dur);
  }

  // If transitioning to Phase 4 (Auflösung), settle scores & update leaderboard
  if (phaseNum === 4 && state.current_slide_id) {
    stopTimerOnServer();
    settleSlideScores(state.current_slide_id);
  }

  db.prepare(`
    UPDATE app_state SET 
      phase = ?,
      updated_at = datetime('now')
    WHERE id = 1
  `).run(phaseNum);

  broadcastState();
  if (phaseNum === 4 || phaseNum === 5) {
    broadcastLeaderboard();
  }

  res.json({ success: true, phase: phaseNum });
});

// Timer: Start
app.post('/api/admin/timer/start', (req, res) => {
  const { duration } = req.body;
  const state = db.prepare('SELECT * FROM app_state WHERE id = 1').get();
  const dur = duration ? parseInt(duration, 10) : (state.timer_duration || 20);
  startTimerOnServer(dur);
  res.json({ success: true, status: 'running', duration: dur });
});

// Timer: Stop
app.post('/api/admin/timer/stop', (req, res) => {
  stopTimerOnServer();
  res.json({ success: true, status: 'stopped' });
});

// Push Announcement (Eilmeldung)
app.post('/api/admin/announcement', (req, res) => {
  const { message } = req.body;
  if (!message || message.trim() === '') {
    return res.status(400).json({ error: 'Nachricht erforderlich' });
  }

  const cleanMsg = message.trim();
  const now = Date.now();
  const id = uuidv4();

  db.prepare('INSERT INTO announcements (id, message, created_at) VALUES (?, ?, ?)').run(id, cleanMsg, now);
  db.prepare(`
    UPDATE app_state SET 
      active_announcement = ?,
      announcement_time = ?,
      updated_at = datetime('now')
    WHERE id = 1
  `).run(cleanMsg, now);

  broadcastAnnouncement(cleanMsg);
  broadcastState();

  res.json({ success: true, message: cleanMsg });
});

// Clear Announcement
app.post('/api/admin/clear-announcement', (req, res) => {
  db.prepare(`
    UPDATE app_state SET 
      active_announcement = NULL,
      announcement_time = 0,
      updated_at = datetime('now')
    WHERE id = 1
  `).run();

  broadcastAnnouncement('');
  broadcastState();

  res.json({ success: true });
});

// Reset Rallye / Scores
app.post('/api/admin/reset-rallye', (req, res) => {
  const resetTx = db.transaction(() => {
    db.prepare('DELETE FROM quiz_submissions').run();
    db.prepare('UPDATE users SET score = 0').run();
    
    const firstSlide = db.prepare('SELECT id FROM slides ORDER BY order_index ASC LIMIT 1').get();
    db.prepare(`
      UPDATE app_state SET 
        current_slide_id = ?,
        current_slide_index = 0,
        phase = 1,
        timer_status = 'stopped',
        timer_start = 0,
        active_announcement = NULL,
        announcement_time = 0,
        updated_at = datetime('now')
      WHERE id = 1
    `).run(firstSlide ? firstSlide.id : null);
  });

  resetTx();
  broadcastAnnouncement('');
  broadcastState();
  broadcastLeaderboard();

  res.json({ success: true, message: 'Rallye erfolgreich zurückgesetzt' });
});

// File Upload API (Base64 Binary Upload)
app.post('/api/admin/upload', express.json({ limit: '50mb' }), (req, res) => {
  const { filename, filedata } = req.body;
  if (!filename || !filedata) {
    return res.status(400).json({ error: 'Dateiname und Daten erforderlich' });
  }

  try {
    const uploadsDir = path.join(__dirname, 'public', 'uploads');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    const cleanFilename = Date.now() + '_' + filename.replace(/[^a-zA-Z0-9_.-]/g, '_');
    const filePath = path.join(uploadsDir, cleanFilename);
    const base64Data = filedata.replace(/^data:[^;]+;base64,/, '');

    fs.writeFileSync(filePath, Buffer.from(base64Data, 'base64'));

    const fileUrl = `/uploads/${cleanFilename}`;
    res.json({ success: true, url: fileUrl });
  } catch (err) {
    console.error('Upload Error:', err);
    res.status(500).json({ error: 'Fehler beim Hochladen der Datei' });
  }
});

// Live Media Control (Play/Pause/Stop Audio or Video on all clients)
app.post('/api/admin/media-control', (req, res) => {
  const { action } = req.body;
  const status = action === 'play' ? 'playing' : action === 'pause' ? 'paused' : 'stopped';

  db.prepare(`UPDATE app_state SET media_status = ?, updated_at = datetime('now') WHERE id = 1`).run(status);

  broadcast({
    type: 'media_control',
    media_status: status,
    timestamp: Date.now()
  });
  broadcastState();

  res.json({ success: true, media_status: status });
});

// Slide Studio: Create Slide
app.post('/api/admin/slides', (req, res) => {
  const {
    type, title, description, location_name, meeting_time,
    media_url, audio_url, media_type, question, options, correct_option_index,
    target_value, tolerance, scale_factor, max_points, countdown_seconds, admin_notes,
    latitude, longitude
  } = req.body;

  if (!title || !type) {
    return res.status(400).json({ error: 'Titel und Typ erforderlich' });
  }

  const id = uuidv4();
  const maxOrder = db.prepare('SELECT COALESCE(MAX(order_index), -1) as max_order FROM slides').get().max_order;
  const newOrder = maxOrder + 1;

  db.prepare(`
    INSERT INTO slides (
      id, tour_id, order_index, type, title, description,
      location_name, meeting_time, media_url, audio_url, media_type,
      question, options_json, correct_option_index,
      target_value, tolerance, scale_factor, max_points, countdown_seconds, admin_notes,
      latitude, longitude, created_at
    ) VALUES (
      ?, 'default', ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?,
      ?, ?, ?, ?, ?, ?,
      ?, ?, datetime('now')
    )
  `).run(
    id, newOrder, type, title, description || null,
    location_name || null, meeting_time || null, media_url || null, audio_url || null, media_type || 'image',
    question || null, options ? JSON.stringify(options) : null, correct_option_index !== undefined ? correct_option_index : null,
    target_value !== undefined ? target_value : null, tolerance || 10, scale_factor || 100, max_points || 100, countdown_seconds || 20,
    admin_notes || null,
    latitude !== undefined && latitude !== null && latitude !== '' ? parseFloat(latitude) : null,
    longitude !== undefined && longitude !== null && longitude !== '' ? parseFloat(longitude) : null
  );

  bumpContentVersion();
  broadcast({ type: 'content_updated' });

  const slide = db.prepare('SELECT * FROM slides WHERE id = ?').get(id);
  res.json({ success: true, slide: { ...slide, options: slide.options_json ? JSON.parse(slide.options_json) : [] } });
});

// Slide Studio: Update Slide
app.put('/api/admin/slides/:id', (req, res) => {
  const { id } = req.params;
  const {
    type, title, description, location_name, meeting_time,
    media_url, audio_url, media_type, question, options, correct_option_index,
    target_value, tolerance, scale_factor, max_points, countdown_seconds, admin_notes,
    latitude, longitude
  } = req.body;

  const existing = db.prepare('SELECT id FROM slides WHERE id = ?').get(id);
  if (!existing) {
    return res.status(404).json({ error: 'Folie nicht gefunden' });
  }

  db.prepare(`
    UPDATE slides SET 
      type = ?, title = ?, description = ?,
      location_name = ?, meeting_time = ?, media_url = ?, audio_url = ?, media_type = ?,
      question = ?, options_json = ?, correct_option_index = ?,
      target_value = ?, tolerance = ?, scale_factor = ?, max_points = ?, countdown_seconds = ?,
      admin_notes = ?,
      latitude = ?, longitude = ?
    WHERE id = ?
  `).run(
    type, title, description || null,
    location_name || null, meeting_time || null, media_url || null, audio_url || null, media_type || 'image',
    question || null, options ? JSON.stringify(options) : null, correct_option_index !== undefined ? correct_option_index : null,
    target_value !== undefined ? target_value : null, tolerance || 10, scale_factor || 100, max_points || 100, countdown_seconds || 20,
    admin_notes || null,
    latitude !== undefined && latitude !== null && latitude !== '' ? parseFloat(latitude) : null,
    longitude !== undefined && longitude !== null && longitude !== '' ? parseFloat(longitude) : null,
    id
  );

  bumpContentVersion();
  broadcast({ type: 'content_updated' });
  broadcastState();

  const updated = db.prepare('SELECT * FROM slides WHERE id = ?').get(id);
  res.json({ success: true, slide: { ...updated, options: updated.options_json ? JSON.parse(updated.options_json) : [] } });
});

// Slide Studio: Delete Slide
app.delete('/api/admin/slides/:id', (req, res) => {
  const { id } = req.params;
  db.prepare('DELETE FROM slides WHERE id = ?').run(id);

  // Re-index remaining slides
  const remaining = db.prepare('SELECT id FROM slides ORDER BY order_index ASC').all();
  const updateOrder = db.prepare('UPDATE slides SET order_index = ? WHERE id = ?');
  db.transaction(() => {
    remaining.forEach((s, idx) => updateOrder.run(idx, s.id));
  })();

  bumpContentVersion();
  broadcast({ type: 'content_updated' });
  broadcastState();

  res.json({ success: true });
});

// Slide Studio: Reorder Slides
app.post('/api/admin/slides/reorder', (req, res) => {
  const { order } = req.body; // Array of slide IDs in desired order
  if (!Array.isArray(order)) {
    return res.status(400).json({ error: 'Order Array erforderlich' });
  }

  const updateStmt = db.prepare('UPDATE slides SET order_index = ? WHERE id = ?');
  db.transaction(() => {
    order.forEach((id, index) => {
      updateStmt.run(index, id);
    });
  })();

  bumpContentVersion();
  broadcast({ type: 'content_updated' });
  broadcastState();

  res.json({ success: true });
});

// Slide Studio: Re-seed sample tour
app.post('/api/admin/seed-sample', (req, res) => {
  createAutomaticBackup();
  seedDatabase();
  broadcastState();
  broadcastLeaderboard();
  res.json({ success: true, message: 'Beispiel-Tour neu geladen!' });
});

// 📥 Admin: Export Full Tour as JSON (100% Sicherung)
app.get('/api/admin/tour/export', (req, res) => {
  try {
    const slides = db.prepare('SELECT * FROM slides ORDER BY order_index ASC').all();
    const parsedSlides = slides.map(s => ({
      ...s,
      options: s.options_json ? JSON.parse(s.options_json) : []
    }));

    const exportData = {
      export_version: '1.5.7',
      exported_at: new Date().toISOString(),
      tour_name: 'Familienausflug Rallye',
      total_slides: parsedSlides.length,
      slides: parsedSlides
    };

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="rallye_backup_${Date.now()}.json"`);
    res.json(exportData);
  } catch (err) {
    console.error('Tour Export Fehler:', err);
    res.status(500).json({ error: 'Fehler beim Exportieren der Tour' });
  }
});

// 📤 Admin: Import Full Tour from JSON (Wiederherstellung)
app.post('/api/admin/tour/import', (req, res) => {
  try {
    const { tour_data } = req.body;
    if (!tour_data || !Array.isArray(tour_data.slides)) {
      return res.status(400).json({ error: 'Ungültiges Tour-JSON Format' });
    }

    // Erstelle vor dem Import ein automatisches DB-Backup
    createAutomaticBackup();

    const insertSlide = db.prepare(`
      INSERT INTO slides (
        id, tour_id, order_index, type, title, description,
        location_name, meeting_time, media_url, audio_url, media_type,
        question, options_json, correct_option_index, target_value,
        tolerance, scale_factor, max_points, countdown_seconds, admin_notes,
        latitude, longitude, created_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, datetime('now')
      )
    `);

    db.transaction(() => {
      // Lösche vorherige Folien
      db.prepare('DELETE FROM quiz_submissions').run();
      db.prepare('DELETE FROM slides').run();

      tour_data.slides.forEach((s, idx) => {
        const slideId = s.id || uuidv4();
        const optionsJson = s.options ? JSON.stringify(s.options) : (s.options_json || null);
        insertSlide.run(
          slideId,
          s.tour_id || 'default',
          idx,
          s.type || 'info',
          s.title || `Station ${idx + 1}`,
          s.description || '',
          s.location_name || null,
          s.meeting_time || null,
          s.media_url || null,
          s.audio_url || null,
          s.media_type || 'image',
          s.question || null,
          optionsJson,
          s.correct_option_index !== undefined ? s.correct_option_index : null,
          s.target_value !== undefined ? s.target_value : null,
          s.tolerance !== undefined ? s.tolerance : 10,
          s.scale_factor !== undefined ? s.scale_factor : 100,
          s.max_points !== undefined ? s.max_points : 100,
          s.countdown_seconds !== undefined ? s.countdown_seconds : 20,
          s.admin_notes || null,
          s.latitude !== undefined ? s.latitude : null,
          s.longitude !== undefined ? s.longitude : null
        );
      });

      // App-State auf Slide 0 zurücksetzen
      const first = db.prepare('SELECT id FROM slides ORDER BY order_index ASC LIMIT 1').get();
      db.prepare(`
        UPDATE app_state SET 
          current_slide_id = ?,
          current_slide_index = 0,
          phase = 1,
          timer_status = 'stopped',
          timer_start = 0,
          updated_at = datetime('now')
        WHERE id = 1
      `).run(first ? first.id : null);
    })();

    createAutomaticBackup();
    bumpContentVersion();
    broadcast({ type: 'content_updated' });
    broadcastState();

    res.json({ success: true, count: tour_data.slides.length });
  } catch (err) {
    console.error('Tour Import Fehler:', err);
    res.status(500).json({ error: 'Fehler beim Importieren der Tour' });
  }
});

// Admin: Upload Media / Files
app.post('/api/admin/upload', (req, res) => {
  try {
    const { filename, filedata } = req.body;
    if (!filedata) {
      return res.status(400).json({ error: 'Keine Dateidaten empfangen' });
    }

    const uploadsDir = path.join(__dirname, 'public', 'uploads');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    let buffer;
    let ext = 'bin';

    // Parse data URL prefix (e.g. data:image/png;base64,....)
    const matches = filedata.match(/^data:([A-Za-z-+\/0-9.]+);base64,(.+)$/);
    if (matches && matches.length === 3) {
      const mime = matches[1].toLowerCase();
      buffer = Buffer.from(matches[2], 'base64');
      
      if (mime.includes('image/jpeg') || mime.includes('image/jpg')) ext = 'jpg';
      else if (mime.includes('image/png')) ext = 'png';
      else if (mime.includes('image/gif')) ext = 'gif';
      else if (mime.includes('image/webp')) ext = 'webp';
      else if (mime.includes('image/svg')) ext = 'svg';
      else if (mime.includes('audio/mpeg') || mime.includes('audio/mp3')) ext = 'mp3';
      else if (mime.includes('audio/wav')) ext = 'wav';
      else if (mime.includes('audio/ogg')) ext = 'ogg';
      else if (mime.includes('audio/m4a') || mime.includes('audio/mp4') || mime.includes('audio/aac')) ext = 'm4a';
      else if (mime.includes('video/mp4')) ext = 'mp4';
      else if (mime.includes('video/webm')) ext = 'webm';
    } else {
      buffer = Buffer.from(filedata, 'base64');
    }

    if (filename && filename.includes('.')) {
      const originalExt = filename.split('.').pop().toLowerCase();
      if (originalExt && originalExt.length <= 5) {
        ext = originalExt;
      }
    }

    const safeName = `${Date.now()}-${uuidv4().substring(0, 8)}.${ext}`;
    const filePath = path.join(uploadsDir, safeName);

    fs.writeFileSync(filePath, buffer);

    res.json({
      success: true,
      url: `/uploads/${safeName}`
    });
  } catch (err) {
    console.error('Upload Error:', err);
    res.status(500).json({ error: 'Fehler beim Speichern der Datei: ' + err.message });
  }
});

// Fallback to index.html for SPA
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ==========================================
// WEBSOCKET HANDLER
// ==========================================

wss.on('connection', (ws, req) => {
  wsClients.set(ws, { userId: null, role: 'player' });

  // Send initial full state immediately
  ws.send(JSON.stringify({
    type: 'init_state',
    state: getFullAppState()
  }));

  ws.on('message', (messageRaw) => {
    try {
      const data = JSON.parse(messageRaw);
      const client = wsClients.get(ws) || {};

      switch (data.type) {
        case 'identify':
        case 'heartbeat': {
          if (data.userId) {
            client.userId = data.userId;
            client.role = data.role || 'player';
            wsClients.set(ws, client);

            // Update user last seen
            db.prepare("UPDATE users SET last_seen = datetime('now') WHERE id = ?").run(data.userId);
          }

          // Reply with heartbeat ack and fresh state
          ws.send(JSON.stringify({
            type: 'heartbeat_ack',
            timestamp: Date.now(),
            state: getFullAppState(client.userId)
          }));
          break;
        }

        case 'request_state': {
          ws.send(JSON.stringify({
            type: 'state_update',
            state: getFullAppState(client.userId)
          }));
          break;
        }

        default:
          break;
      }
    } catch (err) {
      console.error('WS parse error:', err);
    }
  });

  ws.on('close', () => {
    wsClients.delete(ws);
  });
});

// Periodic heartbeat broadcast every 15s to keep connections alive
setInterval(() => {
  for (const clientWs of wsClients.keys()) {
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.ping();
    }
  }
}, 15000);

// Start HTTP & WS Server
server.listen(PORT, () => {
  console.log(`🚀 Familienausflug-Rallye Server läuft auf http://localhost:${PORT}`);
  console.log(`📱 WebSockets aktiv auf ws://localhost:${PORT}/ws`);
});
