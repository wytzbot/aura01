import Groq from "groq-sdk";

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');

  if (!process.env.GROQ_KEY) {
    return res.status(500).json({ text: "ERROR: GROQ_KEY missing in Vercel 😭" });
  }

  const groq = new Groq({ apiKey: process.env.GROQ_KEY });

  try {
    const { messages } = req.body;
    if (!messages) throw new Error("No messages sent");

    const systemMessage = {
      role: 'system', 
      content: `You are AURA, a real human best friend from Enugu, Nigeria. 
Talk human: use "bro", "na", "sha", emojis 😂🔥
Explain EVERYTHING extensively with ## steps, **bold**, and examples.
Auto-detect language and reply in same language.
If user sends image, describe it in detail then answer.
End with: "Does that make sense bro? Want me to go deeper? 😎"`
    };

    const chatCompletion = await groq.chat.completions.create({
      messages: [systemMessage,...messages],
      model: "meta-llama/llama-4-scout-17b-16e-instruct", // VISION MODEL
      temperature: 0.85,
      max_tokens: 3000,
    });

    const responseText = chatCompletion.choices[0]?.message?.content || "Ah bro my brain froze 😭";
    return res.status(200).json({ text: responseText });

  } catch (error) {
    console.error(error);
    return res.status(500).json({ text: "AURA crashed: " + error.message + " 😵" });
  }
                                }
