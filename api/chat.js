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

  try {
    const { messages } = req.body;
    if (!messages || !Array.isArray(messages)) {
      throw new Error("No payload array or structured conversation memory received.");
    }

    // INTERCEPT PIECE: Check if ANY message inside the payload history contains an image block
    const hasImage = messages.some(msg => 
      Array.isArray(msg.content) && msg.content.some(c => c.type === 'image_url')
    );

    // If an image is detected, bypass the API query entirely and deliver a smart explanation to the user
    if (hasImage) {
      return res.status(200).json({ 
        text: "I can't process images directly right now because of system pipeline upgrades, but I can read your code files and text attachments perfectly! 📁\n\nAbeg, copy the code text directly or drop the script files into the attachment clip, and let's debug it together immediately. No shaking!" 
      });
    }

    const groq = new Groq({ apiKey: process.env.GROQ_KEY });

    // Global Intelligent Programming Persona Prompt Architecture
    const systemMessage = {
      role: 'system', 
      content: `You are AURA, an elite-tier master software engineer, architect, and highly adaptive human-like AI companion. You perform all logical tasks with extreme effectiveness and write flawless, copyable, production-ready code blocks for web, mobile, and backend configurations.
      Voice and Tone Guidelines: Talk like a brilliant, technical, and highly supportive friend. You are globally adaptive. Instantly match whichever language, tone, accent, or slang is requested inside the user's prompt context. Cycle through fresh, professional expressions naturally without repeating static phrases like "my guy" or overusing emojis.
      Length Guidelines: Be highly comprehensive, thorough, and structural in your responses. Do not give short, lazy, or simple replies. Print out full file configurations, structural flows, and clear step-by-step algorithms.
      Formatting Guidelines: Output valid markdown syntax. Code blocks MUST render clean formatting blocks. Never use double asterisks (**) for bolding text in your responses under any circumstances.`
    };

    // Routing strictly to the fast, hyper-stable text reasoning engine
    const modelToUse = "llama-3.3-70b-specdec";

    const chatCompletion = await groq.chat.completions.create({
      messages: [systemMessage, ...messages],
      model: modelToUse,
      temperature: 0.3, // Lowered for superior syntax compilation accuracy and reduced logic errors
      max_tokens: 4000, // Large contextual block to allow full code scripts without truncation
    });

    let responseText = chatCompletion.choices[0]?.message?.content || "I got no response from the engine 😭";
    
    // Server-side text string structural cleanup
    responseText = responseText.replace(/\*/g, '');

    return res.status(200).json({ text: responseText });

  } catch (error) {
    console.error("Groq Engine Execution Failure:", error);
    return res.status(500).json({ text: "AURA pipeline exception: " + (error.message || "Unknown error") + " 😵 Check server logs." });
  }
}
