/**
 * Routes per invio notifiche
 */

import { Router, Request, Response } from 'express';
import { NotificationService } from '../services/notificationService';

export const notificationRoutes = Router();
const notificationService = new NotificationService();

/**
 * POST /api/notifications/send
 * Invia una notifica FCM a un utente specifico
 */
notificationRoutes.post('/send', async (req: Request, res: Response) => {
  try {
    const { userId, title, body, data, token } = req.body;

    // Validazione
    if (!userId && !token) {
      res.status(400).json({
        error: 'userId o token sono obbligatori',
      });
      return;
    }

    if (!title || !body) {
      res.status(400).json({
        error: 'title e body sono obbligatori',
      });
      return;
    }

    // Invia notifica
    const result = await notificationService.sendNotification({
      userId,
      token,
      title,
      body,
      data,
    });

    res.status(200).json({
      success: true,
      message: 'Notifica inviata con successo',
      result,
    });
  } catch (error) {
    console.error('Errore invio notifica:', error);
    res.status(500).json({
      error: 'Errore interno del server',
    });
  }
});

/**
 * POST /api/notifications/broadcast
 * Invia notifica a tutti gli utenti
 */
notificationRoutes.post('/broadcast', async (req: Request, res: Response) => {
  try {
    const { title, body, data } = req.body;

    if (!title || !body) {
      res.status(400).json({
        error: 'title e body sono obbligatori',
      });
      return;
    }

    // Invia broadcast
    const result = await notificationService.broadcastNotification({
      title,
      body,
      data,
    });

    res.status(200).json({
      success: true,
      message: `Notifica inviata a ${result.successCount} utenti`,
      result,
    });
  } catch (error) {
    console.error('Errore broadcast notifica:', error);
    res.status(500).json({
      error: 'Errore interno del server',
    });
  }
});
