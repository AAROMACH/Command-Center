/**
 * Aaromach Command Center — Firestore Seed Script
 *
 * HOW TO RUN:
 *   1. Place this file in your project root as seed.ts
 *   2. Place firestore-schema.json in your project root
 *   3. Place your serviceAccountKey.json in your project root
 *   4. Run: npx tsx seed.ts
 */

import * as admin from "firebase-admin";
import { readFileSync } from "fs";
import path from "path";

// Load service account key
let serviceAccount: admin.ServiceAccount;
try {
  const raw = readFileSync(path.resolve("./serviceAccountKey.json"), "utf8");
  serviceAccount = JSON.parse(raw);
} catch (e) {
  console.error("❌ Could not find serviceAccountKey.json in your project root.");
  console.error("   Download it from Firebase Console → Project Settings → Service Accounts → Generate new private key");
  process.exit(1);
}

// Load schema
let schema: Record<string, any>;
try {
  const raw = readFileSync(path.resolve("./firestore-schema.json"), "utf8");
  schema = JSON.parse(raw);
} catch (e) {
  console.error("❌ Could not find firestore-schema.json in your project root.");
  process.exit(1);
}

// Init Firebase Admin
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

// Keys to skip — metadata only, not real Firestore fields
const SKIP_KEYS = ["__comments", "__subcollections"];

async function seedCollection(
  collectionPath: string,
  documents: Record<string, any>
) {
  for (const [docId, docData] of Object.entries(documents)) {
    // Pull out subcollections before writing the document
    const subcollections: Record<string, any> = docData.__subcollections || {};

    // Clean the doc — remove metadata keys
    const cleanDoc = Object.fromEntries(
      Object.entries(docData).filter(
        ([key]) => !SKIP_KEYS.includes(key) && key !== "__subcollections"
      )
    );

    // Write the document
    await db.collection(collectionPath).doc(docId).set(cleanDoc);
    console.log(`✅ ${collectionPath}/${docId}`);

    // Write any subcollections
    for (const [subColName, subDocs] of Object.entries(subcollections)) {
      const subColPath = `${collectionPath}/${docId}/${subColName}`;
      for (const [subDocId, subDocData] of Object.entries(
        subDocs as Record<string, any>
      )) {
        await db.collection(subColPath).doc(subDocId).set(subDocData);
        console.log(`   ✅ ${subColPath}/${subDocId}`);
      }
    }
  }
}

async function seed() {
  console.log("\n🚀 Starting Aaromach Firestore seed...\n");

  for (const [collectionName, documents] of Object.entries(schema)) {
    if (SKIP_KEYS.includes(collectionName)) continue;
    console.log(`\n📁 Seeding collection: ${collectionName}`);
    await seedCollection(collectionName, documents as Record<string, any>);
  }

  console.log("\n✅ Seed complete! Your Firestore database is populated.\n");
  process.exit(0);
}

seed().catch((err) => {
  console.error("❌ Seed failed:", err);
  process.exit(1);
});
