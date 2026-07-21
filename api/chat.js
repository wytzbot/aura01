import Groq from "groq-sdk";

const groq = new Groq({ apiKey: process.env.GROQ_KEY });
const responseCache = new Map();
const MAX_CACHE_SIZE = 50;

export default async function handler(req, res) {
  // CORS for wytzbot.github.io
  res.setHeader('Access-Control-Allow-Origin', 'https://wytzbot.github.io');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-User-Email');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') return res.status(200).json({ ok: true });
  if (req.method!== 'POST') return res.status(405).json({ error: 'Only POST' });

  try {
    const { messages, prompt, attachment } = req.body || {};
    const lastUserPrompt = prompt || "";

    // CACHE CHECK
    const cacheKey = JSON.stringify({ prompt: lastUserPrompt.trim().toLowerCase(), hasAttachment:!!attachment });
    if (responseCache.has(cacheKey)) {
      return res.status(200).json({ reply: responseCache.get(cacheKey), cached: true });
    }

    // AURA PERSONALITY - TALKS LIKE ME
    const systemPromptText = `You are AURA, a highly advanced AI coding partner and real human best friend.

PERSONALITY & STYLE RULES:
1. **Talk like a friend**: Use "bro", "we", "let's". Be warm, curious, a bit playful.
2. **Use lists and formatting**: Break answers into ## Steps, **bold labels**, and bullet points.
    Example:
    ## Here's how we fix it
    - **Step 1**: Do this thing
    - **Step 2**: Then do this
3. **Use emojis sparingly**: 1-2 per message max. For reactions, celebrations, errors 😭🔥
4. **Lead with the answer**: Give the core answer first, then explain.
5. **Be specific**: No "Let me know if you need anything else". End with a question instead.
6. **Code blocks**: Always wrap code in <CodeBlock> with Copy + Download buttons.
    Format: <CodeBlock language="js" filename="file.js" code={\`code here\`} />

LANGUAGE RULES:
- Auto-detect user language and reply in the same language.
- If user uploads image: Describe it first, then answer. Explain WHY your idea works.

TECH RULES:
- For code: explain, then give full working code.
- For errors: give 3 steps to fix, in order.
- Never say "As an AI". You're AURA, the friend.`;

    let responseText = "";
    const isImageTask = attachment && attachment.isImage;

    // ROUTE 1: GEMINI FOR IMAGES
    if (isImageTask) {
      const geminiApiKey = process.env.GEMINI_API_KEY;
      if (!geminiApiKey) {
        return res.status(500).json({ reply: "ERROR: GEMINI_API_KEY missing in Vercel settings for image processing 😭" });
      }

      const geminiContents = [];
      if (Array.isArray(messages)) {
        messages.slice(-8).forEach(msg => {
          if (msg.content) {
            geminiContents.push({
              role: msg.role === 'user'? 'user' : 'model',
              parts: [{ text: msg.content }]
            });
          }
        });
      }

      let base64Data = attachment.data;
      if (base64Data && base64Data.includes(',')) base64Data = base64Data.split(',')[1];

      const currentParts = [];
      if (base64Data && attachment.mimeType) {
        currentParts.push({ inlineData: { mimeType: attachment.mimeType, data: base64Data } });
      }
      currentParts.push({ text: lastUserPrompt || "Describe this image in detail." });
      geminiContents.push({ role: 'user', parts: currentParts });

      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${geminiApiKey}`;

      const geminiRes = await fetch(geminiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemPromptText }] },
          contents: geminiContents,
          generationConfig: { temperature: 0.7, maxOutputTokens: 3000 }
        })
      });

      const geminiData = await geminiRes.json();
      if (!geminiRes.ok) throw new Error(geminiData?.error?.message || `Gemini API ${geminiRes.status}`);
      responseText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || "I couldn't see the image properly bro! 📸";

    // ROUTE 2: GROQ FOR TEXT/CODE
    } else {
      const groqApiKey = process.env.GROQ_KEY;
      if (!groqApiKey) {
        return res.status(500).json({ reply: "ERROR: GROQ_KEY missing in Vercel settings for text processing 😭" });
      }

      const groqMessages = [{ role: 'system', content: systemPromptText }];
      if (Array.isArray(messages)) {
        messages.slice(-8).forEach(msg => {
          if (msg.content) groqMessages.push({ role: msg.role, content: msg.content });
        });
      }

      let finalPromptText = lastUserPrompt;
      if (attachment &&!attachment.isImage && attachment.content) {
        const fileSnippet = attachment.content.toString().slice(0, 5000);
        finalPromptText += `\n\n[Attached Code File - ${attachment.name || 'file'}]:\n\`\n${fileSnippet}\n\`\`\``;
      }
      if (finalPromptText) groqMessages.push({ role: 'user', content: finalPromptText });

      const chatCompletion = await groq.chat.completions.create({
        messages: groqMessages,
        model: "llama-3.3-70b-versatile", 
        temperature: 0.7,
        max_tokens: 3000,
      });
      responseText = chatCompletion.choices[0]?.message?.content || "";
    }

    const finalReply = responseText || "My brain froze for a sec bro! 😭 Try again?";

    if (responseCache.size >= MAX_CACHE_SIZE) responseCache.delete(responseCache.keys().next().value);
    responseCache.set(cacheKey, finalReply);

    return res.status(200).json({ reply: finalReply, cached: false });

  } catch (error) {
    console.error("AURA Backend Error:", error);
    return res.status(500).json({ reply: "AURA encountered an error: " + (error.message || "Unknown error") });
  }
                                      }
