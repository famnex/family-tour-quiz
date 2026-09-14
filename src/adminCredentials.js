const fs = require('fs');
const path = require('path');
const { randomBytes, scryptSync, timingSafeEqual, createHash } = require('crypto');

module.exports = function adminCredentials(db) {
  db.exec('CREATE TABLE IF NOT EXISTS admin_credentials (id INTEGER PRIMARY KEY CHECK(id = 1), password_hash TEXT NOT NULL, recovery_hash TEXT)');
  const recoveryFile = path.join(path.dirname(db.name), 'admin-recovery-code.txt');
  const hash = password => {
    const salt = randomBytes(16).toString('hex');
    return salt + ':' + scryptSync(password, salt, 64).toString('hex');
  };
  const digest = code => createHash('sha256').update(code).digest('hex');
  const row = () => db.prepare('SELECT * FROM admin_credentials WHERE id = 1').get();
  if (!row()) {
    db.prepare('INSERT INTO admin_credentials (id, password_hash) VALUES (1, ?)')
      .run(hash(process.env.ADMIN_PASSWORD || randomBytes(32).toString('hex')));
  }
  function issueRecovery() {
    const code = randomBytes(32).toString('hex');
    const temporary = recoveryFile + '.tmp';
    fs.writeFileSync(temporary, code + '\n', { mode: 0o600 });
    fs.chmodSync(temporary, 0o600);
    fs.renameSync(temporary, recoveryFile);
    db.prepare('UPDATE admin_credentials SET recovery_hash = ? WHERE id = 1').run(digest(code));
  }
  let currentCode = '';
  try { currentCode = fs.readFileSync(recoveryFile, 'utf8').trim(); } catch {}
  if (!currentCode || digest(currentCode) !== row().recovery_hash) issueRecovery();
  return {
    verify(password) {
      if (typeof password !== 'string' || password.length > 256) return false;
      const [salt, stored] = row().password_hash.split(':');
      return timingSafeEqual(scryptSync(password, salt, 64), Buffer.from(stored, 'hex'));
    },
    reset(code, password) {
      if (typeof code !== 'string' || code.length !== 64 || !row().recovery_hash) return false;
      if (!timingSafeEqual(Buffer.from(digest(code), 'hex'), Buffer.from(row().recovery_hash, 'hex'))) return false;
      const nextHash = hash(password);
      db.transaction(() => {
        db.prepare('UPDATE admin_credentials SET password_hash = ?, recovery_hash = NULL WHERE id = 1').run(nextHash);
        db.prepare('DELETE FROM sessions WHERE admin = 1').run();
      })();
      // A consumed code stays invalid even if creating its replacement fails.
      try { issueRecovery(); } catch { console.error('Wiederherstellungscode konnte nicht erneuert werden. Server neu starten und Dateirechte prüfen.'); }
      return true;
    }
  };
};
