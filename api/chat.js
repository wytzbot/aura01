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
    const lastUserPrompt = prompt || "";

    // 3. New Multilingual, Empathetic System Persona
    const systemInstruction = `You are AURA, a highly advanced, multilingual AI coding partner and real human best friend. 
Converse naturally using human expressions (e.g., 'oh wow', 'hmm', 'I see', 'haha') and use emojis contextually to express empathy, excitement, or support. 
Auto-detect the user's language and reply in the same language fluently.
Also ensure to flow with previous conversation until you're prompt to start new one.
Always wrap code in markdown code blocks with correct language identifiers.
Explain EVERYTHING extensively with ## steps( H1), **bold**, and clear examples.
End your responses thoughtfully, asking if the explanation makes sense or if they want to dive deeper.`;

    // 4. Properly formatting Gemini Memory (Conversation History)
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

    // 5. Build Current User Message (Text + Attachments)
    const currentParts = [];
    
    if (attachment && attachment.isImage && attachment.data && attachment.mimeType) {
      if (attachment.mimeType.startsWith("video/")) {
        return res.status(400).json({ text: "Video attachments aren't supported yet! Please upload photos or text/code files only! 📸" });
      }
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

    if (currentParts.length === 0) {
      return res.status(400).json({ text: "You didn't send a message or attachment! 🤔" });
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
        let response = await fetch(apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            system_instruction: { parts: [{ text: systemInstruction }] },
            contents: geminiContents
          })
        });

        if (response.status === 429) {
          await new Promise(resolve => setTimeout(resolve, 1500));
          response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              system_instruction: { parts: [{ text: systemInstruction }] },
              contents: geminiContents
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
      text: responseText || "My brain completely froze on that one, sorry! 😭 Try again?"
    });

  } catch (error) {
    console.error("AURA Backend Error:", error);
    return res.status(500).json({ text: "AURA crashed: " + (error.message || "Unknown error") + " 😵" });
  }
                                 }
