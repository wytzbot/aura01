import Groq from "groq-sdk";
import { GoogleGenerativeAI } from "@google/generative-ai";

const groq = new Groq({ apiKey: process.env.GROQ_KEY });
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Cache persists in the "warm" instance of the Vercel function
const responseCache = new Map();
const MAX_CACHE_SIZE = 50;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).json({ ok: true });

  try {
    const { messages, prompt, attachment } = req.body;
    const userPrompt = prompt || "";
    
    // FIX 1: Unique Cache Key 
    // We include a hash of the last 2 messages so the AI doesn't repeat the same answer 
    // for different parts of the conversation.
    const historyString = JSON.stringify(messages?.slice(-2) || "");
    const cacheKey = Buffer.from(`${historyString}_${userPrompt}_${attachment?.name || ''}`).toString('base64').slice(0, 100);

    if (responseCache.has(cacheKey)) {
      console.log("Serving from Cache");
      return res.status(200).json({ text: responseCache.get(cacheKey), cached: true });
    }

    let visualAnalysis = "";

    // 2. Vision Pipeline
    if (attachment && attachment.base64) {
      try {
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        const result = await model.generateContent([
          "Technical analysis of this image. If code is present, transcribe it. If a UI is present, describe the structure. Be extremely precise for a developer.",
          { inlineData: { data: attachment.base64, mimeType: attachment.mimeType } }
        ]);
        visualAnalysis = `[CONTEXT: THE USER ATTACHED AN IMAGE. Analysis: ${result.response.text()}]`;
      } catch (e) {
        console.error("Vision Error:", e);
        visualAnalysis = "[Image attached but vision engine was busy]";
      }
    }

    // 3. Smart History Assembly
    // We ensure the system instruction is the first message
    const systemInstruction = `You are AURA, an expert Full-Stack Developer.
RULES:
1. RESPONSE FORMAT: Always use professional Markdown. 
2. CODE BLOCKS: Use specific language tags. For React/Frontend, ALWAYS use \`\`\`jsx or \`\`\`tsx code blocks.
3. MEMORY: You are in a continuous conversation. Reference previous steps if the user asks "how do I do that?" or "fix the code above".
4. VISION: If [CONTEXT] is provided, it describes an image the user sent. Use it to debug or explain.
5. BRAVITY: Be concise. Explain 'why' only if requested.
6. TONE: You are friendly and users best friend.Respond in human tone and expressions to situations backed up by emojis in necessary place and time`;

    const recentHistory = Array.isArray(messages) ? messages : [];

    // assemble the final payload for Groq
    const groqMessages = [
      { role: "system", content: systemInstruction },
      ...recentHistory, // This is the memory
      { role: "user", content: visualAnalysis ? `${visualAnalysis}\n\n${userPrompt}` : userPrompt }
    ];

    // 4. Groq Execution
    const completion = await groq.chat.completions.create({
      messages: groqMessages,
      model: "llama-3.3-70b-versatile",
      temperature: 0.3, // Lower temperature for more consistent coding logic
      max_tokens: 4000,
    });

    const aiResponse = completion.choices[0]?.message?.content || "I'm having trouble thinking. Please try that again.";

    // 5. Update Cache
    if (responseCache.size >= MAX_CACHE_SIZE) {
      const firstKey = responseCache.keys().next().value;
      responseCache.delete(firstKey);
    }
    responseCache.set(cacheKey, aiResponse);

    return res.status(200).json({ text: aiResponse, cached: false });

  } catch (error) {
    console.error("Handler Error:", error);
    return res.status(500).json({ text: "AURA_ERROR: " + error.message });
  }
                                   }
