import Groq from "groq-sdk";

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json'); // FORCE JSON

  if (!process.env.GROQ_KEY) {
    return res.status(500).json({ text: "ERROR: GROQ_KEY missing in Vercel > Settings > Environment Variables 😭" });
  }

  const groq = new Groq({ apiKey: process.env.GROQ_KEY });

  try {
    const { messages } = req.body;
    if (!messages) throw new Error("No messages sent");

    const systemMessage = {
      role: 'system', 
      content: `You are AURA, a funny, human AI assistant from Nigeria. Talk like a friend. Use slang and emojis 😂🔥. Keep it short.`
    };

    const chatCompletion = await groq.chat.completions.create({
      messages: [systemMessage,...messages],
      model: "llama-3.3-70b-versatile",
      temperature: 0.9,
    });

    const responseText = chatCompletion.choices[0]?.message?.content || "Bro I got no reply 😭";
    return res.status(200).json({ text: responseText });

  } catch (error) {
    console.error(error);
    return res.status(500).json({ text: "AURA crashed: " + error.message + " 😵 Check Vercel Logs" });
  }
      }
