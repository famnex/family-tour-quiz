const assert = require('assert/strict');
const Database = require('better-sqlite3');
const crypto = require('crypto');
const webpush = require('web-push');
const vm = require('vm');
const fs = require('fs');
(async () => {
  const db = new Database(':memory:');
  db.pragma('foreign_keys=ON');
  db.exec("CREATE TABLE users(id TEXT PRIMARY KEY); INSERT INTO users VALUES ('tester');");
  const factory = require('../src/pushNotifications');
  const push = factory(db);
  assert.equal(factory(db).publicKey,push.publicKey);
  const ecdh = crypto.createECDH('prime256v1');ecdh.generateKeys();
  const sub = {endpoint:'https://fcm.googleapis.com/fcm/send/test-only', keys:{p256dh:ecdh.getPublicKey().toString('base64url'),auth:crypto.randomBytes(16).toString('base64url')}};
  for (const endpoint of ['http://localhost/push','https://127.0.0.1/push','https://fcm.googleapis.com.evil.test/x','https://user@fcm.googleapis.com/x']) assert.equal(push.save('tester',{...sub,endpoint}),false);
  assert.equal(push.save('tester',sub),true);
  assert.equal(push.save('tester',sub),true);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM push_subscriptions').get().n,1);
  const original = webpush.sendNotification;
  try {
    webpush.sendNotification = async (subscription,payload,options) => {
      assert.equal(subscription.endpoint,sub.endpoint);assert.equal(JSON.parse(payload).message,'Treffpunkt');assert.equal(options.TTL,300);
    };
    assert.deepEqual(await push.send('Treffpunkt','test-id'),{total:1,accepted:1,failed:0});
    webpush.sendNotification = async () => {throw {statusCode:410}};
    assert.equal((await push.send('Treffpunkt','test-id')).failed,1);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM push_subscriptions').get().n,0);
    push.save('tester',sub);db.exec("DELETE FROM users WHERE id='tester'");
    assert.equal(db.prepare('SELECT COUNT(*) n FROM push_subscriptions').get().n,0);
  } finally {webpush.sendNotification=original;db.close();}
  const handlers = {};let shown,opened;
  const self = {registration:{scope:'https://example.test/family/',showNotification:async(title,options)=>{shown={title,options}}},addEventListener:(type,fn)=>{handlers[type]=fn},clients:{matchAll:async()=>[],openWindow:async url=>{opened=url}}};
  vm.runInNewContext(fs.readFileSync(require('path').join(__dirname,'../public/sw.js'),'utf8'),{self,URL});
  let done;
  handlers.push({data:{json:()=>({message:'Treffpunkt',id:'abc'})},waitUntil:p=>{done=p}});await done;
  assert.equal(shown.options.body,'Treffpunkt');assert.equal(shown.options.silent,false);
  handlers.notificationclick({notification:{close(){}},waitUntil:p=>{done=p}});await done;
  assert.equal(opened,'https://example.test/family/');
  console.log('PASS push validation, subscription persistence, send/expiry cleanup, reset cascade and service worker notification/click');
})().catch(e=>{console.error(e);process.exitCode=1});
