import fs from "fs";
import path from "path";

export default async function handler(req, res) {
  // 8. Handle CORS and ensure JSON header is always set first
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-User-Email');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') {
    return res.status(200).json({ ok: true });
  }

  try {
    // 4. Email whitelist validation from whitelist.json
    let whitelist = [];
    try {
      const whitelistPath = path.join(process.cwd(), 'whitelist.json');
      if (fs.existsSync(whitelistPath)) {
        whitelist = JSON.parse(fs.readFileSync(whitelistPath, 'utf8'));
      }
    } catch (e) {
      console.warn("Whitelist parsing warning:", e.message);
    }

    const userEmail = (req.headers['x-user-email'] || req.body?.userEmail || "").toString().toLowerCase().trim();
    if (whitelist.length > 0 && (!userEmail || !whitelist.map(e => e.toLowerCase().trim()).includes(userEmail))) {
      return res.status(403).json({ text: "⛔ Access Denied: Your email address is not whitelisted for AURA." });
    }

    // 1. Validate API Key using process.env.GEMINI_API_KEY
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ text: "ERROR: GEMINI_API_KEY is missing in Vercel Environment Variables 😭" });
    }

    const { messages, prompt, attachment } = req.body || {};
    const lastUserPrompt = prompt || "";

    // 6. Enforce exact required System Prompt
    const systemInstruction = "You are AURA, a highly advanced, multilingual AI coding partner and real human best friend from Enugu. Converse naturally with emojis. Auto-detect language. Explain with ## steps and **bold**. If user uploads image, describe it first.";

    // 5. Limit chat history to the last 8 messages to prevent token overflow (400 errors)
    const geminiContents = [];
    if (Array.isArray(messages) && messages.length > 0) {
      const recentMessages = messages.slice(-8);
      for (const msg of recentMessages) {
        if (!msg.content) continue;
        geminiContents.push({
          role: msg.role === 'user' ? 'user' : 'model',
          parts: [{ text: msg.content }]
        });
      }
    }

    // Build parts for the current message
    const currentParts = [];

    // 2. Support image uploads & strip base64 data header prefix safely
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

    // 3. Support text file uploads: truncate or slice to first 5,000 characters
    let finalPromptText = lastUserPrompt;
    if (attachment && !attachment.isImage && attachment.content) {
      const fileSnippet = attachment.content.toString().slice(0, 5000);
      finalPromptText += `\n\n[Attached File Content Snippet - ${attachment.name || 'file'}]:\n${fileSnippet}`;
    }

    if (finalPromptText) {
      currentParts.push({ text: finalPromptText });
    }

    if (currentParts.length > 0) {
      geminiContents.push({
        role: 'user',
        parts: currentParts
      });
    }

    // 1. Use Google Gemini 1.5 Flash API via REST fetch
    const model = "gemini-1.5-flash";
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
      const errorMessage = data?.error?.message || `Gemini API status ${response.status}`;
      return res.status(response.status || 500).json({ text: `Gemini Error: ${errorMessage}` });
    }

    let responseText = "";
    if (data?.candidates?.[0]?.content?.parts) {
      for (const part of data.candidates[0].content.parts) {
        if (part.text) responseText += part.text;
      }
    }

    // 7. Always return JSON, never HTML
    return res.status(200).json({ text: responseText || "My brain froze for a sec bro! 😭 Try sending that again." });

  } catch (error) {
    console.error("AURA Backend Critical Crash:", error);
    // 7. Ensure crash handlers also return valid JSON matching expected structure
    return res.status(500).json({ text: "AURA encountered an internal error: " + (error.message || "Unknown error") + " 😵" });
  }
      }
