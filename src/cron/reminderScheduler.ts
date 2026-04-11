/**
 * Cron job per notifiche promemoria
 * ✅ ARCHITETTURA SEMPLIFICATA: Collection piatta /promemoria/{reminderId}
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

/**
 * ✅ FIX: Query su collection piatta /promemoria/{reminderId}
 * Non serve più collectionGroup, query diretta
 */
async function getAllActiveReminders(db: admin.firestore.Firestore): Promise<PromemoriaDoc[]> {
  try {
    const snapshot = await db.collection('promemoria')
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
 * ✅ FIX: Ottieni l'ora corrente nel timezone Europe/Rome
 * I server Railway girano su UTC, quindi new Date() restituisce UTC.
 * Dobbiamo convertire all'ora locale dell'utente.
 */
function getCurrentRomeTime(): { hour: number; minute: number } {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Rome',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  });
  const parts = formatter.formatToParts(now);
  const hour = parseInt(parts.find(p => p.type === 'hour')?.value || '0', 10);
  const minute = parseInt(parts.find(p => p.type === 'minute')?.value || '0', 10);
  return { hour, minute };
}

/**
 * ✅ FIX: Ottieni l'ora corrente nel timezone Europe/Rome
 * I server Railway girano su UTC, quindi new Date() restituisce UTC.
 * Dobbiamo convertire all'ora locale dell'utente.
 */
function getCurrentRomeTime(): { hour: number; minute: number } {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Rome',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  });
  const parts = formatter.formatToParts(now);
  const hour = parseInt(parts.find(p => p.type === 'hour')?.value || '0', 10);
  const minute = parseInt(parts.find(p => p.type === 'minute')?.value || '0', 10);
  return { hour, minute };
}

/**
 * ✅ FIX BUG #2: Controlla SIA la frequenza GIORNI SIA l'ORA configurata
 *
 * Un promemoria va inviato se:
 * 1. Sono passati >= frequenzaGiorni dall'ultima notifica
 * 2. L'ora attuale è entro una finestra di ±30 min dall'ora configurata
 * 3. NON è già stato inviato oggi (controlla ultimaNotifica)
 */
function shouldSendReminder(
  promemoria: PromemoriaDoc, 
  nowHour: number, 
  nowMinute: number
): boolean {
  // ✅ Controllo 1: Frequenza giorni
  if (promemoria.ultimaNotifica) {
    const ultimaNotifica = promemoria.ultimaNotifica.toDate();
    
    // Convertiamo ultimaNotifica a ora Roma per il confronto giorni
    const romeFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Europe/Rome',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    const [month, day, year] = romeFormatter.format(ultimaNotifica).split('/');
    const romeDate = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
    
    const todayRome = new Date();
    const oggiFormatted = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Europe/Rome',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(todayRome);
    const [m, d, y] = oggiFormatted.split('/');
    const today = new Date(parseInt(y), parseInt(m) - 1, parseInt(d));

    const diffTime = today.getTime() - romeDate.getTime();
    const giorniTrascorsi = Math.floor(diffTime / (1000 * 60 * 60 * 24));

    if (giorniTrascorsi < promemoria.frequenzaGiorni) {
      return false;
    }

    // Se è lo stesso giorno, non inviare di nuovo
    if (giorniTrascorsi === 0) {
      return false;
    }
  }

  // ✅ Controllo 2: Ora configurata (finestra ±30 minuti)
  const reminderHour = promemoria.ora?.hour ?? 8;
  const reminderMinute = promemoria.ora?.minute ?? 0;

  const reminderTotalMinutes = reminderHour * 60 + reminderMinute;
  const nowTotalMinutes = nowHour * 60 + nowMinute;

  const toleranceMinutes = 30;
  const diffMinutes = Math.abs(nowTotalMinutes - reminderTotalMinutes);
  const isWithinWindow = diffMinutes <= toleranceMinutes || (1440 - diffMinutes) <= toleranceMinutes;

  if (!isWithinWindow) {
    return false;
  }

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

/**
 * ✅ FIX: Aggiorna ultimaNotifica su collection piatta
 */
async function updateLastNotification(db: admin.firestore.Firestore, promemoriaId: string): Promise<void> {
  try {
    const promemoriaRef = db.collection('promemoria').doc(promemoriaId);
    const doc = await promemoriaRef.get();

    if (doc.exists) {
      await promemoriaRef.update({
        ultimaNotifica: admin.firestore.FieldValue.serverTimestamp(),
      });
      console.log(`✅ ultimaNotifica aggiornato per promemoria ${promemoriaId}`);
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
    const romeTime = getCurrentRomeTime();
    console.log(`🔍 Controllo promemoria attivi (ora Roma: ${romeTime.hour}:${String(romeTime.minute).padStart(2, '0')})...`);

    const promemoriaList = await getAllActiveReminders(db);

    console.log(`📋 Trovati ${promemoriaList.length} promemoria attivi`);

    let sentCount = 0;
    let skippedCount = 0;

    for (const promemoria of promemoriaList) {
      try {
        if (shouldSendReminder(promemoria, romeTime.hour, romeTime.minute)) {
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
