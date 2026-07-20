import Groq from "groq-sdk";

const groq = new Groq({ apiKey: process.env.GROQ_KEY });
const responseCache = new Map();
const MAX_CACHE_SIZE = 50;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') return res.status(200).json({ ok: true });

  try {
    if (!process.env.GROQ_KEY) {
      return res.status(500).json({ text: "ERROR: GROQ_KEY missing in Vercel Env Vars" });
    }

    const { messages, prompt, attachment } = req.body || {};
    const lastUserPrompt = prompt || "";

    // CACHE
    const cacheKey = JSON.stringify({ prompt: lastUserPrompt.trim().toLowerCase() });
    if (responseCache.has(cacheKey)) {
      return res.status(200).json({ text: responseCache.get(cacheKey), cached: true });
    }

    // SYSTEM PROMPT
    const systemInstruction = `You are AURA, an advanced AI assistant and coding partner.
Be warm, helpful, and conversational. Use emojis naturally.
Auto-detect the user's language and reply in the same language fluently.
Remember context from previous messages.
Explain with ## Steps, **bold**, and code examples.`;

    // BUILD HISTORY FOR MEMORY
    const recentMessages = Array.isArray(messages)? messages.slice(-12) : [];
    const groqMessages = [
      { role: 'system', content: systemInstruction },
     ...recentMessages
    ];

    // HANDLE ATTACHMENT
    let userMessageContent = lastUserPrompt;
    if (attachment) {
      if (attachment.type?.startsWith('image/')) {
        userMessageContent = `[User uploaded an image: ${attachment.name}]\n${lastUserPrompt}\n\nNote: I can't directly view images yet. Please describe what's in the image.`;
      } else if (attachment.type?.startsWith('video/')) {
        userMessageContent = `[User uploaded a video: ${attachment.name}]\n${lastUserPrompt}\n\nNote: I can't process videos yet. Please describe the video.`;
      } else {
        const fileSnippet = (attachment.content || "").toString().slice(0, 5000);
        userMessageContent = `${lastUserPrompt}\n\n[Attached File: ${attachment.name}]\n\`\n${fileSnippet}\n\`\`\``;
      }
    }
    groqMessages.push({ role: 'user', content: userMessageContent });

    // CALL GROQ
    const chatCompletion = await groq.chat.completions.create({
      messages: groqMessages,
      model: "llama-3.3-70b-versatile",
      temperature: 0.7,
      max_tokens: 3000,
    });

    const finalReply = chatCompletion.choices[0]?.message?.content || "My brain froze 😭 Try again";

    // SAVE CACHE
    if (responseCache.size >= MAX_CACHE_SIZE) responseCache.delete(responseCache.keys().next().value);
    responseCache.set(cacheKey, finalReply);

    return res.status(200).json({ text: finalReply, cached: false });

  } catch (error) {
    console.error("AURA Error:", error);
    return res.status(500).json({ text: "AURA error: " + error.message });
  }
}
