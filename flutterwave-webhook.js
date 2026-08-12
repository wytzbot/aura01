import { getApps, initializeApp, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

function initFirebase() {
  if (getApps().length) return;

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error("FIREBASE_ADMIN_CONFIG_MISSING");
  }

  initializeApp({
    credential: cert({ projectId, clientEmail, privateKey })
  });
}

function getWebhookSecret(req) {
  return (
    req.headers["verif-hash"] ||
    req.headers["verif_hash"] ||
    req.headers["x-verif-hash"] ||
    ""
  );
}

function getEventData(body) {
  // Flutterwave webhook payloads can vary by version/configuration.
  if (body?.data) return body.data;
  return body;
}

function normalizeCurrency(value) {
  return String(value || "").trim().toUpperCase();
}

function getMetadata(transaction) {
  const meta = transaction?.meta;
  if (!meta) return {};
  if (Array.isArray(meta)) {
    return Object.fromEntries(
      meta
        .filter((x) => x && x.key)
        .map((x) => [String(x.key), x.value])
    );
  }
  return typeof meta === "object" ? meta : {};
}

function getAppName(transaction) {
  const meta = getMetadata(transaction);

  return String(
    meta.app ||
    meta.application ||
    meta.product ||
    transaction?.tx_ref?.split("_")?.[0] ||
    ""
  ).trim().toLowerCase();
}

function getUidForApp(transaction, app) {
  const meta = getMetadata(transaction);

  if (app === "aura") {
    return String(
      meta.aura_user_id ||
      meta.firebase_uid ||
      meta.user_id ||
      ""
    ).trim();
  }

  if (app === "taskora") {
    return String(
      meta.taskora_user_id ||
      meta.user_id ||
      ""
    ).trim();
  }

  return String(meta.user_id || "").trim();
}

function getExpectedPayment(app, currency) {
  const c = normalizeCurrency(currency);

  if (app === "aura") {
    if (c === "NGN") return Number(process.env.AURA_PRO_PRICE_NGN || 5000);
    if (c === "USD") return Number(process.env.AURA_PRO_PRICE_USD || 5);
    return null;
  }

  if (app === "taskora") {
    if (c === "NGN") return Number(process.env.TASKORA_PRICE_NGN || 2000);
    if (c === "USD") return Number(process.env.TASKORA_PRICE_USD || 2);
    return null;
  }

  return null;
}

