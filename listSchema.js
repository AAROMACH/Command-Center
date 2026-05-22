const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

function inferType(value) {
  if (value === null) return 'null';
  if (value instanceof admin.firestore.Timestamp) return 'Timestamp';
  if (value instanceof admin.firestore.DocumentReference) return 'Reference';
  if (Array.isArray(value)) {
    const inner = value.length > 0 ? inferType(value[0]) : 'unknown';
    return `Array<${inner}>`;
  }
  return typeof value;
}

async function inspectCollection(colRef, indent = '') {
  const snapshot = await colRef.limit(3).get();
  if (snapshot.empty) {
    console.log(`${indent}  (empty collection)`);
    return;
  }

  // Merge fields across up to 3 docs for better coverage
  const mergedFields = {};
  snapshot.forEach(doc => {
    const data = doc.data();
    for (const [key, value] of Object.entries(data)) {
      if (!mergedFields[key]) {
        mergedFields[key] = inferType(value);
      }
    }
  });

  for (const [field, type] of Object.entries(mergedFields)) {
    console.log(`${indent}  ${field}: ${type}`);
  }

  // Go one level deeper into subcollections of the first doc
  const firstDoc = snapshot.docs[0];
  const subcollections = await firstDoc.ref.listCollections();
  for (const subCol of subcollections) {
    console.log(`\n${indent}  └── subcollection: ${subCol.id}`);
    await inspectCollection(subCol, indent + '    ');
  }
}

async function listSchema() {
  console.log('=== Firestore Schema ===\n');
  const collections = await db.listCollections();

  for (const col of collections) {
    console.log(`Collection: ${col.id}`);
    await inspectCollection(col, '');
    console.log('');
  }

  console.log('=== Done ===');
  process.exit(0);
}

listSchema().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
