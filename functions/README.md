# Push notification deployment

1. In Firebase Console, open **Project settings → Cloud Messaging → Web configuration** and create a Web Push certificate key.
2. Put that public key in the web app environment:

```text
VITE_FIREBASE_VAPID_KEY=your_public_vapid_key
```

3. Install the Cloud Functions dependencies from this folder:

```powershell
pnpm install
```

4. Deploy the new Realtime Database Rules:

```powershell
firebase deploy --only database
```

The GitHub Action `Send couple reminders` runs every 15 minutes. It calculates the date in the `Asia/Ho_Chi_Minh` timezone, reads important dates, and sends Web Push notifications to devices that explicitly enabled notifications in **Cá nhân & riêng tư**.

This implementation does not use Cloud Scheduler or deploy a Cloud Function. GitHub Actions runs the reminder job using the Firebase Admin SDK.

## GitHub Actions

The repository includes a Firebase deployment workflow. Add these GitHub repository secrets before merging the workflow to main:

- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_DATABASE_URL`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`
- `VITE_FIREBASE_VAPID_KEY`
- `FIREBASE_SERVICE_ACCOUNT` — complete JSON for a production service account that can deploy Firebase Rules, read Realtime Database, and send FCM notifications.

The GitHub Pages workflow builds the web app with the VAPID key. The Firebase Rules workflow runs tests then deploys Database Rules. The reminder workflow runs on its cron schedule and can also be launched manually from GitHub Actions.
