import Groq from "groq-sdk";
import { GoogleGenerativeAI } from "@google/generative-ai";

// Initialize SDKs
const groq = new Groq({ apiKey: process.env.GROQ_KEY });
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const responseCache = new Map();
const MAX_CACHE_SIZE = 50;

export default async function handler(req, res) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).json({ ok: true });
  if (req.method !== 'POST') return res.status(405).json({ error: "Method not allowed" });

  try {
    const { messages, prompt, attachment } = req.body || {};
    const userPrompt = prompt || "";

    // 1. Validating API Keys
    if (!process.env.GROQ_KEY || !process.env.GEMINI_API_KEY) {
      return res.status(500).json({ text: "⚠️ Server Configuration Error: API Keys missing." });
    }

    // 2. Cache Check (Fastest Response)
    const cacheKey = Buffer.from(`${userPrompt}_${attachment?.name || ''}`).toString('base64');
    if (responseCache.has(cacheKey)) {
      return res.status(200).json({ text: responseCache.get(cacheKey), cached: true });
    }

    let visualAnalysis = "";

    // 3. GEMINI VISION PIPELINE (Only if attachment exists)
    if (attachment) {
      try {
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        
        if (attachment.isImage) {
          // Process Image with Gemini
          const result = await model.generateContent([
            "Analyze this image in detail for a coding assistant. Describe code, UI elements, errors, or logic shown. Be concise but technical.",
            { inlineData: { data: attachment.base64, mimeType: attachment.mimeType } }
          ]);
          visualAnalysis = `[VISUAL ANALYSIS: ${result.response.text()}]`;
        } else if (attachment.content) {
          // Process Large Files with Gemini (Handles much larger context than Llama)
          const result = await model.generateContent([
            `Analyze this file: ${attachment.name}. Provide a technical summary of its purpose and key logic. Content: ${attachment.content.slice(0, 20000)}`
          ]);
          visualAnalysis = `[FILE SUMMARY for ${attachment.name}: ${result.response.text()}]`;
        }
      } catch (geminiErr) {
        console.error("Gemini Vision Error:", geminiErr);
        visualAnalysis = "[Note: Visual processing failed, proceeding with text only]";
      }
    }

    // 4. GROQ BRAIN PIPELINE (Llama 3.3 70B for the final response)
    const systemInstruction = `You are AURA, an elite AI coding partner. 
- Personality: Professional, helpful, concise. Use Markdown (tables, bold, code blocks).
- Knowledge: Expert in all frameworks.
- Context: If visual analysis is provided, treat it as your own vision. 
- Language: Always reply in the same language as the user.`;

    const recentMessages = Array.isArray(messages) ? messages.slice(-10) : [];
    
    // Inject the visual analysis into the current prompt
    const finalUserContent = visualAnalysis 
      ? `${visualAnalysis}\n\nUser Question: ${userPrompt}`
      : userPrompt;

    const groqMessages = [
      { role: 'system', content: systemInstruction },
      ...recentMessages,
      { role: 'user', content: finalUserContent }
    ];

    const chatCompletion = await groq.chat.completions.create({
      messages: groqMessages,
      model: "llama-3.3-70b-versatile", // Extremely fast 70B model
      temperature: 0.5, // Lower temp = faster, more accurate coding logic
      max_tokens: 4000,
      stream: false,
    });

    const finalReply = chatCompletion.choices[0]?.message?.content || "I couldn't process that. Please try again.";

    // 5. Update Cache
    if (responseCache.size >= MAX_CACHE_SIZE) responseCache.delete(responseCache.keys().next().value);
    responseCache.set(cacheKey, finalReply);

    return res.status(200).json({ text: finalReply, cached: false });

  } catch (error) {
    console.error("AURA Logic Error:", error);
    return res.status(500).json({ text: `🚀 AURA Engine Error: ${error.message}` });
  }
  }
