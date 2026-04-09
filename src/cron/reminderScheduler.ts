/**
 * Cron job per notifiche promemoria
 */

import { getFirestore } from '../config/firebase';
import { NotificationService } from '../services/notificationService';

interface PromemoriaDoc {
  id: string;
  userId: string;
  nome: string;
  ora: { hour: number; minute: number };
  frequenzaGiorni: number;
  attivo: boolean;
  ultimaNotifica?: any; // Timestamp
}

export class ReminderScheduler {
  private db = getFirestore();
  private notificationService = new NotificationService();

  /**
   * Controlla e invia notifiche promemoria
   */
  async checkAndSendReminders(): Promise<void> {
    const now = new Date();
    console.log(`🔍 Controllo promemoria attivi...`);

    // Ottieni tutti i promemoria attivi da tutte le sottocollezioni
    const promemoriaList = await this.getAllActiveReminders();

    console.log(`📋 Trovati ${promemoriaList.length} promemoria attivi`);

    for (const promemoria of promemoriaList) {
      try {
        const shouldSend = this.shouldSendReminder(promemoria, now);

        if (shouldSend) {
          console.log(`✅ Promemoria "${promemoria.nome}" pronto per essere inviato`);

          // Ottieni token FCM dell'utente
          const token = await this.getUserFCMToken(promemoria.userId);

          if (!token) {
            console.warn(`⚠️  Nessun token FCM per utente ${promemoria.userId}`);
            continue;
          }

          // Invia notifica
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

          // Aggiorna ultimaNotifica
          await this.updateLastNotification(promemoria.id);

          console.log(`✅ Notifica promemoria inviata: ${promemoria.nome}`);
        }
      } catch (error) {
        console.error(`❌ Errore elaborazione promemoria ${promemoria.id}:`, error);
      }
    }
  }

  /**
   * Ottieni tutti i promemoria attivi
   * Nota: Usa collectionGroup per query su sottocollezioni
   */
  private async getAllActiveReminders(): Promise<PromemoriaDoc[]> {
    try {
      // Query su sottocollezione promemoria/{userId}/{promemoriaId}
      const snapshot = await this.db.collectionGroup('promemoria')
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
   * Determina se un promemoria deve essere inviato
   */
  private shouldSendReminder(promemoria: PromemoriaDoc, now: Date): boolean {
    // Se mai inviato, invia subito
    if (!promemoria.ultimaNotifica) {
      return true;
    }

    const ultimaNotifica = promemoria.ultimaNotifica.toDate();
    const giorniTrascorsi = (now.getTime() - ultimaNotifica.getTime()) / (1000 * 60 * 60 * 24);

    return giorniTrascorsi >= promemoria.frequenzaGiorni;
  }

  /**
   * Ottieni token FCM dell'utente
   */
  private async getUserFCMToken(userId: string): Promise<string | null> {
    try {
      const snapshot = await this.db
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
   * Aggiorna timestamp ultima notifica
   */
  private async updateLastNotification(promemoriaId: string): Promise<void> {
    try {
      // Cerca il documento del promemoria
      // Nota: Dato che è in sottocollezione, dobbiamo cercare per ID
      // In produzione, meglio salvare il path completo nel cron job
      
      // Per ora, assumiamo che il promemoria sia nella collezione principale
      // oppure che l'ID sia unico
      
      const snapshot = await this.db.collectionGroup('promemoria')
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
}
