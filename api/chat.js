import Groq from "groq-sdk";
import fs from "fs";
import path from "path";

export default async function handler(req, res) {
  // Enforce JSON headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-User-Email');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    // 1. Safe Whitelist Loading (Prevents ESM import crash)
    let whitelist = [];
    try {
      const whitelistPath = path.join(process.cwd(), 'whitelist.json');
      if (fs.existsSync(whitelistPath)) {
        const fileData = fs.readFileSync(whitelistPath, 'utf8');
        whitelist = JSON.parse(fileData);
      }
    } catch (e) {
      console.warn("Whitelist file read warning:", e.message);
    }

    // 2. Email Whitelist Verification
    const userEmail = (req.headers['x-user-email'] || req.body?.userEmail || "").toString().toLowerCase().trim();
    
    if (whitelist.length > 0 && (!userEmail || !whitelist.map(e => e.toLowerCase().trim()).includes(userEmail))) {
      return res.status(403).json({ text: "⛔ Access Denied: Your email address is not whitelisted for AURA AI." });
    }

    // 3. Check GROQ API Key
    if (!process.env.GROQ_KEY) {
      return res.status(500).json({ text: "ERROR: GROQ_KEY missing in Vercel Settings > Environment Variables 😭" });
    }

    const groq = new Groq({ apiKey: process.env.GROQ_KEY });

    const { messages } = req.body || {};
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ text: "No valid messages sent bro" });
    }

    const systemMessage = {
      role: 'system', 
      content: `You are AURA, a real human best friend from Enugu, Nigeria. 
Talk human: use "bro", "na", "sha", emojis 😂🔥
Explain EVERYTHING extensively with ## steps, **bold**, and examples.
Auto-detect language and reply in same language.
End with: "Does that make sense bro? Want me to go deeper? 😎"`
    };

    const modelList = ["llama-3.3-70b-versatile", "llama-3.1-8b-instant", "mixtral-8x7b-32768"];
    let responseText;
    
    for (const model of modelList) {
      try {
        const chatCompletion = await groq.chat.completions.create({
          messages: [systemMessage, ...messages],
          model: model,
          temperature: 0.85,
          max_tokens: 3000,
        });
        responseText = chatCompletion.choices[0]?.message?.content;
        if (responseText) break;
      } catch (e) {
        if (!e.message.includes("rate_limit") && !e.message.includes("quota")) throw e;
      }
    }

    return res.status(200).json({ text: responseText || "Ah bro my brain froze 😭" });

  } catch (error) {
    console.error("AURA Backend Crash:", error);
    return res.status(500).json({ text: "AURA crashed: " + (error.message || "Unknown error") + " 😵" });
  }
}
