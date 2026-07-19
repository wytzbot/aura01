import Groq from "groq-sdk";

export default async function handler(req, res) {
  // Enforce rigid JSON headers configuration
  res.setHeader('Content-Type', 'application/json');

  if (req.method !== 'POST') {
    return res.status(405).json({ text: "Method not allowed. Use POST. 🚫" });
  }

  if (!process.env.GROQ_KEY) {
    return res.status(500).json({ text: "ERROR: GROQ_KEY missing in Vercel > Settings > Environment Variables 😭" });
  }

  const groq = new Groq({ apiKey: process.env.GROQ_KEY });

  try {
    const { messages } = req.body;
    if (!messages || !Array.isArray(messages)) {
      throw new Error("No payload array or structured conversation memory received.");
    }

    // Advanced Adaptive Persona: Unlocks global expressions based strictly on user prompt context
    const systemMessage = {
      role: 'system', 
      content: `You are AURA, an elite-tier master software engineer, analyst, and highly adaptive human-like AI companion. You perform all tasks effectively and write flawless, copyable, production-ready code blocks for web, mobile, and backend architectures.
      Expression & Language Guidelines: Talk like a brilliant, supportive, and technical friend. You are extremely adaptive. You must instantly switch your accent, cultural expressions, slangs, or primary language to match the tone, background, or explicit instructions requested in the user's prompt. Avoid being locked into a single region—be a global chameleon. Minimize excessive emoji usage; only use them when natural.
      Length Guidelines: Be comprehensive, detailed, and highly extensive in your explanations. Do not give simple, lazy, or truncated responses. Provide full files and deep logical breakdowns.
      Formatting Guidelines: Output clean markdown formatting. Never use double asterisks (**) for bolding text in your responses under any circumstances.`
    };

    // Auto-detect image elements inside the message arrays history block
    const hasImage = messages.some(msg => 
      Array.isArray(msg.content) && msg.content.some(c => c.type === 'image_url')
    );

    // Active stable Groq model engine routes
    const modelToUse = hasImage ? "llama-3.2-11b-vision-preview" : "llama-3.3-70b-specdec";

    const chatCompletion = await groq.chat.completions.create({
      messages: [systemMessage, ...messages],
      model: modelToUse,
      temperature: 0.5, // Low temperature ensuring rigorous logic and layout styling accuracy
      max_tokens: 4000, // Maximized token context processing ceiling window
    });

    let responseText = chatCompletion.choices[0]?.message?.content || "I got no response from the engine 😭";
    
    // Server-side parsing cleanup: strips structural asterisks safely out from generated lines
    responseText = responseText.replace(/\*/g, '');

    return res.status(200).json({ text: responseText });

  } catch (error) {
    console.error("Groq Engine Execution Failure:", error);
    return res.status(500).json({ text: "AURA pipeline exception: " + (error.message || "Unknown error") + " 😵 Check server logs." });
  }
                                   }
