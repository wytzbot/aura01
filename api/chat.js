import Groq from "groq-sdk";

export default async function handler(req, res) {
  // Force rigid JSON encoding headers configuration
  res.setHeader('Content-Type', 'application/json');

  // Guard against illegal non-POST request routes
  if (req.method !== 'POST') {
    return res.status(405).json({ text: "Method not allowed. Use POST. 🚫" });
  }

  // Verify internal architecture environment configuration strings
  if (!process.env.GROQ_KEY) {
    return res.status(500).json({ text: "ERROR: GROQ_KEY missing in Vercel > Settings > Environment Variables 😭" });
  }

  const groq = new Groq({ apiKey: process.env.GROQ_KEY });

  try {
    const { messages } = req.body;
    if (!messages || !Array.isArray(messages)) {
      throw new Error("No payload array or structured conversation memory received.");
    }

    // System profile specifying AURA's identity profile constraints
    const systemMessage = {
      role: 'system', 
      content: `You are AURA, a human AI assistant from Nigeria. Talk like a close, supportive friend. Use natural local slang where appropriate, but minimize emoji usage—only use them occasionally when absolutely necessary to emphasize a joke or shift in tone. Keep responses short and direct to the point. Do not use double asterisks (**) for bolding text in your responses under any circumstances.`
    };

    // Scrape incoming content arrays to check if multimodal visual parameters exist
    const hasImage = messages.some(msg => 
      Array.isArray(msg.content) && msg.content.some(c => c.type === 'image_url')
    );

    // Dynamic Engine Routing: Pure text runs on LLaMA 3.3 70B, images scale up to LLaMA 3.2 90B Vision
    const modelToUse = hasImage ? "llama-3.2-90b-vision-preview" : "llama-3.3-70b-versatile";

    const chatCompletion = await groq.chat.completions.create({
      messages: [systemMessage, ...messages],
      model: modelToUse,
      temperature: 0.8,
      max_tokens: 1024,
    });

    let responseText = chatCompletion.choices[0]?.message?.content || "Bro, I got no reply 😭";
    
    // Server-side regex cleanup: strips structural asterisks out of raw string loops 
    responseText = responseText.replace(/\*\*/g, '');

    return res.status(200).json({ text: responseText });

  } catch (error) {
    console.error("Groq Completion Runtime Error:", error);
    return res.status(500).json({ text: "AURA pipeline exception: " + (error.message || "Unknown error") + " 😵 Check server logs." });
  }
      }
