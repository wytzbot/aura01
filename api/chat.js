import Groq from "groq-sdk";

export const config = {
  runtime: 'nodejs' // force nodejs runtime
};

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

export default async function handler(req, res) {
  if (req.method!== 'POST') return res.status(405).end();
  
  res.setHeader('Content-Type', 'text/plain');
  res.setHeader('Transfer-Encoding', 'chunked');

  try {
    const { messages } = req.body;
    if(!process.env.GROQ_API_KEY) throw new Error("GROQ_API_KEY missing");

    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: messages,
      stream: true,
    });

    for await (const chunk of completion) {
      const content = chunk.choices[0]?.delta?.content || '';
      res.write(content);
    }
    res.end();

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
      }
