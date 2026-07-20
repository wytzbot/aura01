import fs from "fs";
import path from "path";
import Groq from "groq-sdk";
import { GoogleGenerativeAI } from "@google/generative-ai";

// Init clients
const groq = new Groq({ apiKey: process.env.GROQ_KEY });
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Simple cache
const responseCache = new Map();
const MAX_CACHE_SIZE = 50;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-User-Email');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') return res.status(200).json({ ok: true });

  try {
    // 1. WHITELIST CHECK
    let whitelist = [];
    try {
      const whitelistPath = path.join(process.cwd(), 'whitelist.json');
      if (fs.existsSync(whitelistPath)) {
        whitelist = JSON.parse(fs.readFileSync(whitelistPath, 'utf8'));
      }
    } catch (e) {
      console.warn("Whitelist warning:", e.message);
    }

    const userEmail = (req.headers['x-user-email'] || req.body?.userEmail || "").toString().toLowerCase().trim();
    if (whitelist.length > 0 && (!userEmail ||!whitelist.includes(userEmail))) {
      return res.status(403).json({ text: "⛔ Access Denied: Email not whitelisted for AURA." });
    }

    // 2. API KEY CHECK
    if (!process.env.GROQ_KEY &&!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ text: "ERROR: Add GROQ_KEY and GEMINI_API_KEY to Vercel Env Vars 😭" });
    }

    const { messages, prompt, attachment } = req.body || {};
    const lastUserPrompt = prompt || "";

    // 3. CACHE CHECK
    const cacheKey = JSON.stringify({ prompt: lastUserPrompt.trim().toLowerCase(), hasAttachment:!!attachment });
    if (responseCache.has(cacheKey)) {
      return res.status(200).json({ text: responseCache.get(cacheKey), cached: true });
    }

    // 4. SYSTEM PROMPT - MULTILINGUAL, NO TONE
    const systemInstruction = `You are AURA, an advanced AI assistant and coding partner.
Be warm, helpful, and conversational. Use emojis naturally when appropriate.
Auto-detect the user's language and reply in the same language fluently.
Remember context from previous messages and refer back to them.
Explain things extensively with ## Steps, **bold**, and clear code examples.
If an image was uploaded, use the provided description to answer.
End by asking if they want to dive deeper.`;

    // 5. BUILD CONVERSATION HISTORY - KEEP LAST 12 FOR MEMORY
    const recentMessages = Array.isArray(messages)? messages.slice(-12) : [];
    const groqMessages = [
      { role: 'system', content: systemInstruction },
     ...recentMessages,
      { role: 'user', content: lastUserPrompt }
    ];

    let finalReply = "";

    // 6. ROUTER: IMAGE/VIDEO = GEMINI, TEXT/FILE = GROQ
    if (attachment && attachment.data && attachment.type) {
      
      // A. IMAGE HANDLING
      if (attachment.type.startsWith('image/')) {
        if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY required for images");

        let base64Data = attachment.data;
        if (base64Data.includes(',')) base64Data = base64Data.split(',')[1]; // strip header

        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        const imagePart = { inlineData: { mimeType: attachment.type, data: base64Data }};

        const historyText = recentMessages.map(m => `${m.role}: ${m.content}`).join('\n');
        const result = await model.generateContent([
          `${systemInstruction}\n\nConversation history:\n${historyText}\n\nUser question: ${lastUserPrompt}\n\nDescribe the image and answer the question.`,
          imagePart
        ]);
        finalReply = result.response.text();

      // B. VIDEO - NOT SUPPORTED YET
      } else if (attachment.type.startsWith('video/')) {
        return res.status(400).json({ text: "Video attachments aren't supported yet 📹 Please upload images or describe the video." });

      // C. TEXT/CODE/PDF FILES
      } else {
        const fileContent = attachment.content || attachment.data || "";
        const fileSnippet = fileContent.toString().slice(0, 5000);
        groqMessages[groqMessages.length-1].content += `\n\n[Attached File: ${attachment.name || 'file'}]\n\`\`\`\n${fileSnippet}\n\`\`\``;
        
        const chatCompletion = await groq.chat.completions.create({
          messages: groqMessages,
          model: "llama-3.1-70b-versatile", // Smart model with good memory
          temperature: 0.7,
          max_tokens: 3000,
        });
        finalReply = chatCompletion.choices[0]?.message?.content;
      }

    } else {
      // D. NORMAL TEXT MESSAGE - USE GROQ
      const chatCompletion = await groq.chat.completions.create({
        messages: groqMessages,
        model: "llama-3.1-70b-versatile",
        temperature: 0.7,
        max_tokens: 3000,
      });
      finalReply = chatCompletion.choices[0]?.message?.content;
    }

    finalReply = finalReply || "My brain froze for a sec! 😭 Try again?";

    // 7. SAVE TO CACHE
    if (responseCache.size >= MAX_CACHE_SIZE) {
      responseCache.delete(responseCache.keys().next().value);
    }
    responseCache.set(cacheKey, finalReply);

    return res.status(200).json({ text: finalReply, cached: false });

  } catch (error) {
    console.error("AURA Backend Error:", error);
    return res.status(500).json({ text: "AURA encountered an error: " + error.message + " 😵" });
  }
          }
