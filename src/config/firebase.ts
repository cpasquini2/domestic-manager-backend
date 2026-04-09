/**
 * Configurazione Firebase Admin SDK
 */

import admin from 'firebase-admin';

let app: admin.app.App | null = null;

export function initializeFirebase(): void {
  // Se già inizializzato, skip
  if (app) {
    console.log('ℹ️  Firebase Admin già inizializzato');
    return;
  }

  // Opzione 1: Service Account da variabile d'ambiente (JSON string)
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;
  
  // Opzione 2: Service Account da file
  const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;

  if (serviceAccountJson) {
    // Parse JSON string
    const serviceAccount = JSON.parse(serviceAccountJson);
    
    app = admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
    
    console.log('✅ Firebase Admin inizializzato da JSON');
  } else if (serviceAccountPath) {
    // Da file
    app = admin.initializeApp({
      credential: admin.credential.applicationDefault(),
    });
    
    console.log('✅ Firebase Admin inizializzato da file');
  } else {
    // Fallback: Application Default Credentials (per deploy su GCP)
    app = admin.initializeApp({
      credential: admin.credential.applicationDefault(),
    });
    
    console.log('✅ Firebase Admin inizializzato con ADC');
  }
}

export function getFirebaseApp(): admin.app.App {
  if (!app) {
    throw new Error('Firebase Admin non inizializzato. Chiama initializeFirebase() prima.');
  }
  return app;
}

export function getFirestore(): admin.firestore.Firestore {
  return admin.firestore();
}

export function getMessaging(): admin.messaging.Messaging {
  return admin.messaging();
}
