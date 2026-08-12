// Public browser configuration only. Firebase Web config and the FCM VAPID public key are safe to expose in client code.
// NEVER put Firebase Admin credentials, API secrets, or Flutterwave secret keys here.

globalThis.AURA_FIREBASE_CONFIG = {
  apiKey: "AIzaSyDgRaWxfKqGkn1yKcxOMKpTkP-k1foJEKw",
  authDomain: "aura-9f71e.firebaseapp.com",
  projectId: "aura-9f71e",
  storageBucket: "aura-9f71e.firebasestorage.app",
  messagingSenderId: "392571275927",
  appId: "1:392571275927:web:55514acf177d37947db7d2",
  measurementId: "G-8QKVKKSHY6"
};

globalThis.AURA_FIREBASE_VAPID_KEY = "BB8RXgSufYAw0q8QLgOvKMGQ5ku7dFYG0Eq6kFReX4Bmre8Dk4d6wMyQHVFVgnY1SEkKoiiaUoo_n-DdKbazi_4";

globalThis.AURA_FLUTTERWAVE_PUBLIC_KEY = "FLWPUBK_TEST-f3da861ee43126611124e75d502c73d4-X";
globalThis.AURA_FLUTTERWAVE_PAYMENT_LINKS = { NGN: "https://flutterwave.com/pay/sv4plrv0ylyt", USD: "https://flutterwave.com/pay/6lhwzvtypc2n" };
globalThis.AURA_FLUTTERWAVE_WEBHOOK_URL = "https://taskora-7iho.vercel.app/api/flutterwave-webhook";
