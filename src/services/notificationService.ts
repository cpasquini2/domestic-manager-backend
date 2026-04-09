/**
 * Service per invio notifiche FCM
 */

import { getMessaging, getFirestore } from '../config/firebase';
import admin from 'firebase-admin';

export interface NotificationPayload {
  userId?: string;
  token?: string;
  title: string;
  body: string;
  data?: Record<string, string>;
}

export interface BroadcastPayload {
  title: string;
  body: string;
  data?: Record<string, string>;
}

// ============================================================================
// FUNZIONI HELPER (standalone, non richiedono inizializzazione anticipata)
// ============================================================================

async function getUserToken(db: admin.firestore.Firestore, userId: string): Promise<string | null> {
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

async function getAllTokens(db: admin.firestore.Firestore): Promise<string[]> {
  const snapshot = await db.collection('fcm_tokens').get();

  const tokens = new Set<string>();
  snapshot.docs.forEach((doc) => {
    tokens.add(doc.data().token);
  });

  return Array.from(tokens);
}

async function removeInvalidToken(db: admin.firestore.Firestore, token: string): Promise<void> {
  const snapshot = await db
    .collection('fcm_tokens')
    .where('token', '==', token)
    .get();

  if (snapshot.empty) {
    return;
  }

  const batch = db.batch();
  snapshot.docs.forEach((doc) => {
    batch.delete(doc.ref);
  });
  await batch.commit();

  console.log(`🗑️  Token invalido rimosso: ${token.substring(0, 20)}...`);
}

// ============================================================================
// NOTIFICATION SERVICE CLASS
// ============================================================================

export class NotificationService {
  /**
   * Invia notifica a un utente specifico
   */
  async sendNotification(payload: NotificationPayload): Promise<any> {
    const messaging = getMessaging();
    const db = getFirestore();
    let token: string | undefined = payload.token || undefined;

    // Se non c'è il token, ottienilo dal database
    if (!token && payload.userId) {
      const dbToken = await getUserToken(db, payload.userId);
      token = dbToken || undefined;
    }

    if (!token) {
      console.warn(`⚠️  Nessun token FCM trovato per utente ${payload.userId}`);
      return { success: false, reason: 'token_not_found' };
    }

    const message: admin.messaging.Message = {
      token,
      notification: {
        title: payload.title,
        body: payload.body,
      },
      data: payload.data || {},
      android: {
        priority: 'high',
        notification: {
          channelId: 'fcm_default_channel',
          defaultSound: true,
          defaultVibrateTimings: true,
        },
      },
      apns: {
        payload: {
          aps: {
            sound: 'default',
            badge: 1,
          },
        },
      },
    };

    try {
      const response = await messaging.send(message);
      console.log(`✅ Notifica inviata: ${response}`);
      return { success: true, messageId: response };
    } catch (error: any) {
      // Se token invalido, rimuovilo dal database
      if (error.code === 'messaging/registration-token-not-registered') {
        console.warn(`❌ Token non più valido, rimozione: ${token}`);
        await removeInvalidToken(db, token);
      }

      console.error('❌ Errore invio notifica:', error);
      throw error;
    }
  }

  /**
   * Invia notifica a tutti gli utenti
   */
  async broadcastNotification(payload: BroadcastPayload): Promise<{ successCount: number; failureCount: number }> {
    const db = getFirestore();
    const messaging = getMessaging();
    const tokens = await getAllTokens(db);

    if (tokens.length === 0) {
      console.warn('⚠️  Nessun token FCM disponibile per broadcast');
      return { successCount: 0, failureCount: 0 };
    }

    console.log(`📢 Broadcast notifica a ${tokens.length} utenti`);

    let successCount = 0;
    let failureCount = 0;

    // Invia notifiche in parallelo (max 500 alla volta - limite FCM)
    const batchSize = 500;
    for (let i = 0; i < tokens.length; i += batchSize) {
      const batch = tokens.slice(i, i + batchSize);

      const results = await Promise.allSettled(
        batch.map(async (token) => {
          const message: admin.messaging.Message = {
            token,
            notification: {
              title: payload.title,
              body: payload.body,
            },
            data: payload.data || {},
            android: {
              priority: 'high',
              notification: {
                channelId: 'fcm_default_channel',
                defaultSound: true,
              },
            },
          };

          try {
            await messaging.send(message);
            return true;
          } catch (error: any) {
            if (error.code === 'messaging/registration-token-not-registered') {
              await removeInvalidToken(db, token);
            }
            return false;
          }
        })
      );

      results.forEach((result) => {
        if (result.status === 'fulfilled' && result.value) {
          successCount++;
        } else {
          failureCount++;
        }
      });

      console.log(`📊 Progress: ${i + batch.length}/${tokens.length}`);

      // Delay per evitare rate limiting
      if (i + batchSize < tokens.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    console.log(`✅ Broadcast completato: ${successCount} successi, ${failureCount} fallimenti`);
    return { successCount, failureCount };
  }
}
