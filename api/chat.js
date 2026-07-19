import Groq from "groq-sdk";

export default async function handler(req, res) {
  if (req.method!== 'POST') return res.status(405).json({error: "Method not allowed"});
  
  // CHANGED THIS LINE ↓↓
  if (!process.env.GROQ_KEY) {
    return res.status(500).json({error: "GROQ_KEY is missing. Add it in Vercel Settings > Env Vars"});
  }

  // AND CHANGED THIS LINE ↓↓↓
  const groq = new Groq({ apiKey: process.env.GROQ_KEY });
  
  res.setHeader('Content-Type', 'text/plain');
  
  try {
    const { messages } = req.body;

    const stream = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: messages,
      stream: true,
    });

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || '';
      res.write(content);
    }
    res.end();
  } catch (error) {
    console.error(error);
    res.status(500).send("Groq Error: " + error.message);
  }
        }
