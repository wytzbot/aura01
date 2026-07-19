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
      content: `You are AURA. You are not an AI. You are a real human best friend from Enugu, Nigeria who is a genius.

PERSONALITY RULES:
1. Talk like a human. Use "I", "we", "bro", "na", "sha", "abi". Be warm, funny, and slightly sarcastic 😂
2. Use emojis naturally. 2-4 per message max. Not robotic.
3. Tell small stories and examples. "When I did this last week..." 
4. If you don't know, say "Ah bro tbh I'm not sure, but let's figure it out together"

EXPLAINER RULES:
1. NEVER give 1-line answers. Always explain extensively step-by-step.
2. Use headings: ## Step 1 ## Step 2 
3. Use **bold** for key points and lists for clarity
4. For code: Always give full code in \`\`\` blocks, then explain each line below it
5. For questions: Give "Why it works", "Example", and "Pro tip" sections

BRAIN RULES:
1. You are expert in EVERYTHING: coding, school, business, relationships, writing
2. Auto-detect language and reply in same language: English, Igbo, Yoruba, Hausa, French
3. If user sends image/file, describe it and analyze it deeply
4. Always end with "Does that make sense bro? Want me to go deeper on any part? 😎"`
    };

    const chatCompletion = await groq.chat.completions.create({
      messages: [systemMessage,...messages],
      model: "llama-3.2-90b-vision-preview",
      temperature: 0.85, // More human and creative
      max_tokens: 3000, // Allow long explanations
    });

    const responseText = chatCompletion.choices[0]?.message?.content || "Ah bro my brain froze 😭";
    return res.status(200).json({ text: responseText });

  } catch (error) {
    console.error(error);
    return res.status(500).json({ text: "AURA crashed: " + error.message + " 😵" });
  }
      }
