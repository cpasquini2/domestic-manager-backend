# 🚀 Guida al Deploy su Railway

## Prerequisiti
- ✅ Account GitHub
- ✅ Account Railway (gratis: https://railway.app)
- ✅ Firebase Service Account JSON

---

## Step 1: Crea Repository su GitHub

### Da terminale (nella cartella del backend):
```bash
cd c:\dev\domestic-manager-backend

# Aggiungi tutti i file
git add .

# Commit iniziale
git commit -m "feat: backend notifiche FCM - prima versione"
```

### Ora su GitHub:
1. Vai su https://github.com/new
2. **Repository name**: `domestic-manager-backend`
3. **Descrizione**: `Backend notifiche FCM per Domestic Manager`
4. Lascia tutto com'è, clicca **"Create repository"**
5. Copia l'URL del repo (tipo: `https://github.com/TUO-USERNAME/domestic-manager-backend.git`)

### Torna al terminale e collega il repo:
```bash
# Sostituisci con il TUO URL GitHub
git remote add origin https://github.com/TUO-USERNAME/domestic-manager-backend.git

# Rinomina branch
git branch -M main

# Push
git push -u origin main
```

---

## Step 2: Ottieni Firebase Service Account

1. https://console.firebase.google.com → Progetto `domestic-manager-ec0a0`
2. ⚙️ **Project Settings** → **Service accounts**
3. Clicca **"Generate new private key"**
4. Salva il file JSON

### Converti JSON in una sola riga (PowerShell):
```powershell
# Vai nella cartella dove hai scaricato il JSON
cd C:\Users\TUO-NOME\Downloads

# Converti e copia negli appunti
Get-Content .\domestic-manager-ec0a0-firebase-adminsdk-xxxxx-xxxxxxxxxx.json | ConvertFrom-Json | ConvertTo-Json -Depth 100 -Compress | Set-Clipboard
```

Ora il JSON è negli appunti! ✅

---

## Step 3: Deploy su Railway

### Crea il progetto:
1. Vai su https://railway.app
2. Login con **GitHub**
3. **"New Project"** → **"Deploy from GitHub repo"**
4. Seleziona: `domestic-manager-backend`

### Configura:
1. Clicca sul servizio creato
2. Vai su **Settings**
3. **Root Directory**: lascia vuoto (è già nella root)
4. Railway troverà automaticamente `package.json`

### Aggiungi variabili d'ambiente:
Vai su **Variables** tab e aggiungi:

**Variabile 1: `FIREBASE_SERVICE_ACCOUNT`**
- Incolla il JSON che hai copiato negli appunti
- Deve essere su UNA SOLA RIGA

**Variabile 2: `CRON_TIMEZONE`**
```
Europe/Rome
```

**Variabile 3: `LOG_LEVEL`**
```
info
```

---

## Step 4: Verifica Deploy

Railway deployerà automaticamente dopo il push.

### Test Health Check:
Nel browser apri:
```
https://TUO-PROGETTO.up.railway.app/health
```

Dovresti vedere:
```json
{
  "status": "ok",
  "timestamp": "2026-04-09T...",
  "uptime": 123.456
}
```

✅ **Se vedi questo, il backend è ONLINE!**

---

## Step 5: Collega il Frontend

Ora devi dire alla tua app Flutter dove si trova il backend.

### Modifica nel file Flutter:
Apri: `c:\dev\domestic_manager_fe_v2_optimized\lib\services\firebase_messaging_service.dart`

Cerca il metodo `_getBackendUrl()` e modificalo:

```dart
String? _getBackendUrl() {
  // URL del tuo backend su Railway
  return 'https://TUO-PROGETTO.up.railway.app';
}
```

Sostituisci `https://TUO-PROGETTO.up.railway.app` con l'URL reale di Railway.

### Test dell'app:
```bash
cd c:\dev\domestic_manager_fe_v2_optimized
flutter run
```

Nei log, dopo il login, dovresti vedere:
```
✅ [FCM] Token inviato al backend per userId: abc123
```

---

## Step 6: Aggiornamenti Futuri

Quando modifichi il backend:

```bash
cd c:\dev\domestic-manager-backend

# Controlla modifiche
git status

# Aggiungi file modificati
git add .

# Commit
git commit -m "descrizione delle modifiche"

# Push (aggiorna automaticamente Railway)
git push
```

Railway farà il deploy automaticamente! ✅

---

## 📊 Monitoraggio

### Visualizza Log:
- Railway Dashboard → Clicca sul servizio → **Deployments** → **View Logs**

### Health Check:
```bash
curl https://TUO-PROGETTO.up.railway.app/health
```

### Test Invio Notifica Manuale:
```bash
curl -X POST https://TUO-PROGETTO.up.railway.app/api/notifications/send ^
  -H "Content-Type: application/json" ^
  -d "{\"userId\":\"TEST_USER_ID\",\"title\":\"Test\",\"body\":\"Notifica di test\"}"
```

---

## ✅ Checklist Finale

- [ ] Repository GitHub creato
- [ ] Codice pushato su GitHub
- [ ] Firebase Service Account ottenuto
- [ ] Progetto Railway creato
- [ ] Variabili d'ambiente configurate
- [ ] Health check funziona
- [ ] Frontend configurato con URL backend
- [ ] Test notifica manuale OK
- [ ] Token FCM salvato dopo login

---

## 💰 Costi

- **Railway**: $5/mese gratis → Backend costa ~$0-2/mese ✅
- **Firebase FCM**: Sempre gratis ✅
- **Totale**: ~$0/mese ✅
