# aura01
## FCM notification setup

AURA uses the shared `/sw.js` service worker for both PWA caching and Firebase Cloud Messaging.

Required Vercel environment variables for server-side FCM sending:

- `FIREBASE_PROJECT_ID`
- `FIREBASE_CLIENT_EMAIL`
- `FIREBASE_PRIVATE_KEY`

The Firebase Web config and FCM VAPID public key live in `config.js` and are safe for browser use.

After deployment:

1. Sign in to AURA.
2. Open Settings → Enable notifications.
3. Allow browser notifications.
4. Open Settings → Send test notification.
5. If the test succeeds, the device token is registered under `users/{uid}/fcmTokens`.

Firebase Console must have Cloud Messaging configured, and browser notification permission must be allowed. Vercel HTTPS satisfies the secure-context requirement.

## Flutterwave Pro checkout

AURA Pro uses these hosted Flutterwave payment links:

- NGN: https://flutterwave.com/pay/sv4plrv0ylyt — ₦5,000/month
- USD: https://flutterwave.com/pay/6lhwzvtypc2n — $5/month

Central webhook:
https://taskora-7iho.vercel.app/api/flutterwave-webhook

The app records a pending upgrade locally before opening checkout. **Pro must only be activated server-side after the central webhook verifies the payment.** Flutterwave recommends signature verification and re-verifying transaction status, amount, currency and reference before granting value.

The supplied Flutterwave public key is stored in `config.js` for future Flutterwave SDK use; hosted payment links do not expose the secret key.

For automatic AURA Pro activation, the Taskora webhook must identify AURA payments and update the AURA Firebase user's entitlement after verified payment. Do not activate Pro from the frontend redirect alone.


## Central Flutterwave webhook

The central webhook is:
`https://taskora-7iho.vercel.app/api/flutterwave-webhook`

It supports:
- AURA Pro: NGN 5,000 or USD 5
- Taskora: NGN 2,000 or USD 2

Required server environment variables:
- `FLW_SECRET_HASH` (or `FLUTTERWAVE_WEBHOOK_SECRET`)
- `FLW_SECRET_KEY` (or `FLUTTERWAVE_SECRET_KEY`)
- `FIREBASE_PROJECT_ID`
- `FIREBASE_CLIENT_EMAIL`
- `FIREBASE_PRIVATE_KEY`

Optional pricing overrides:
- `AURA_PRO_PRICE_NGN=5000`
- `AURA_PRO_PRICE_USD=5`
- `TASKORA_PRICE_NGN=2000`
- `TASKORA_PRICE_USD=2`

AURA payments must include Firebase UID metadata such as:
`app=aura`
`aura_user_id=<Firebase UID>`
`plan=pro`

Do not use a customer email as a Firebase UID. The webhook uses a Firestore
`processedPayments/{transactionId}` record to make payment activation idempotent.
