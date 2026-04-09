/**
 * Cron job per notifiche promemoria
 */

import { getFirestore } from '../config/firebase';
import { NotificationService } from '../services/notificationService';
import admin from 'firebase-admin';

interface PromemoriaDoc {
  id: string;
  userId: string;
  nome: string;
  ora: { hour: number; minute: number };
  frequenzaGiorni: number;
  attivo: boolean;
  ultimaNotifica?: admin.firestore.Timestamp;
}

// Funzioni helper standalone
async function getAllActiveReminders(db: admin.firestore.Firestore): Promise<PromemoriaDoc[]> {
  try {
    const snapshot = await db.collectionGroup('promemoria')
      .where('attivo', '==', true)
      .get();

    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    })) as PromemoriaDoc[];
  } catch (error) {
    console.error('Errore query promemoria:', error);
    return [];
  }
}

function shouldSendReminder(promemoria: PromemoriaDoc, now: Date): boolean {
  if (!promemoria.ultimaNotifica) {
    return true;
  }

  const ultimaNotifica = promemoria.ultimaNotifica.toDate();
  const giorniTrascorsi = (now.getTime() - ultimaNotifica.getTime()) / (1000 * 60 * 60 * 24);

  return giorniTrascorsi >= promemoria.frequenzaGiorni;
}

async function getUserFCMToken(db: admin.firestore.Firestore, userId: string): Promise<string | null> {
  try {
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
  } catch (error) {
    console.error(`Errore recupero token per utente ${userId}:`, error);
    return null;
  }
}

async function updateLastNotification(db: admin.firestore.Firestore, promemoriaId: string): Promise<void> {
  try {
    const snapshot = await db.collectionGroup('promemoria')
      .where('__name__', '==', promemoriaId)
      .limit(1)
      .get();

    if (!snapshot.empty) {
      await snapshot.docs[0].ref.update({
        ultimaNotifica: new Date(),
      });
    }
  } catch (error) {
    console.error(`Errore aggiornamento promemoria ${promemoriaId}:`, error);
  }
}

// ============================================================================
// REMINDER SCHEDULER CLASS
// ============================================================================

export class ReminderScheduler {
  private notificationService = new NotificationService();

  /**
   * Controlla e invia notifiche promemoria
   */
  async checkAndSendReminders(): Promise<void> {
    const db = getFirestore();
    const now = new Date();
    console.log(`🔍 Controllo promemoria attivi...`);

    const promemoriaList = await getAllActiveReminders(db);

    console.log(`📋 Trovati ${promemoriaList.length} promemoria attivi`);

    for (const promemoria of promemoriaList) {
      try {
        if (shouldSendReminder(promemoria, now)) {
          console.log(`✅ Promemoria "${promemoria.nome}" pronto per essere inviato`);

          const token = await getUserFCMToken(db, promemoria.userId);

          if (!token) {
            console.warn(`⚠️  Nessun token FCM per utente ${promemoria.userId}`);
            continue;
          }

          await this.notificationService.sendNotification({
            userId: promemoria.userId,
            token,
            title: `Promemoria: ${promemoria.nome}`,
            body: 'È ora di controllare!',
            data: {
              type: 'promemoria',
              reminderId: promemoria.id,
              reminderName: promemoria.nome,
              screen: 'promemoria_detail',
            },
          });

          await updateLastNotification(db, promemoria.id);

          console.log(`✅ Notifica promemoria inviata: ${promemoria.nome}`);
        }
      } catch (error) {
        console.error(`❌ Errore elaborazione promemoria ${promemoria.id}:`, error);
      }
    }
  }
}