async function verifyFlutterwaveTransaction(transactionId, secretKey) {
  const response = await fetch(
    `https://api.flutterwave.com/v3/transactions/${encodeURIComponent(transactionId)}/verify`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${secretKey}`,
        "Content-Type": "application/json"
      }
    }
  );

  if (!response.ok) {
    throw new Error(`FLUTTERWAVE_VERIFY_HTTP_${response.status}`);
  }

  return response.json();
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      message: "Method not allowed"
    });
  }

  const secretHash =
    process.env.FLW_SECRET_HASH ||
    process.env.FLUTTERWAVE_WEBHOOK_SECRET;

  const secretKey =
    process.env.FLW_SECRET_KEY ||
    process.env.FLUTTERWAVE_SECRET_KEY;

  if (!secretHash || !secretKey) {
    console.error("Flutterwave webhook configuration is missing.");
    return res.status(500).json({
      success: false,
      message: "Webhook is not configured"
    });
  }

  const signature = getWebhookSecret(req);

  if (!signature || signature !== secretHash) {
    return res.status(401).json({
      success: false,
      message: "Invalid webhook signature"
    });
  }

  try {
    const body = req.body || {};

    // Ignore non-payment events safely.
    const eventName = String(body?.event || "").toLowerCase();
    if (
      eventName &&
      !["charge.completed", "charge.completed.v2"].includes(eventName)
    ) {
      return res.status(200).json({
        success: true,
        message: "Event ignored"
      });
    }

    const webhookData = getEventData(body);
    const transactionId =
      webhookData?.id ||
      webhookData?.transaction_id ||
      webhookData?.tx_id;

    if (!transactionId) {
      return res.status(400).json({
        success: false,
        message: "Missing transaction ID"
      });
    }

    // NEVER trust the webhook amount/status alone.
    const verification = await verifyFlutterwaveTransaction(
      transactionId,
      secretKey
    );

    if (
      verification?.status !== "success" ||
      verification?.data?.status !== "successful"
    ) {
      return res.status(400).json({
        success: false,
        message: "Transaction was not successful"
      });
    }

    const transaction = verification.data;
    const amount = Number(transaction.amount);
    const currency = normalizeCurrency(transaction.currency);
    const app = getAppName(transaction);

    if (!["aura", "taskora"].includes(app)) {
      console.warn("Unknown application payment:", {
        app,
        transactionId: String(transactionId)
      });

      return res.status(200).json({
        success: true,
        message: "Payment verified but application was not recognized"
      });
    }

    const expectedAmount = getExpectedPayment(app, currency);

    if (
      expectedAmount === null ||
      !Number.isFinite(amount) ||
      amount < expectedAmount
    ) {
      console.warn("Invalid payment amount/currency:", {
        app,
        amount,
        currency,
        expectedAmount,
        transactionId: String(transactionId)
      });

      return res.status(400).json({
        success: false,
        message: "Invalid payment amount or currency"
      });
    }

    const uid = getUidForApp(transaction, app);

    // A Firebase UID must be supplied in metadata for reliable activation.
    // Do not fall back to email as a UID.
    if (!uid) {
      console.error("Payment has no application user identifier:", {
        app,
        transactionId: String(transactionId)
      });

      return res.status(400).json({
        success: false,
        message: "Missing application user identifier"
      });
    }

    initFirebase();
    const db = getFirestore();
    const transactionKey = String(transactionId);

    // Idempotency: duplicate Flutterwave webhooks must not grant twice.
    const paymentRef = db.collection("processedPayments").doc(transactionKey);
    const existingPayment = await paymentRef.get();

    if (existingPayment.exists) {
      return res.status(200).json({
        success: true,
        message: "Payment already processed",
        transactionId: transactionKey
      });
    }

    if (app === "aura") {
      const userRef = db.collection("users").doc(uid);

      await db.runTransaction(async (tx) => {
        const paymentSnap = await tx.get(paymentRef);

        if (paymentSnap.exists) return;

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
          userId: uid,
          plan: "pro",
          amount,
          currency,
          transactionId: transactionKey,
          processedAt: FieldValue.serverTimestamp()
        });
      });

      console.log("AURA Pro payment activated:", {
        uid,
        transactionId: transactionKey,
        amount,
        currency
      });

      return res.status(200).json({
        success: true,
        message: "AURA Pro payment verified and activated",
        app: "aura",
        plan: "pro",
        transactionId: transactionKey
      });
    }

    // Existing Taskora entitlement behavior, now protected by idempotency.
    const userRef = db.collection("users").doc(uid);

    await db.runTransaction(async (tx) => {
      const paymentSnap = await tx.get(paymentRef);

      if (paymentSnap.exists) return;

      tx.set(
        userRef,
        {
          plan: "pro",
          premium: true,
          premiumPlan: "monthly",
          premiumUpdatedAt: FieldValue.serverTimestamp(),
          flutterwaveTransactionId: transactionKey,
          flutterwaveCurrency: currency,
          flutterwaveAmount: amount
        },
        { merge: true }
      );

      tx.create(paymentRef, {
        app: "taskora",
        userId: uid,
        plan: "pro",
        amount,
        currency,
        transactionId: transactionKey,
        processedAt: FieldValue.serverTimestamp()
      });
    });

    return res.status(200).json({
      success: true,
      message: "Taskora payment verified and activated",
      app: "taskora",
      plan: "pro",
      transactionId: transactionKey
    });
  } catch (error) {
    console.error("Central Flutterwave webhook error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to process payment webhook"
    });
  }
}
