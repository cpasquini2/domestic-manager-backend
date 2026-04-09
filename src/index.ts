/**
 * Domestic Manager - Notification Backend
 * 
 * Backend Node.js per gestione notifiche FCM:
 * - Salvataggio token FCM utenti
 * - Invio notifiche promemoria ricorrenti
 * - Invio notifiche scadenze prodotti
 * 
 * Deployabile su Railway, Render, Heroku, etc.
 */

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { initializeFirebase } from './config/firebase';
import { tokenRoutes } from './routes/tokens';
import { notificationRoutes } from './routes/notifications';
import { startCronJobs } from './cron/jobs';
import { healthCheck } from './middleware/health';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================================================
// MIDDLEWARE
// ============================================================================

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check
app.use('/health', healthCheck);

// ============================================================================
// ROUTES
// ============================================================================

// Gestione token FCM
app.use('/api/tokens', tokenRoutes);

// Invio notifiche
app.use('/api/notifications', notificationRoutes);

// ============================================================================
// AVVIO SERVER
// ============================================================================

async function start() {
  try {
    // Inizializza Firebase Admin
    await initializeFirebase();
    console.log('✅ Firebase Admin inizializzato');

    // Avvia cron job per notifiche periodiche
    startCronJobs();
    console.log('✅ Cron job avviati');

    // Avvia server
    app.listen(PORT, () => {
      console.log(`🚀 Server attivo sulla porta ${PORT}`);
      console.log(`📊 Health check: http://localhost:${PORT}/health`);
      console.log(`🔔 API disponibili:`);
      console.log(`   POST /api/tokens         - Salva token FCM`);
      console.log(`   DELETE /api/tokens       - Rimuovi token FCM`);
      console.log(`   POST /api/notifications/send  - Invia notifica`);
      console.log(`   GET  /health             - Health check`);
    });
  } catch (error) {
    console.error('❌ Errore avvio server:', error);
    process.exit(1);
  }
}

start();

export default app;
