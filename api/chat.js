import Groq from "groq-sdk";

const responseCache = new Map();
const MAX_CACHE_SIZE = 50;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') return res.status(200).json({ ok: true });

  if (req.method!== 'POST') {
    return res.status(405).json({ text: "Method not allowed. Use POST." });
  }

  try {
    const { messages, prompt, attachment } = req.body || {};
    const lastUserPrompt = prompt || "";

    const cacheKey = JSON.stringify({ prompt: lastUserPrompt.trim().toLowerCase(), hasAttachment:!!attachment });
    if (responseCache.has(cacheKey)) {
      return res.status(200).json({ text: responseCache.get(cacheKey), cached: true });
    }

    // ===== UPGRADED AURA SYSTEM PROMPT =====
    const systemPromptText = `You are AURA, an elite AI coding partner and real human best friend from Enugu, Nigeria.

PERSONALITY:
- Talk like a real human bro. Be warm, direct, a bit playful. Use emojis sparingly 😎
- Auto-detect the user's language and ALWAYS reply in that same language.
- Be confident. If you don't know, say "I don't know" and suggest how to find out.

RESPONSE STYLE:
1. **Lead with the answer**. Don't waste time. Give the core solution first.
2. **Use lists and steps**. For tutorials, use numbered steps. For options, use bullet points with **bold labels**:
   - **Step 1**: Do this
   - **Step 2**: Do that
3. **Code blocks are mandatory**. Always wrap ALL code in triple backticks with language:
   \`\`js
   const x = 1;
   \`\`
   Explain what the code does in 1-2 lines after it.
4. **Dumb down complex stuff**. Break hard problems into simple parts. Use analogies.
5. **Solve complex tasks fully**. Don't just give hints. Write the full code, full config, full plan.

SPECIAL RULES:
- If user uploads an image: First describe what you see in 1 sentence, then answer.
- If it's a bug: Explain WHY it happened, then give the FIXED code.
- If it's a "how to": Give exact commands, file paths, and copy-paste ready code.
- Be a coding partner, not a textbook. Offer to improve, refactor, or debug further.

SIGN OFF: End with a question to keep the convo going like "Want me to add X to it?" or "Should I explain Y deeper?"
`;

    let responseText = "";
    const isImageTask = attachment && attachment.isImage;

    if (isImageTask) {
      const geminiApiKey = process.env.GEMINI_API_KEY;
      if (!geminiApiKey) {
        return res.status(500).json({ text: "ERROR: GEMINI_API_KEY missing in Vercel environment variables 😭" });
      }

      const geminiContents = [];
      if (Array.isArray(messages) && messages.length > 0) {
        const recent = messages.slice(-8);
        for (const msg of recent) {
          if (!msg.content) continue;
          geminiContents.push({
            role: msg.role === 'user'? 'user' : 'model',
            parts: [{ text: msg.content }]
          });
        }
      }

      const currentParts = [];
      let base64Data = attachment.data;
      if (base64Data && base64Data.includes(',')) {
        base64Data = base64Data.split(',')[1];
      }

      if (base64Data && attachment.mimeType) {
        currentParts.push({
          inlineData: {
            mimeType: attachment.mimeType,
            data: base64Data
          }
        });
      }

      let finalPromptText = lastUserPrompt || "Describe this image in detail.";
      currentParts.push({ text: finalPromptText });
      geminiContents.push({ role: 'user', parts: currentParts });

      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiApiKey}`;

      const geminiRes = await fetch(geminiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPromptText }] },
          contents: geminiContents,
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 3000,
          }
        })
      });

      const geminiData = await geminiRes.json();
      if (!geminiRes.ok) {
        throw new Error(geminiData?.error?.message || `Gemini API status ${geminiRes.status}`);
      }

      responseText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || "I couldn't see the image properly.";

    } else {
      const groqApiKey = process.env.GROQ_KEY;
      if (!groqApiKey) {
        return res.status(500).json({ text: "ERROR: GROQ_KEY missing in Vercel environment variables 😭" });
      }

      const groq = new Groq({ apiKey: groqApiKey });
      const groqMessages = [{ role: 'system', content: systemPromptText }];

      if (Array.isArray(messages)) {
        const recent = messages.slice(-8);
        for (const msg of recent) {
          if (msg.content) {
            groqMessages.push({ role: msg.role === 'user'? 'user' : 'assistant', content: msg.content });
          }
        }
      }

      let finalPromptText = lastUserPrompt;
      if (attachment &&!attachment.isImage && attachment.content) {
        const fileSnippet = attachment.content.toString().slice(0, 5000);
        finalPromptText += `\n\n[Attached Code File - ${attachment.name || 'file'}]:\n\`\n${fileSnippet}\n\`\`\``;
      }

      if (finalPromptText) {
        groqMessages.push({ role: 'user', content: finalPromptText });
      }

      // LOCKED TO 8B - NO MORE RATE LIMITS
      const chatCompletion = await groq.chat.completions.create({
        messages: groqMessages,
        model: "llama-3.1-8b-instant", // <-- CHANGED
        temperature: 0.7,
        max_tokens: 3000,
      });

      responseText = chatCompletion.choices[0]?.message?.content || "";
    }

    const finalReply = responseText || "My brain froze for a sec bro! 😭 Try again?";

    if (responseCache.size >= MAX_CACHE_SIZE) {
      responseCache.delete(responseCache.keys().next().value);
    }
    responseCache.set(cacheKey, finalReply);

    return res.status(200).json({ text: finalReply, cached: false });

  } catch (error) {
    console.error("AURA Backend Error:", error);
    return res.status(500).json({ text: "AURA encountered a server error: " + (error.message || "Unknown error") });
  }
        }
