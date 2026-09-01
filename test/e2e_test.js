const assert = require('assert');
const { spawn } = require('child_process');
const http = require('http');
const { WebSocket } = require('ws');

function request(url, options = {}, data = null) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const reqOptions = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port,
      path: parsedUrl.pathname + parsedUrl.search,
      method: options.method || 'GET',
      headers: options.headers || {}
    };

    if (data) {
      if (!reqOptions.headers['Content-Type']) {
        reqOptions.headers['Content-Type'] = 'application/json';
      }
    }

    const req = http.request(reqOptions, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          resolve({ status: res.statusCode, data: parsed, headers: res.headers });
        } catch (e) {
          resolve({ status: res.statusCode, text: body, headers: res.headers });
        }
      });
    });

    req.on('error', reject);
    if (data) {
      req.write(typeof data === 'string' ? data : JSON.stringify(data));
    }
    req.end();
  });
}

async function runE2E() {
  console.log('🚀 Starte End-to-End Test für Server, REST APIs und WebSockets...');

  const path = require('path');
  const serverProcess = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, PORT: '3333' }
  });

  serverProcess.stdout.on('data', data => console.log(`[Server] ${data.toString().trim()}`));
  serverProcess.stderr.on('data', data => console.error(`[Server Err] ${data.toString().trim()}`));

  // Wait for server to output ready
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Server start timed out')), 5000);
    serverProcess.stdout.on('data', data => {
      if (data.toString().includes('Server läuft')) {
        clearTimeout(timeout);
        setTimeout(resolve, 300);
      }
    });
  });

  try {
    const baseUrl = 'http://localhost:3333';

    // 1. Check API Version
    console.log('1. Prüfe /api/version...');
    const verRes = await request(`${baseUrl}/api/version`);
    assert.strictEqual(verRes.status, 200);
    assert.ok(verRes.data.version);

    // 2. Player Login
    console.log('2. Teste Spieler-Login ohne Passwort...');
    const loginRes = await request(`${baseUrl}/api/auth/login`, { method: 'POST' }, {
      name: 'Max Mustermann',
      avatar_emoji: '🦁',
      avatar_color: '#3b82f6',
      role: 'player'
    });
    assert.strictEqual(loginRes.status, 200);
    const token = loginRes.data.token;
    assert.ok(token);
    assert.strictEqual(loginRes.data.user.name, 'Max Mustermann');

    // 3. Admin Password Authentication Test
    console.log('3. Teste Admin-Passwort Authentifizierung (casaxx)...');
    const wrongPwRes = await request(`${baseUrl}/api/admin/auth`, { method: 'POST' }, {
      password: 'falschesPasswort',
      userId: token
    });
    assert.strictEqual(wrongPwRes.status, 401, 'Falsches Passwort muss 401 liefern');

    const correctPwRes = await request(`${baseUrl}/api/admin/auth`, { method: 'POST' }, {
      password: 'casaxx',
      userId: token
    });
    assert.strictEqual(correctPwRes.status, 200, 'Korrektes Passwort casaxx muss 200 liefern');
    assert.strictEqual(correctPwRes.data.success, true);

    // 4. WebSocket Connection
    console.log('4. Teste Live WebSocket Verbindung...');
    const ws = new WebSocket('ws://localhost:3333/ws');
    let receivedInitState = false;

    ws.on('message', (msg) => {
      const parsed = JSON.parse(msg);
      if (parsed.type === 'init_state' || parsed.type === 'state_update') {
        receivedInitState = true;
      }
    });

    await new Promise(resolve => {
      ws.on('open', () => {
        ws.send(JSON.stringify({ type: 'identify', userId: token, role: 'player' }));
        setTimeout(resolve, 500);
      });
    });
    assert.ok(receivedInitState, 'Initial State muss über WebSocket empfangen werden');

    // 5. Admin sets Quiz Slide & Steps through 5 Phases
    console.log('5. Teste Phasenablauf (Phase 1 bis 5)...');
    
    // Reset rallye to start clean
    await request(`${baseUrl}/api/admin/reset-rallye`, { method: 'POST' });

    // Switch to slide 2 (multiple choice)
    const setSlideRes = await request(`${baseUrl}/api/admin/set-slide`, { method: 'POST' }, { slide_index: 1 });
    assert.strictEqual(setSlideRes.status, 200);
    assert.strictEqual(setSlideRes.data.phase, 1);

    // Phase 2: Show options
    const p2Res = await request(`${baseUrl}/api/admin/set-phase`, { method: 'POST' }, { phase: 2 });
    assert.strictEqual(p2Res.data.phase, 2);

    // Phase 3: Start timer & voting
    const timerRes = await request(`${baseUrl}/api/admin/timer/start`, { method: 'POST' }, { duration: 25 });
    assert.strictEqual(timerRes.data.status, 'running');

    // Submit answer for player Max
    const subRes = await request(`${baseUrl}/api/submissions`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` }
    }, {
      slide_id: setSlideRes.data.current_slide.id,
      selected_option: 1, // correct answer
      answer_text: '15. Jahrhundert (1485)'
    });
    assert.strictEqual(subRes.status, 200);
    assert.strictEqual(subRes.data.success, true);

    // Phase 4: Resolution & Points
    const p4Res = await request(`${baseUrl}/api/admin/set-phase`, { method: 'POST' }, { phase: 4 });
    assert.strictEqual(p4Res.data.phase, 4);

    // Check state after phase 4
    const stateRes = await request(`${baseUrl}/api/state`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    assert.strictEqual(stateRes.data.user_submission.is_correct, 1);
    assert.strictEqual(stateRes.data.user_submission.final_points, 100);

    // Phase 5: Leaderboard
    const p5Res = await request(`${baseUrl}/api/admin/set-phase`, { method: 'POST' }, { phase: 5 });
    assert.strictEqual(p5Res.data.phase, 5);

    // 6. Admin Push Announcement
    console.log('6. Teste Eilmeldung Push-Banner...');
    const annRes = await request(`${baseUrl}/api/admin/announcement`, { method: 'POST' }, {
      message: 'Achtung: Treffen in 5 Minuten am Brunnen!'
    });
    assert.strictEqual(annRes.data.success, true);

    // 7. Admin Slide CRUD with GPS Coordinates
    console.log('7. Teste Slide Erstellung & Bearbeitung mit GPS-Koordinaten...');
    const createSlideRes = await request(`${baseUrl}/api/admin/slides`, { method: 'POST' }, {
      type: 'info',
      title: 'Neuer GPS Testpunkt',
      description: 'Teststation fuer Koordinaten',
      latitude: 50.9801,
      longitude: 11.0345
    });
    assert.strictEqual(createSlideRes.status, 200);
    assert.strictEqual(createSlideRes.data.slide.latitude, 50.9801);
    assert.strictEqual(createSlideRes.data.slide.longitude, 11.0345);

    const updateSlideRes = await request(`${baseUrl}/api/admin/slides/${createSlideRes.data.slide.id}`, { method: 'PUT' }, {
      type: 'transit',
      title: 'Aktualisierter GPS Testpunkt',
      latitude: 50.9815,
      longitude: 11.0360
    });
    assert.strictEqual(updateSlideRes.status, 200);
    assert.strictEqual(updateSlideRes.data.slide.latitude, 50.9815);
    assert.strictEqual(updateSlideRes.data.slide.longitude, 11.0360);

    // 8. Test Media Upload (Bug 3 Fix verification)
    console.log('8. Teste Medien-Upload API (/api/admin/upload)...');
    const mockBase64Image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const uploadRes = await request(`${baseUrl}/api/admin/upload`, { method: 'POST' }, {
      filename: 'test_image.png',
      filedata: mockBase64Image
    });
    assert.strictEqual(uploadRes.status, 200);
    assert.strictEqual(uploadRes.data.success, true);
    assert.ok(uploadRes.data.url.startsWith('/uploads/'));

    // 9. Test Pedestrian Routing Proxy (/api/route)
    console.log('9. Teste Fußgänger-Routing API (/api/route)...');
    const routeRes = await request(`${baseUrl}/api/route?coords=11.0328,50.9787;11.0305,50.9802`);
    assert.strictEqual(routeRes.status, 200);
    assert.strictEqual(routeRes.data.code, 'Ok');
    assert.ok(routeRes.data.routes && routeRes.data.routes[0]);
    assert.ok(routeRes.data.routes[0].geometry.coordinates.length > 0);

    // Check participants_status in state
    const stateCheck = await request(`${baseUrl}/api/state`);
    assert.ok(Array.isArray(stateCheck.data.participants_status), 'participants_status muss ein Array sein');
    assert.ok(stateCheck.data.participants_status.length >= 1, 'Mindestens 1 Spieler in participants_status');

    ws.close();
    console.log('✅ ALLE END-TO-END TESTS ERFOLGREICH BESTANDEN!');
  } finally {
    serverProcess.kill();
  }
}

runE2E().catch(err => {
  console.error('❌ E2E Fehler:', err);
  process.exit(1);
});
