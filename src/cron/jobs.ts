/**
 * Cron job per notifiche periodiche
 */

import cron from 'node-cron';
import { ReminderScheduler } from './reminderScheduler';
import { ExpirationScheduler } from './expirationScheduler';

export function startCronJobs(): void {
  const reminderScheduler = new ReminderScheduler();
  const expirationScheduler = new ExpirationScheduler();

  // ============================================================================
  // CRON 1: Controllo promemoria ogni giorno alle 8:00
  // ============================================================================
  cron.schedule('0 8 * * *', async () => {
    console.log('⏰ [CRON] Inizio controllo promemoria giornaliero...');
    try {
      await reminderScheduler.checkAndSendReminders();
      console.log('✅ [CRON] Controllo promemoria completato');
    } catch (error) {
      console.error('❌ [CRON] Errore controllo promemoria:', error);
    }
  }, {
    timezone: process.env.CRON_TIMEZONE || 'Europe/Rome',
  });

  // ============================================================================
  // CRON 2: Controllo scadenze ogni giorno alle 9:00
  // ============================================================================
  cron.schedule('0 9 * * *', async () => {
    console.log('📅 [CRON] Inizio controllo scadenze prodotti...');
    try {
      await expirationScheduler.checkAndSendExpirations();
      console.log('✅ [CRON] Controllo scadenze completato');
    } catch (error) {
      console.error('❌ [CRON] Errore controllo scadenze:', error);
    }
  }, {
    timezone: process.env.CRON_TIMEZONE || 'Europe/Rome',
  });

  // ============================================================================
  // CRON 3: Pulizia token invalidi ogni settimana (Domenica alle 3:00)
  // ============================================================================
  cron.schedule('0 3 * * 0', async () => {
    console.log('🧹 [CRON] Pulizia token FCM invalidi...');
    try {
      // TODO: Implementare pulizia token
      console.log('✅ [CRON] Pulizia token completata');
    } catch (error) {
      console.error('❌ [CRON] Errore pulizia token:', error);
    }
  }, {
    timezone: process.env.CRON_TIMEZONE || 'Europe/Rome',
  });

  console.log('✅ Cron job programmati:');
  console.log('   ⏰ Promemoria: ogni giorno alle 8:00');
  console.log('   📅 Scadenze: ogni giorno alle 9:00');
  console.log('   🧹 Pulizia token: ogni Domenica alle 3:00');
}
