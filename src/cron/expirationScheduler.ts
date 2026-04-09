/**
 * Cron job per notifiche scadenze prodotti
 */

import { getFirestore } from '../config/firebase';
import { NotificationService } from '../services/notificationService';

interface ProdottoDoc {
  id: string;
  userId: string;
  nome: string;
  dataScadenza?: any; // Timestamp
  categoria?: string;
}

interface ScadenzaDoc {
  id: string;
  userId: string;
  prodottoId: string;
  giorniPreavviso: number[];
  attivo: boolean;
}

export class ExpirationScheduler {
  private db = getFirestore();
  private notificationService = new NotificationService();

  /**
   * Controlla e invia notifiche scadenze
   */
  async checkAndSendExpirations(): Promise<void> {
    const now = new Date();
    console.log(`🔍 Controllo scadenze prodotti...`);

    // Ottieni tutte le scadenze attive
    const scadenzeList = await this.getAllActiveScadenze();

    console.log(`📋 Trovate ${scadenzeList.length} scadenze attive`);

    for (const scadenza of scadenzeList) {
      try {
        // Ottieni il prodotto associato
        const prodotto = await this.getProdotto(scadenza.prodottoId, scadenza.userId);

        if (!prodotto || !prodotto.dataScadenza) {
          continue;
        }

        const scadenzaDate = prodotto.dataScadenza.toDate();

        // Controlla ogni giorno di preavviso
        for (const giorni of scadenza.giorniPreavviso) {
          const dataNotifica = new Date(scadenzaDate);
          dataNotifica.setDate(dataNotifica.getDate() - giorni);

          // Se oggi è la data di notifica (±1 giorno per margine)
          const diffDays = this.daysBetween(now, dataNotifica);

          if (diffDays <= 0 && diffDays >= -1) {
            console.log(`✅ Scadenza "${prodotto.nome}" tra ${giorni} giorni - invio notifica`);

            // Ottieni token FCM
            const token = await this.getUserFCMToken(scadenza.userId);

            if (!token) {
              console.warn(`⚠️  Nessun token FCM per utente ${scadenza.userId}`);
              continue;
            }

            // Invia notifica
            await this.notificationService.sendNotification({
              userId: scadenza.userId,
              token,
              title: this.getExpirationTitle(giorni),
              body: `Il prodotto "${prodotto.nome}" scadrà ${this.getExpirationText(giorni)}`,
              data: {
                type: 'scadenza',
                productId: prodotto.id,
                giorniPreavviso: giorni.toString(),
                productName: prodotto.nome,
                screen: 'product_detail',
              },
            });

            console.log(`✅ Notifica scadenza inviata: ${prodotto.nome} (${giorni} giorni)`);
          }
        }
      } catch (error) {
        console.error(`❌ Errore elaborazione scadenza ${scadenza.id}:`, error);
      }
    }
  }

  /**
   * Ottieni tutte le scadenze attive
   */
  private async getAllActiveScadenze(): Promise<ScadenzaDoc[]> {
    try {
      const snapshot = await this.db
        .collection('scadenze')
        .where('attivo', '==', true)
        .get();

      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      })) as ScadenzaDoc[];
    } catch (error) {
      console.error('Errore query scadenze:', error);
      return [];
    }
  }

  /**
   * Ottieni prodotto per ID e userId
   */
  private async getProdotto(prodottoId: string, userId: string): Promise<ProdottoDoc | null> {
    try {
      // Cerca in tutte le possibili sottocollezioni prodotti
      // Struttura: prodotti/{userId}/{categoria}/{prodottoId}
      const snapshot = await this.db
        .collectionGroup('prodotti')
        .where('__name__', '==', prodottoId)
        .limit(1)
        .get();

      if (snapshot.empty) {
        return null;
      }

      return {
        id: snapshot.docs[0].id,
        ...snapshot.docs[0].data(),
      } as ProdottoDoc;
    } catch (error) {
      console.error(`Errore recupero prodotto ${prodottoId}:`, error);
      return null;
    }
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
   * Calcola giorni tra due date
   */
  private daysBetween(date1: Date, date2: Date): number {
    const diffTime = date2.getTime() - date1.getTime();
    return Math.floor(diffTime / (1000 * 60 * 60 * 24));
  }

  /**
   * Genera titolo notifica scadenza
   */
  private getExpirationTitle(giorni: number): string {
    if (giorni === 0) return '⚠️ Prodotto in scadenza!';
    if (giorni === 1) return '📅 Scade domani';
    if (giorni <= 3) return '📅 Scade tra pochi giorni';
    if (giorni <= 7) return '📅 Scade questa settimana';
    return '📅 Scadenza imminente';
  }

  /**
   * Genera testo notifica scadenza
   */
  private getExpirationText(giorni: number): string {
    if (giorni === 0) return 'OGGI';
    if (giorni === 1) return 'domani';
    return `tra ${giorni} giorni`;
  }
}
