/**
 * Cron job per notifiche scadenze prodotti
 */

import { getFirestore } from '../config/firebase';
import { NotificationService } from '../services/notificationService';
import admin from 'firebase-admin';

interface ProdottoDoc {
  id: string;
  userId: string;
  nome: string;
  dataScadenza?: admin.firestore.Timestamp;
  categoria?: string;
}

interface ScadenzaDoc {
  id: string;
  userId: string;
  prodottoId: string;
  giorniPreavviso: number[];
  attivo: boolean;
}

// Funzioni helper standalone
async function getAllActiveScadenze(db: admin.firestore.Firestore): Promise<ScadenzaDoc[]> {
  try {
    const snapshot = await db
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

async function getProdotto(db: admin.firestore.Firestore, prodottoId: string, userId: string): Promise<ProdottoDoc | null> {
  try {
    const snapshot = await db
      .collectionGroup('prodotti')
      .where(admin.firestore.FieldPath.documentId(), '==', prodottoId)
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

function daysBetween(date1: Date, date2: Date): number {
  const diffTime = date2.getTime() - date1.getTime();
  return Math.floor(diffTime / (1000 * 60 * 60 * 24));
}

function getExpirationTitle(giorni: number): string {
  if (giorni === 0) return '⚠️ Prodotto in scadenza!';
  if (giorni === 1) return '📅 Scade domani';
  if (giorni <= 3) return '📅 Scade tra pochi giorni';
  if (giorni <= 7) return '📅 Scade questa settimana';
  return '📅 Scadenza imminente';
}

function getExpirationText(giorni: number): string {
  if (giorni === 0) return 'OGGI';
  if (giorni === 1) return 'domani';
  return `tra ${giorni} giorni`;
}

// ============================================================================
// EXPIRATION SCHEDULER CLASS
// ============================================================================

export class ExpirationScheduler {
  private notificationService = new NotificationService();

  /**
   * Controlla e invia notifiche scadenze
   */
  async checkAndSendExpirations(): Promise<void> {
    const db = getFirestore();
    const now = new Date();
    console.log(`🔍 Controllo scadenze prodotti...`);

    const scadenzeList = await getAllActiveScadenze(db);

    console.log(`📋 Trovate ${scadenzeList.length} scadenze attive`);

    for (const scadenza of scadenzeList) {
      try {
        const prodotto = await getProdotto(db, scadenza.prodottoId, scadenza.userId);

        if (!prodotto || !prodotto.dataScadenza) {
          continue;
        }

        const scadenzaDate = prodotto.dataScadenza.toDate();

        for (const giorni of scadenza.giorniPreavviso) {
          const dataNotifica = new Date(scadenzaDate);
          dataNotifica.setDate(dataNotifica.getDate() - giorni);

          const diffDays = daysBetween(now, dataNotifica);

          if (diffDays <= 0 && diffDays >= -1) {
            console.log(`✅ Scadenza "${prodotto.nome}" tra ${giorni} giorni - invio notifica`);

            const token = await getUserFCMToken(db, scadenza.userId);

            if (!token) {
              console.warn(`⚠️  Nessun token FCM per utente ${scadenza.userId}`);
              continue;
            }

            await this.notificationService.sendNotification({
              userId: scadenza.userId,
              token,
              title: getExpirationTitle(giorni),
              body: `Il prodotto "${prodotto.nome}" scadrà ${getExpirationText(giorni)}`,
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
}
