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
  timezone?: string; // ✅ Timezone IANA (es: 'Europe/Rome'). Default: 'Europe/Rome'
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
 * ✅ FIX: Ottieni l'ora corrente in un timezone specifico
 * I server Railway girano su UTC, quindi new Date() restituisce UTC.
 * Dobbiamo convertire all'ora locale dell'utente.
 * 
 * @param timezone - Timezone IANA (es: 'Europe/Rome', 'America/New_York')
 * @default 'Europe/Rome' - Se non specificato, usa Roma
 */
function getTimeInTimezone(timezone: string = 'Europe/Rome'): { hour: number; minute: number; date: Date } {
  const now = new Date();
  
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  
  const parts = formatter.formatToParts(now);
  const hour = parseInt(parts.find(p => p.type === 'hour')?.value || '0', 10);
  const minute = parseInt(parts.find(p => p.type === 'minute')?.value || '0', 10);
  const month = parseInt(parts.find(p => p.type === 'month')?.value || '1', 10);
  const day = parseInt(parts.find(p => p.type === 'day')?.value || '1', 10);
  const year = parseInt(parts.find(p => p.type === 'year')?.value || '2026', 10);
  
  return { hour, minute, date: new Date(year, month - 1, day) };
}

/**
 * ✅ FIX BUG #2: Controlla SIA la frequenza GIORNI SIA l'ORA configurata
 * Supporta timezone dinamico per utenti internazionali
 */
function shouldSendReminder(
  promemoria: PromemoriaDoc, 
  nowHour: number, 
  nowMinute: number,
  nowDate: Date
): boolean {
  // ✅ Controllo 1: Frequenza giorni
  if (promemoria.ultimaNotifica) {
    const ultimaNotifica = promemoria.ultimaNotifica.toDate();
    
    // Calcola giorni trascorsi usando la data nel timezone corretto
    const diffTime = nowDate.getTime() - ultimaNotifica.getTime();
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

    const promemoriaList = await getAllActiveReminders(db);
    console.log(`📋 Trovati ${promemoriaList.length} promemoria attivi`);

    // Raggruppa promemoria per timezone per efficienza
    const promemoriaByTimezone: Record<string, typeof promemoriaList> = {};
    
    for (const promemoria of promemoriaList) {
      const tz = promemoria.timezone || 'Europe/Rome'; // Default a Roma se manca
      if (!promemoriaByTimezone[tz]) {
        promemoriaByTimezone[tz] = [];
      }
      promemoriaByTimezone[tz].push(promemoria);
    }

    let sentCount = 0;
    let skippedCount = 0;

    // Processa ogni timezone
    for (const [timezone, items] of Object.entries(promemoriaByTimezone)) {
      const timeInfo = getTimeInTimezone(timezone);
      console.log(`🔍 Controllo promemoria per timezone ${timezone} (ora locale: ${timeInfo.hour}:${String(timeInfo.minute).padStart(2, '0')})...`);

      for (const promemoria of items) {
        try {
          if (shouldSendReminder(promemoria, timeInfo.hour, timeInfo.minute, timeInfo.date)) {
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
