/**
 * Routes per gestione token FCM
 */

import { Router, Request, Response } from 'express';
import { getFirestore } from '../config/firebase';
import { TokenService } from '../services/tokenService';

export const tokenRoutes = Router();
const tokenService = new TokenService();

/**
 * POST /api/tokens
 * Salva o aggiorna token FCM di un utente
 */
tokenRoutes.post('/', async (req: Request, res: Response) => {
  try {
    const { userId, token, platform } = req.body;

    // Validazione
    if (!userId || !token) {
      res.status(400).json({
        error: 'userId e token sono obbligatori',
      });
      return;
    }

    // Salva token
    await tokenService.saveToken(userId, token, platform || 'android');

    res.status(200).json({
      success: true,
      message: 'Token FCM salvato con successo',
    });
  } catch (error) {
    console.error('Errore salvataggio token:', error);
    res.status(500).json({
      error: 'Errore interno del server',
    });
  }
});

/**
 * DELETE /api/tokens
 * Rimuove token FCM di un utente
 */
tokenRoutes.delete('/', async (req: Request, res: Response) => {
  try {
    const { userId, token } = req.body;

    if (!userId) {
      res.status(400).json({
        error: 'userId è obbligatorio',
      });
      return;
    }

    // Rimuovi token
    await tokenService.removeToken(userId, token);

    res.status(200).json({
      success: true,
      message: 'Token FCM rimosso con successo',
    });
  } catch (error) {
    console.error('Errore rimozione token:', error);
    res.status(500).json({
      error: 'Errore interno del server',
    });
  }
});

/**
 * GET /api/tokens/:userId
 * Ottieni tutti i token FCM di un utente
 */
tokenRoutes.get('/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;

    const tokens = await tokenService.getUserTokens(userId);

    res.status(200).json({
      success: true,
      tokens,
    });
  } catch (error) {
    console.error('Errore recupero token:', error);
    res.status(500).json({
      error: 'Errore interno del server',
    });
  }
});
