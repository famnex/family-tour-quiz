const webpush = require('web-push');
module.exports = function createPush(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS push_keys (id INTEGER PRIMARY KEY CHECK(id=1), public_key TEXT, private_key TEXT);
    CREATE TABLE IF NOT EXISTS push_subscriptions (endpoint TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, subscription TEXT NOT NULL);`);
  let keys = db.prepare('SELECT * FROM push_keys WHERE id=1').get();
  if (!keys) {
    const pair = webpush.generateVAPIDKeys();
    db.prepare('INSERT INTO push_keys VALUES (1,?,?)').run(pair.publicKey, pair.privateKey);
    keys = db.prepare('SELECT * FROM push_keys WHERE id=1').get();
  }
  const vapidDetails = { subject: process.env.VAPID_SUBJECT || 'https://github.com/famnex/family-tour-quiz', publicKey: keys.public_key, privateKey: keys.private_key };
  function valid(s) {
    try {
      const u = new URL(s.endpoint);
      const h = u.hostname;
      const allowed = h === 'fcm.googleapis.com' || h === 'updates.push.services.mozilla.com' || h.endsWith('.push.apple.com') || h.endsWith('.notify.windows.com');
      return allowed && u.protocol === 'https:' && !u.username && !u.password && !u.port && s.endpoint.length <= 2048 &&
        /^[\w-]+$/.test(s.keys.p256dh) && Buffer.from(s.keys.p256dh,'base64url').length === 65 &&
        /^[\w-]+$/.test(s.keys.auth) && Buffer.from(s.keys.auth,'base64url').length === 16;
    } catch { return false; }
  }
  return {
    publicKey: keys.public_key,
    save(userId, subscription) {
      if (!valid(subscription)) return false;
      const clean = {endpoint: subscription.endpoint, keys: {p256dh: subscription.keys.p256dh, auth: subscription.keys.auth}};
      if (!db.prepare('SELECT 1 FROM push_subscriptions WHERE endpoint=?').get(clean.endpoint) && db.prepare('SELECT COUNT(*) AS n FROM push_subscriptions WHERE user_id=?').get(userId).n >= 10) return false;
      db.prepare('INSERT INTO push_subscriptions VALUES (?,?,?) ON CONFLICT(endpoint) DO UPDATE SET user_id=excluded.user_id, subscription=excluded.subscription').run(clean.endpoint,userId,JSON.stringify(clean));
      return true;
    },
    remove(userId, endpoint) { db.prepare('DELETE FROM push_subscriptions WHERE user_id=? AND endpoint=?').run(userId, endpoint); },
    async send(message, id) {
      const subscriptions = db.prepare('SELECT * FROM push_subscriptions').all();
      const result = { total: subscriptions.length, accepted: 0, failed: 0 };
      for (let i=0;i<subscriptions.length;i+=5) {
        await Promise.all(subscriptions.slice(i,i+5).map(async s => {
          try {
            await webpush.sendNotification(JSON.parse(s.subscription), JSON.stringify({message,id}), {vapidDetails, TTL:300, urgency:'high', timeout:5000});
            result.accepted++;
          } catch(e) {
            result.failed++;
            if (e.statusCode === 404 || e.statusCode === 410) db.prepare('DELETE FROM push_subscriptions WHERE endpoint=?').run(s.endpoint);
          }
        }));
      }
      return result;
    }
  };
};
