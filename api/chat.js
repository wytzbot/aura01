import Groq from "groq-sdk";

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') return res.status(200).end();

  if (!process.env.GROQ_KEY) {
    return res.status(500).json({ text: "ERROR: GROQ_KEY missing in Vercel Settings > Environment Variables 😭" });
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
End with: "Does that make sense bro? Want me to go deeper? 😎"`
    };

    const modelList = ["llama-3.3-70b-versatile", "llama-3.1-8b-instant", "mixtral-8x7b-32768"];
    let responseText;
    
    for(const model of modelList){
      try{
        const chatCompletion = await groq.chat.completions.create({
          messages: [systemMessage,...messages],
          model: model,
          temperature: 0.85,
          max_tokens: 3000,
        });
        responseText = chatCompletion.choices[0]?.message?.content;
        break;
      }catch(e){
        if(!e.message.includes("rate_limit") &&!e.message.includes("quota")) throw e;
      }
    }

    return res.status(200).json({ text: responseText || "Ah bro my brain froze 😭" });

  } catch (error) {
    console.error(error);
    return res.status(500).json({ text: "AURA crashed: " + error.message + " 😵" });
  }
  }
