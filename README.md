# Domestic Manager - Backend Notifiche FCM

Backend Node.js per la gestione delle notifiche FCM di Domestic Manager.

## Funzionalità
- ✅ Salvataggio token FCM utenti
- ✅ Cron job promemoria (ogni giorno alle 8:00)
- ✅ Cron job scadenze prodotti (ogni giorno alle 9:00)
- ✅ API REST per invio notifiche manuali

## Deploy
Vedi [GUIDA_DEPLOY.md](GUIDA_DEPLOY.md) per istruzioni complete.

## Struttura
```
src/
├── index.ts                    # Server Express
├── config/firebase.ts          # Firebase Admin SDK
├── routes/                     # API endpoints
├── services/                   # Business logic
└── cron/                       # Cron job
```

## Variabili d'Ambiente
- `FIREBASE_SERVICE_ACCOUNT` - JSON service account Firebase
- `CRON_TIMEZONE` - Timezone per cron job (default: Europe/Rome)
- `PORT` - Porta server (default: 3000)
