export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://wytzbot.github.io');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-User-Email');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') return res.status(200).json({ ok: true });
  if (req.method!== 'POST') return res.status(405).json({ error: 'Only POST' });

  try {
    const { prompt, messages, attachment } = req.body || {};
    const lastUserPrompt = (prompt || "").trim();

    if (!lastUserPrompt) {
      return res.status(400).json({ reply: "ERROR: Empty prompt sent from frontend" });
    }

    const systemPromptText = `You are AURA, a highly advanced AI coding partner and real human best friend.
1. **Talk like a friend**: Use "bro", "we", "let's". Be warm, playful.
2. **Use lists**: ## Steps, **bold labels**, bullet points.
3. **Use emojis sparingly**: 1-2 max 😭🔥
4. **Code blocks**: Wrap ALL code in <CodeBlock language="js" filename="file.js" code={\`code\`} />`;

    const isImageTask = attachment && attachment.isImage;

    // ROUTE 1: GEMINI FOR IMAGES
    if (isImageTask) {
      if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY missing in Vercel");
      
      let base64Data = attachment.data;
      if (base64Data && base64Data.includes(',')) base64Data = base64Data.split(',')[1];

      const geminiBody = {
        system_instruction: { parts: [{ text: systemPromptText }] },
        contents: [{ role: 'user', parts: [
          { inlineData: { mimeType: attachment.mimeType, data: base64Data } },
          { text: lastUserPrompt }
        ] }]
      };

      const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${process.env.GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(geminiBody)
      });
      const data = await geminiRes.json();
      if (!geminiRes.ok) throw new Error(data.error?.message || "Gemini failed");
      return res.status(200).json({ reply: data.candidates[0].content.parts[0].text });

    // ROUTE 2: GROQ FOR TEXT - USING FETCH
    } else {
      if (!process.env.GROQ_KEY) throw new Error("GROQ_KEY missing in Vercel");

      const groqBody = {
        model: "llama-3.3-70b-versatile",
        messages: [
          { role: 'system', content: systemPromptText },
          { role: 'user', content: lastUserPrompt }
        ],
        temperature: 0.9,
        max_tokens: 2000,
        stream: false
      };

      const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.GROQ_KEY}`
        },
        body: JSON.stringify(groqBody)
      });

      const data = await groqRes.json();
      if (!groqRes.ok) throw new Error(data.error?.message || "Groq failed");
      return res.status(200).json({ reply: data.choices[0].message.content });
    }

  } catch (error) {
    console.error("AURA BACKEND CRASH:", error);
    return res.status(500).json({ reply: "AURA BACKEND ERROR: " + error.message });
  }
        }
