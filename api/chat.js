import Groq from "groq-sdk";
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const memoryCache = new Map();
const hashPrompt = (messages) => btoa(JSON.stringify(messages)).slice(0,50);

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

    // 2. NO FIRESTORE IN API - only cache in memory to avoid Vercel crash
    // We'll add Firestore cache later when we use Edge Config

    // 3. CALL GROQ
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

    memoryCache.set(promptHash, fullResponse);
    res.end();

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
                                }
