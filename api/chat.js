import fs from "fs";
import path from "path";
import Groq from "groq-sdk";

// Init Groq
const groq = new Groq({ apiKey: process.env.GROQ_KEY });

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

    // 2. GROQ KEY CHECK
    if (!process.env.GROQ_KEY) {
      return res.status(500).json({ text: "ERROR: GROQ_KEY missing in Vercel Env Vars 😭" });
    }

    const { messages, prompt, attachment } = req.body || {};
    const lastUserPrompt = prompt || "";

    // 3. CACHE CHECK
    const cacheKey = JSON.stringify({ prompt: lastUserPrompt.trim().toLowerCase(), hasAttachment:!!attachment });
    if (responseCache.has(cacheKey)) {
      return res.status(200).json({ text: responseCache.get(cacheKey), cached: true });
    }

    // 4. SYSTEM PROMPT - MULTILINGUAL + MEMORY
    const systemInstruction = `You are AURA, an advanced AI assistant and coding partner.
Be warm, helpful, and conversational. Use emojis naturally when appropriate.
Auto-detect the user's language and reply in the same language fluently.
Remember context from previous messages and refer back to them.
Explain things extensively with ## Steps, **bold**, and clear code examples.
If user mentions an attachment, acknowledge it but explain you cannot view images directly.
End by asking if they want to dive deeper.`;

    // 5. BUILD CONVERSATION HISTORY - KEEP LAST 12 FOR MEMORY
    const recentMessages = Array.isArray(messages)? messages.slice(-12) : [];
    const groqMessages = [
      { role: 'system', content: systemInstruction },
     ...recentMessages
    ];

    // 6. HANDLE ATTACHMENT
    let userMessageContent = lastUserPrompt;
    
    if (attachment) {
      if (attachment.type?.startsWith('image/')) {
        // GROQ CANNOT SEE IMAGES - SO WE TELL USER
        userMessageContent = `[User uploaded an image: ${attachment.name}]\n${lastUserPrompt}\n\nNote: I can't directly view images yet. Please describe what's in the image or tell me what you need help with.`;
      
      } else if (attachment.type?.startsWith('video/')) {
        userMessageContent = `[User uploaded a video: ${attachment.name}]\n${lastUserPrompt}\n\nNote: I can't process videos yet. Please describe the video content.`;
      
      } else {
        // TEXT/CODE/PDF FILES - WE CAN READ
        const fileContent = attachment.content || "";
        const fileSnippet = fileContent.toString().slice(0, 5000);
        userMessageContent = `${lastUserPrompt}\n\n[Attached File: ${attachment.name || 'file'}]\n\`\n${fileSnippet}\n\`\``;
      }
    }

    groqMessages.push({ role: 'user', content: userMessageContent });

    // 7. CALL GROQ - BIG MODEL FOR SMART + MEMORY
    const chatCompletion = await groq.chat.completions.create({
      messages: groqMessages,
      model: "llama-3.3-70b-versatile", // Best Groq model for reasoning + memory
      temperature: 0.7,
      max_tokens: 3000,
    });

    const finalReply = chatCompletion.choices[0]?.message?.content || "My brain froze for a sec! 😭 Try again?";

    // 8. SAVE TO CACHE
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
