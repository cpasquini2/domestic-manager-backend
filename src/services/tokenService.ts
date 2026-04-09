/**
 * Service per gestione token FCM
 */

import { getFirestore } from '../config/firebase';
import admin from 'firebase-admin';

export class TokenService {
  /**
   * Salva o aggiorna token FCM di un utente
   */
  async saveToken(userId: string, token: string, platform: string): Promise<void> {
    const db = getFirestore();
    const now = admin.firestore.FieldValue.serverTimestamp();

    // Cerca token esistente
    const existingToken = await db
      .collection('fcm_tokens')
      .where('userId', '==', userId)
      .where('token', '==', token)
      .limit(1)
      .get();

    if (!existingToken.empty) {
      // Aggiorna timestamp
      const docId = existingToken.docs[0].id;
      await db.collection('fcm_tokens').doc(docId).update({
        updatedAt: now,
      });
      console.log(`✅ Token aggiornato per utente ${userId}`);
    } else {
      // Crea nuovo documento
      await db.collection('fcm_tokens').add({
        userId,
        token,
        platform,
        createdAt: now,
        updatedAt: now,
      });
      console.log(`✅ Token salvato per utente ${userId}`);
    }
  }

  /**
   * Rimuove token FCM di un utente
   */
  async removeToken(userId: string, token?: string): Promise<void> {
    const db = getFirestore();
    let query = db
      .collection('fcm_tokens')
      .where('userId', '==', userId);

    if (token) {
      query = query.where('token', '==', token);
    }

    const snapshot = await query.get();

    if (snapshot.empty) {
      console.log(`⚠️  Nessun token trovato per utente ${userId}`);
      return;
    }

    // Elimina tutti i token trovati
    const batch = db.batch();
    snapshot.docs.forEach((doc) => {
      batch.delete(doc.ref);
    });
    await batch.commit();

    console.log(`✅ Token rimosso per utente ${userId} (${snapshot.size} documenti)`);
  }

  /**
   * Ottieni tutti i token FCM di un utente
   */
  async getUserTokens(userId: string): Promise<Array<{ id: string; token: string; platform: string }>> {
    const db = getFirestore();
    const snapshot = await db
      .collection('fcm_tokens')
      .where('userId', '==', userId)
      .get();

    return snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as any;
  }

  /**
   * Ottieni un singolo token per notifica
   */
  async getLatestToken(userId: string): Promise<string | null> {
    const db = getFirestore();
    const snapshot = await db
      .collection('fcm_tokens')
      .where('userId', '==', userId)
      .orderBy('updatedAt', 'desc')
      .limit(1)
      .get();

    if (snapshot.empty) {
      return null;
    }

    return snapshot.docs[0].data().token;
  }

  /**
   * Ottieni tutti i token per broadcast
   */
  async getAllTokens(): Promise<string[]> {
    const db = getFirestore();
    const snapshot = await db
      .collection('fcm_tokens')
      .get();

    const tokens = new Set<string>();
    snapshot.docs.forEach((doc) => {
      tokens.add(doc.data().token);
    });

    return Array.from(tokens);
  }
}
