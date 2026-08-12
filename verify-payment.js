import { getApps, initializeApp, cert } from "firebase-admin/app";
import { getAuth, getFirestore, FieldValue } from "firebase-admin";

function init() {
  if (getApps().length) return;

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error("CONFIG");
  }

  initializeApp({
    credential: cert({ projectId, clientEmail, privateKey })
  });
}

async function getUser(req) {
  const header = req.headers.authorization || "";
  if (!header.startsWith("Bearer ")) throw new Error("AUTH");

  init();
  return getAuth().verifyIdToken(header.slice(7));
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed." });
  }

  try {
    const decoded = await getUser(req);

    const secretKey =
      process.env.FLW_SECRET_KEY ||
      process.env.FLUTTERWAVE_SECRET_KEY;

    if (!secretKey) {
      return res.status(503).json({
        error: "Billing is not configured yet."
      });
    }

    const { transaction_id } = req.body || {};

    if (!transaction_id) {
      return res.status(400).json({
        error: "Missing transaction ID."
      });
    }

    const response = await fetch(
      `https://api.flutterwave.com/v3/transactions/${encodeURIComponent(transaction_id)}/verify`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${secretKey}`,
          "Content-Type": "application/json"
        }
      }
    );

    const result = await response.json();

    if (!response.ok || result?.status !== "success") {
      return res.status(400).json({
        error: "We couldn't verify that payment."
      });
    }

    const transaction = result.data;
    const amount = Number(transaction?.amount);
    const currency = String(transaction?.currency || "").toUpperCase();

    const validPayment =
      (currency === "NGN" &&
        amount >= Number(process.env.AURA_PRO_PRICE_NGN || 5000)) ||
      (currency === "USD" &&
        amount >= Number(process.env.AURA_PRO_PRICE_USD || 5));

    if (
      transaction?.status !== "successful" ||
      !validPayment
    ) {
      return res.status(400).json({
        error: "We couldn't verify that AURA Pro payment. No subscription was changed."
      });
    }

    init();
    const db = getFirestore();
    const transactionKey = String(transaction_id);
    const paymentRef = db.collection("processedPayments").doc(transactionKey);
    const userRef = db.collection("users").doc(decoded.uid);

    // Idempotency + ownership: a transaction ID can only ever activate Pro
    // once, and only for the user who supplied it first. Without this, any
    // signed-in user could replay someone else's (or their own old) valid
    // transaction_id to repeatedly self-grant Pro.
    const alreadyProcessed = await db.runTransaction(async (tx) => {
      const paymentSnap = await tx.get(paymentRef);
      if (paymentSnap.exists) return true;

      tx.set(
        userRef,
        {
          plan: "pro",
          auraPlan: "pro",
          proActive: true,
          imageGenerationsPerDay: 10,
          proUpdatedAt: FieldValue.serverTimestamp(),
          flutterwaveTransactionId: transactionKey,
          flutterwaveCurrency: currency,
          flutterwaveAmount: amount
        },
        { merge: true }
      );

      tx.create(paymentRef, {
        app: "aura",
        userId: decoded.uid,
        plan: "pro",
        amount,
        currency,
        transactionId: transactionKey,
        source: "verify-payment",
        processedAt: FieldValue.serverTimestamp()
      });

      return false;
    });

    if (alreadyProcessed) {
      return res.status(400).json({
        error: "This payment has already been used to activate a subscription."
      });
    }

    return res.json({
      ok: true,
      plan: "pro"
    });
  } catch (error) {
    console.error("Payment verification error:", error);

    return res.status(
      error.message === "AUTH" ? 401 : 500
    ).json({
      error:
        error.message === "AUTH"
          ? "Please sign in again."
          : "Payment verification failed. Please try again."
    });
  }
}
