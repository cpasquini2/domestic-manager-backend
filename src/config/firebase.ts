/**
 * Configurazione Firebase Admin SDK
 */

import admin from 'firebase-admin';

let initialized = false;

export function initializeFirebase(): void {
  // Se già inizializzato, skip
  if (initialized) {
    return;
  }

  // Opzione 1: Service Account da variabile d'ambiente (JSON string)
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;

  if (serviceAccountJson) {
    // Parse JSON string
    const serviceAccount = JSON.parse(serviceAccountJson);
    
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
    
    console.log('✅ Firebase Admin inizializzato da JSON');
  } else {
    // Fallback: Application Default Credentials (per deploy su GCP/Railway)
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
    });
    
    console.log('✅ Firebase Admin inizializzato con ADC');
  }

  initialized = true;
}

export function getFirestore(): admin.firestore.Firestore {
  if (!initialized) {
    initializeFirebase();
  }
  return admin.firestore();
}

export function getMessaging(): admin.messaging.Messaging {
  if (!initialized) {
    initializeFirebase();
  }
  return admin.messaging();
}
