// import.js
const admin = require('firebase-admin');
const fs = require('fs');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function importUsers() {
  const data = JSON.parse(fs.readFileSync('./users.json', 'utf8'));
  const uids = Object.keys(data);
  console.log(`Importing ${uids.length} documents...`);

  for (const uid of uids) {
    await db.collection('users').doc(uid).set(data[uid]);
    console.log(`Imported ${uid}`);
  }

  console.log('Done');
}

importUsers().catch(console.error);