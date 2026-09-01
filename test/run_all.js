const { spawnSync } = require('child_process');
const path = require('path');

console.log('🏁 Führe gesamte Test-Suite aus...\n');

const res1 = spawnSync(process.execPath, [path.join(__dirname, 'test_suite.js')], { stdio: 'inherit' });
if (res1.status !== 0) {
  process.exit(res1.status);
}

const res2 = spawnSync(process.execPath, [path.join(__dirname, 'e2e_test.js')], { stdio: 'inherit' });
if (res2.status !== 0) {
  process.exit(res2.status);
}

console.log('\n🌟 Alle Unit- & E2E-Tests erfolgreich abgeschlossen!');
