/**
 * Cron job per notifiche promemoria
 * ✅ FIX: Rispetta l'ora configurata dall'utente per ogni promemoria
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

// ============================================================================
// FUNZIONI HELPER
// ============================================================================

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

/**
 * ✅ FIX BUG #2: Controlla SIA la frequenza GIORNI SIA l'ORA configurata
 * 
 * Un promemoria va inviato se:
 * 1. Sono passati >= frequenzaGiorni dall'ultima notifica
 * 2. L'ora attuale è entro una finestra di ±30 min dall'ora configurata
 * 3. NON è già stato inviato oggi (controlla ultimaNotifica)
 */
function shouldSendReminder(promemoria: PromemoriaDoc, now: Date): boolean {
  // ✅ Controllo 1: Frequenza giorni
  if (promemoria.ultimaNotifica) {
    const ultimaNotifica = promemoria.ultimaNotifica.toDate();
    const giorniTrascorsi = (now.getTime() - ultimaNotifica.getTime()) / (1000 * 60 * 60 * 24);

    if (giorniTrascorsi < promemoria.frequenzaGiorni) {
      // Troppo presto, non sono ancora passati abbastanza giorni
      return false;
    }

    // Se è lo stesso giorno dell'ultima notifica, non inviare di nuovo
    const lastNotificaDay = new Date(ultimaNotifica);
    const today = new Date(now);
    if (
      lastNotificaDay.getFullYear() === today.getFullYear() &&
      lastNotificaDay.getMonth() === today.getMonth() &&
      lastNotificaDay.getDate() === today.getDate()
    ) {
      // Già inviato oggi
      return false;
    }
  }

  // ✅ Controllo 2: Ora configurata (finestra ±30 minuti)
  const reminderHour = promemoria.ora?.hour ?? 8; // Default 8:00 se mancante
  const reminderMinute = promemoria.ora?.minute ?? 0;

  const nowHour = now.getHours();
  const nowMinute = now.getMinutes();

  // Converti tutto in minuti per confronto semplice
  const reminderTotalMinutes = reminderHour * 60 + reminderMinute;
  const nowTotalMinutes = nowHour * 60 + nowMinute;

  // Finestra di tolleranza: 30 minuti prima o dopo
  const toleranceMinutes = 30;
  const diffMinutes = Math.abs(nowTotalMinutes - reminderTotalMinutes);

  // Gestisce il caso mezzanotte (es: reminder alle 00:10, ora attuale 23:50)
  const isWithinWindow = diffMinutes <= toleranceMinutes ||
    (1440 - diffMinutes) <= toleranceMinutes; // 1440 = minuti in un giorno

  if (!isWithinWindow) {
    // Non è ancora l'ora giusta
    return false;
  }

  // ✅ Entrambi i criteri soddisfatti
  return true;
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
      .where(admin.firestore.FieldPath.documentId(), '==', promemoriaId)
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
   * ✅ FIX: Questo metodo viene chiamato OGNI ORA (non solo alle 8:00)
   * e invia solo i promemoria la cui ora configurata corrisponde all'ora attuale.
   */
  async checkAndSendReminders(): Promise<void> {
    const db = getFirestore();
    const now = new Date();
    console.log(`🔍 Controllo promemoria attivi (ora: ${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')})...`);

    const promemoriaList = await getAllActiveReminders(db);

    console.log(`📋 Trovati ${promemoriaList.length} promemoria attivi`);

    let sentCount = 0;
    let skippedCount = 0;

    for (const promemoria of promemoriaList) {
      try {
        if (shouldSendReminder(promemoria, now)) {
          console.log(`✅ Promemoria "${promemoria.nome}" pronto per essere inviato (ora configurata: ${promemoria.ora?.hour}:${String(promemoria.ora?.minute || 0).padStart(2, '0')})`);

          const token = await getUserFCMToken(db, promemoria.userId);

          if (!token) {
            console.warn(`⚠️  Nessun token FCM per utente ${promemoria.userId}`);
            skippedCount++;
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
          sentCount++;
        } else {
          skippedCount++;
        }
      } catch (error) {
        console.error(`❌ Errore elaborazione promemoria ${promemoria.id}:`, error);
      }
    }

    console.log(`📊 Risultati controllo: ${sentCount} inviati, ${skippedCount} saltati`);
  }
}
