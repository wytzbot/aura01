import Groq from "groq-sdk";

const groq = new Groq({ apiKey: process.env.GROQ_KEY });

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://wytzbot.github.io');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-User-Email');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') return res.status(200).json({ ok: true });
  if (req.method!== 'POST') return res.status(405).json({ error: 'Only POST' });

  try {
    const body = req.body || {};
    console.log("BODY RECEIVED:", body); // CHECK VERCEL LOGS
    
    const { messages, prompt, attachment } = body;
    const lastUserPrompt = (prompt || "").trim();

    if (!lastUserPrompt) {
      return res.status(400).json({ reply: "ERROR: Frontend sent empty prompt. Check index.js send function." });
    }

    const systemPromptText = `You are AURA. Reply in lists with ## Steps and **bold**. Be friendly.`;

    let responseText = "";
    const isImageTask = attachment && attachment.isImage;

    // ROUTE 1: GEMINI FOR IMAGES
    if (isImageTask) {
      if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is undefined in Vercel");
      
      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${process.env.GEMINI_API_KEY}`;
      const geminiRes = await fetch(geminiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemPromptText }] },
          contents: [{ role: 'user', parts: [{ text: lastUserPrompt }] }],
        })
      });
      const geminiData = await geminiRes.json();
      if (!geminiRes.ok) throw new Error(JSON.stringify(geminiData));
      responseText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text;

    // ROUTE 2: GROQ FOR TEXT/CODE
    } else {
      if (!process.env.GROQ_KEY) throw new Error("GROQ_KEY is undefined in Vercel");

      const chatCompletion = await groq.chat.completions.create({
        messages: [{ role: 'system', content: systemPromptText }, { role: 'user', content: lastUserPrompt }],
        model: "llama-3.3-70b-versatile", 
        temperature: 0.9,
        max_tokens: 1000,
      });
      responseText = chatCompletion.choices[0]?.message?.content;
    }

    if (!responseText) throw new Error("AI returned empty response");
    return res.status(200).json({ reply: responseText });

  } catch (error) {
    console.error("FULL ERROR:", error);
    // SEND THE REAL ERROR TO FRONTEND
    return res.status(500).json({ reply: "AURA ERROR: " + error.message });
  }
}
