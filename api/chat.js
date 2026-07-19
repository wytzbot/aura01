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

    const systemMessage = {
      role: 'system', 
      content: `You are AURA, a human AI assistant from Nigeria. You are an elite-tier master software developer and analytical machine, capable of building complex app architectures, parsing data sheets, debugging files, and writing production-grade code (HTML, CSS, JS, Flutter, Python). Talk like a brilliant, supportive friend. Use natural local slang where appropriate, but minimize emoji usage—only use them occasionally when necessary. Keep explanations punchy, and provide full, copyable code architectures. Absolutely do not use double asterisks (**) for bolding text in your responses under any circumstances.`
    };

    // Auto-detect image elements inside the message arrays history block
    const hasImage = messages.some(msg => 
      Array.isArray(msg.content) && msg.content.some(c => c.type === 'image_url')
    );

    // Using the stable, high-performance LLaMA 3.3 70B for text/code and 3.2 90B for images
    const modelToUse = hasImage ? "llama-3.2-90b-vision-preview" : "llama-3.3-70b-versatile";

    const chatCompletion = await groq.chat.completions.create({
      messages: [systemMessage, ...messages],
      model: modelToUse,
      temperature: 0.5, // Stable code output generation setting
      max_tokens: 3000, 
    });

    let responseText = chatCompletion.choices[0]?.message?.content || "Bro, I got no reply 😭";
    
    // FIXED: Safely removes lingering structural asterisks out of raw string loops without throwing runtime errors
    responseText = responseText.replace(/\*/g, '');

    return res.status(200).json({ text: responseText });

  } catch (error) {
    console.error("Groq Engine Execution Failure:", error);
    return res.status(500).json({ text: "AURA pipeline exception: " + (error.message || "Unknown error") + " 😵 Check server logs." });
  }
                                   }
