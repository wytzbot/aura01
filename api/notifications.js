import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getAuth, getFirestore } from 'firebase-admin';
import { getMessaging } from 'firebase-admin/messaging';

function init() {
  if (!getApps().length) {
    const projectId = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
    if (!projectId || !clientEmail || !privateKey) throw new Error('CONFIG');
    initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
  }
}

async function auth(req) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) throw new Error('AUTH');
  init();
  return getAuth().verifyIdToken(header.slice(7));
}

function responseError(res, e) {
  if (e.message === 'AUTH') return res.status(401).json({ error: 'Please sign in first.' });
  console.error('FCM error:', e);
  return res.status(500).json({ error: 'Notification service is temporarily unavailable.' });
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGIN || '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });

  try {
    const decoded = await auth(req);
    const db = getFirestore();
    const action = req.body?.action || 'register';

    if (action === 'register') {
      const token = String(req.body?.token || '').trim();
      if (!token || token.length < 20 || token.length > 4096) {
        return res.status(400).json({ error: 'Invalid notification token.' });
      }
      // Hash-like stable document ID without storing a token as a document path.
      const docId = Buffer.from(token).toString('base64url').slice(0, 120);
      await db.collection('users').doc(decoded.uid).collection('fcmTokens').doc(docId).set({
        token,
        platform: req.body?.platform || 'web',
        userAgent: String(req.body?.userAgent || '').slice(0, 500),
        updatedAt: new Date()
      }, { merge: true });
      await db.collection('users').doc(decoded.uid).set({ notificationsEnabled: true }, { merge: true });
      return res.json({ ok: true });
    }

    if (action === 'sendTest') {
      const snap = await db.collection('users').doc(decoded.uid).collection('fcmTokens').get();
      const tokens = snap.docs.map(d => ({ id: d.id, token: d.data().token })).filter(x => x.token);
      if (!tokens.length) return res.status(400).json({ error: 'No notification device is registered yet. Enable notifications first.' });

      const result = await getMessaging().sendEachForMulticast({
        tokens: tokens.map(x => x.token),
        notification: { title: 'AURA notifications are working 🎉', body: 'This is a test notification from AURA.' },
        data: { title: 'AURA notifications are working 🎉', body: 'This is a test notification from AURA.', url: '/' },
        webpush: {
          fcmOptions: { link: '/' },
          notification: { icon: '/icon-512.png', badge: '/icon-512.png' }
        }
      });

      const invalidCodes = new Set(['messaging/registration-token-not-registered', 'messaging/invalid-registration-token']);
      await Promise.all(result.responses.map((r, i) => {
        if (!r.success && invalidCodes.has(r.error?.code)) {
          return db.collection('users').doc(decoded.uid).collection('fcmTokens').doc(tokens[i].id).delete();
        }
        return null;
      }));

      return res.json({ ok: true, sent: result.successCount, failed: result.failureCount });
    }

    return res.status(400).json({ error: 'Unknown notification action.' });
  } catch (e) {
    return responseError(res, e);
  }
}
