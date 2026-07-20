import fs from "fs";
import path from "path";

// Simple in-memory cache to reduce duplicate API calls and save quota
const responseCache = new Map();
const MAX_CACHE_SIZE = 50;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-User-Email');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') return res.status(200).json({ ok: true });

  try {
    // 1. Whitelist Verification
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
    if (whitelist.length > 0 && (!userEmail || !whitelist.map(e => e.toLowerCase().trim()).includes(userEmail))) {
      return res.status(403).json({ text: "⛔ Access Denied: Email address is not whitelisted for AURA." });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ text: "ERROR: GEMINI_API_KEY missing in Vercel settings 😭" });
    }

    const { messages, prompt, attachment } = req.body || {};
    const lastUserPrompt = prompt || "";

    // 2. Check Cache Hit
    const cacheKey = JSON.stringify({ prompt: lastUserPrompt.trim().toLowerCase(), hasAttachment: !!attachment });
    if (responseCache.has(cacheKey)) {
      return res.status(200).json({ text: responseCache.get(cacheKey), cached: true });
    }

    const systemInstruction = "You are AURA, a highly advanced, multilingual AI coding partner and real human best friend. Converse naturally using emojis contextually. Auto-detect language. Explain things extensively using ## steps and **bold** formatting. If user uploads an image, describe it first.";

    // 3. Limit history to last 8 messages to prevent token overflow
    const geminiContents = [];
    if (Array.isArray(messages) && messages.length > 0) {
      const recent = messages.slice(-8);
      for (const msg of recent) {
        if (!msg.content) continue;
        geminiContents.push({
          role: msg.role === 'user' ? 'user' : 'model',
          parts: [{ text: msg.content }]
        });
      }
    }

    const currentParts = [];

    // 4. Safely handle image uploads (strip base64 header prefix)
    if (attachment && attachment.isImage && attachment.data && attachment.mimeType) {
      let base64Data = attachment.data;
      if (base64Data.includes(',')) {
        base64Data = base64Data.split(',')[1];
      }
      currentParts.push({
        inline_data: {
          mime_type: attachment.mimeType,
          data: base64Data
        }
      });
    }

    // 5. Handle code/text file attachments (slice first 5000 chars)
    let finalPromptText = lastUserPrompt;
    if (attachment && !attachment.isImage && attachment.content) {
      const fileSnippet = attachment.content.toString().slice(0, 5000);
      finalPromptText += `\n\n[Attached Code File - ${attachment.name || 'file'}]:\n\`\`\`\n${fileSnippet}\n\`\`\``;
    }

    if (finalPromptText) {
      currentParts.push({ text: finalPromptText });
    }

    if (currentParts.length > 0) {
      geminiContents.push({ role: 'user', parts: currentParts });
    }

    // 6. Use active Gemini 3.5 Flash Model
    const model = "gemini-3.5-flash";
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemInstruction }] },
        contents: geminiContents
      })
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data?.error?.message || `Gemini status ${response.status}`);
    }

    let responseText = "";
    if (data?.candidates?.[0]?.content?.parts) {
      for (const part of data.candidates[0].content.parts) {
        if (part.text) responseText += part.text;
      }
    }

    const finalReply = responseText || "My brain froze for a sec bro! 😭 Try again?";

    // Save to Cache
    if (responseCache.size >= MAX_CACHE_SIZE) {
      const oldestKey = responseCache.keys().next().value;
      responseCache.delete(oldestKey);
    }
    responseCache.set(cacheKey, finalReply);

    return res.status(200).json({ text: finalReply, cached: false });

  } catch (error) {
    console.error("AURA Backend Error:", error);
    return res.status(500).json({ text: "AURA encountered an error: " + (error.message || "Unknown error") });
  }
}
