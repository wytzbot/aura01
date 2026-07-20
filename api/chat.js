import fs from "fs";
import path from "path";

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-User-Email');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
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
      return res.status(403).json({ text: "⛔ Access Denied: Email not whitelisted for AURA." });
    }

    const apiKey = process.env.GEMINI_API_KEY || process.env.GROQ_KEY;
    if (!apiKey) {
      return res.status(500).json({ text: "ERROR: GEMINI_API_KEY missing in Vercel settings 😭" });
    }

    const { messages, prompt, attachment } = req.body || {};
    const lastUserPrompt = prompt || "";

    const systemInstruction = `You are AURA, a multilingual AI best friend and expert coding partner. Converse naturally using human expressions and emojis contextually. Auto-detect language and reply in the same language. Wrap code in markdown blocks. Explain everything extensively with steps and examples.`;

    const geminiContents = [];
    if (Array.isArray(messages)) {
      for (const msg of messages) {
        if (!msg.content) continue;
        geminiContents.push({
          role: msg.role === 'user' ? 'user' : 'model',
          parts: [{ text: msg.content }]
        });
      }
    }

    const currentParts = [];
    if (attachment && attachment.isImage && attachment.data && attachment.mimeType) {
      currentParts.push({
        inline_data: {
          mime_type: attachment.mimeType,
          data: attachment.data
        }
      });
    }

    let finalPromptText = lastUserPrompt;
    if (attachment && !attachment.isImage && attachment.content) {
      finalPromptText += `\n\n[Attached File Context - ${attachment.name}]:\n${attachment.content}`;
    }

    if (finalPromptText) {
      currentParts.push({ text: finalPromptText });
    }

    geminiContents.push({
      role: 'user',
      parts: currentParts
    });

    const modelCandidates = ["gemini-3.5-flash", "gemini-3.1-flash-lite", "gemini-2.5-flash"];
    let responseText = "";

    for (const model of modelCandidates) {
      const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      try {
        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            system_instruction: { parts: [{ text: systemInstruction }] },
            contents: geminiContents
          })
        });

        const data = await response.json();
        if (response.ok && data?.candidates?.[0]?.content?.parts) {
          for (const part of data.candidates[0].content.parts) {
            if (part.text) responseText += part.text;
          }
          if (responseText) break;
        }
      } catch (err) {
        console.warn(`Model attempt failed:`, err.message);
      }
    }

    return res.status(200).json({ text: responseText || "My brain froze for a sec! 😭 Try again?" });
  } catch (error) {
    return res.status(500).json({ text: "AURA crashed: " + error.message });
  }
        }
