import Groq from "groq-sdk";
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const memoryCache = new Map(); // RAM cache

function hashPrompt(messages) {
  return btoa(JSON.stringify(messages)).slice(0,50); // simple hash
}

export default async function handler(req, res) {
  if (req.method!== 'POST') return res.status(405).json({ error: 'POST only' });
  const { messages } = req.body;
  const promptHash = hashPrompt(messages);

  res.setHeader('Content-Type', 'text/plain');
  res.setHeader('Transfer-Encoding', 'chunked');

  try {
    // 1. MEMORY CACHE
    if (memoryCache.has(promptHash)) {
      res.setHeader('X-Cache', 'HIT');
      res.write(memoryCache.get(promptHash));
      return res.end();
    }

    // 2. FIRESTORE CACHE
    const { initializeApp } = await import("firebase/app");
    const { getFirestore, doc, getDoc, setDoc } = await import("firebase/firestore");
    const app = initializeApp({
      apiKey: "AIzaSyDTAqb0waoaoSDrwOa2UXRjwl8wmSyXUs0",
      projectId: "my-wyticle-id",
    });
    const db = getFirestore(app);
    const cacheRef = doc(db, "cache", promptHash);
    const cacheSnap = await getDoc(cacheRef);

    if (cacheSnap.exists()) {
      res.setHeader('X-Cache', 'HIT');
      const cached = cacheSnap.data().response;
      memoryCache.set(promptHash, cached);
      res.write(cached);
      return res.end();
    }

    // 3. GROQ CALL
    res.setHeader('X-Cache', 'MISS');
    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: messages,
      stream: true,
    });

    let fullResponse = '';
    for await (const chunk of completion) {
      const content = chunk.choices[0]?.delta?.content || '';
      fullResponse += content;
      res.write(content);
    }

    // 4. SAVE TO CACHE
    memoryCache.set(promptHash, fullResponse);
    await setDoc(cacheRef, { response: fullResponse, created: Date.now() });
    res.end();

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
    }
