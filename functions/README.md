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

4. Deploy the new Realtime Database Rules and scheduler:

```powershell
pnpm run build
firebase deploy --only database,functions
```

The `sendEventReminders` function runs every 15 minutes in the `Asia/Ho_Chi_Minh` timezone. It reads important dates and sends Web Push notifications to devices that explicitly enabled notifications in **Cá nhân & riêng tư**.

Cloud Scheduler is used by scheduled Cloud Functions and requires a Firebase project with billing enabled. Do not deploy this scheduler until the Firebase project and its billing account are the intended production ones.

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
- `FIREBASE_SERVICE_ACCOUNT` — complete JSON for a production service account that can deploy Firebase Rules and Cloud Functions.

The GitHub Pages workflow builds the web app with the VAPID key. The Firebase workflow runs tests, builds Cloud Functions, then deploys Database Rules and Functions after a change to the backend paths reaches main.
