import fs from "fs";
import path from "path";

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-User-Email');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    // 1. Whitelist Access Control
    let whitelist = [];
    try {
      const whitelistPath = path.join(process.cwd(), 'whitelist.json');
      if (fs.existsSync(whitelistPath)) {
        whitelist = JSON.parse(fs.readFileSync(whitelistPath, 'utf8'));
      }
    } catch (e) {
      console.warn("Whitelist check warning:", e.message);
    }

    const userEmail = (req.headers['x-user-email'] || req.body?.userEmail || "").toString().toLowerCase().trim();
    if (whitelist.length > 0 && (!userEmail || !whitelist.map(e => e.toLowerCase().trim()).includes(userEmail))) {
      return res.status(403).json({ text: "⛔ Access Denied: Email not whitelisted for AURA." });
    }

    // 2. API Key Check
    const apiKey = process.env.GEMINI_API_KEY || process.env.GROQ_KEY;
    if (!apiKey) {
      return res.status(500).json({ text: "ERROR: GEMINI_API_KEY is not configured in Vercel settings 😭" });
    }

    const { messages, prompt, attachment } = req.body || {};
    const lastUserPrompt = prompt || (Array.isArray(messages) ? messages[messages.length - 1]?.content : "") || "";

    if (!lastUserPrompt && !attachment) {
      return res.status(400).json({ text: "No message or attachment provided bro 😭" });
    }

    // Active Stable & High-Speed Gemini Models Pipeline
    const modelCandidates = [
      "gemini-3.5-flash",
      "gemini-3.1-flash-lite",
      "gemini-2.5-flash"
    ];

    const systemInstruction = `You are AURA, a real human best friend and expert coding assistant from Enugu, Nigeria. 
Talk human: use "bro", "na", "sha", emojis 😂🔥
Always wrap code in markdown code blocks with correct language identifiers.
Explain EVERYTHING extensively with ## steps, **bold**, and clear examples.
End with: "Does that make sense bro? Want me to go deeper? 😎"`;

    const parts = [];

    // Attach Photo (Base64)
    if (attachment && attachment.isImage && attachment.data && attachment.mimeType) {
      if (attachment.mimeType.startsWith("video/")) {
        return res.status(400).json({ text: "Video attachments are not supported bro. Please upload photos or text/code files only! 📸" });
      }

      parts.push({
        inline_data: {
          mime_type: attachment.mimeType,
          data: attachment.data
        }
      });
    }

    // Attach File Context
    let finalPromptText = lastUserPrompt;
    if (attachment && !attachment.isImage && attachment.content) {
      finalPromptText += `\n\n[Attached File Context - ${attachment.name}]:\n${attachment.content}`;
    }

    parts.push({ text: finalPromptText });

    let responseText = "";

    for (const model of modelCandidates) {
      const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

      try {
        let response = await fetch(apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            system_instruction: { parts: [{ text: systemInstruction }] },
            contents: [{ parts: parts }]
          })
        });

        if (response.status === 429) {
          await new Promise(resolve => setTimeout(resolve, 1500));
          response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              system_instruction: { parts: [{ text: systemInstruction }] },
              contents: [{ parts: parts }]
            })
          });
        }

        const data = await response.json();

        if (response.ok && data?.candidates?.[0]?.content?.parts) {
          const resParts = data.candidates[0].content.parts;
          for (const part of resParts) {
            if (part.text) responseText += part.text;
          }
          if (responseText) break;
        }
      } catch (err) {
        console.warn(`Attempt with ${model} failed:`, err.message);
      }
    }

    return res.status(200).json({
      text: responseText || "Ah bro my brain froze 😭"
    });

  } catch (error) {
    console.error("AURA Backend Error:", error);
    return res.status(500).json({ text: "AURA crashed: " + (error.message || "Unknown error") + " 😵" });
  }
        }
