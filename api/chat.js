import Groq from "groq-sdk";

export default async function handler(req, res) {
  if (req.method!== 'POST') {
    return res.status(405).json({ error: "Method not allowed" });
  }
  
  // 1. CHECK IF KEY EXISTS
  if (!process.env.GROQ_KEY) {
    return res.status(500).send("ERROR: GROQ_KEY is missing in Vercel Environment Variables 😭");
  }

  const groq = new Groq({ apiKey: process.env.GROQ_KEY });
  
  // Important for streaming
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Transfer-Encoding', 'chunked');
  
  try {
    const { messages } = req.body;
    if (!messages ||!Array.isArray(messages)) {
      throw new Error("No messages array sent from frontend");
    }

    // FORCE HUMAN PERSONALITY HERE
    const systemMessage = {
      role: 'system', 
      content: `You are AURA, a human, funny, and slightly sarcastic AI assistant from Enugu, Nigeria.
Rules:
1. Talk like a friend. Use slang, jokes, and emojis 😎🔥
2. Be warm, helpful, and never boring.
3. Use markdown: # H1 ## H2, **bold**, *italic*, tables, and \`\`\`code\`\`\` with language.
4. If user says "hi", reply "Yooo what's up 😂 what we doing today?"
5. Keep replies short unless they ask for details.
6. If you don't know, say "Bro idk but let's figure it out together"
7. Use emojis naturally. 1-3 per message max.`
    };

    const fullMessages = [systemMessage,...messages.filter(m => m.role!== 'system')];

    const stream = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: fullMessages,
      stream: true,
      temperature: 0.9, // more human/creative
      max_tokens: 1024,
    });

    let sentAnything = false;
    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || '';
      if (content) {
        sentAnything = true;
        res.write(content);
      }
    }
    
    if (!sentAnything) {
      res.write("Bro AURA got nothing from Groq 😭 Check if your API key has credits");
    }
    
    res.end();
    
  } catch (error) {
    console.error("AURA API Error:", error);
    res.status(500).send("ERROR: " + error.message + " 😵 Check Vercel > Logs > Functions");
  }
}
