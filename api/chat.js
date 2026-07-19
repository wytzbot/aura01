import Groq from "groq-sdk";

export default async function handler(req, res) {
  // Enforce rigid response encoding headers
  res.setHeader('Content-Type', 'application/json');

  // Guard against non-POST network requests
  if (req.method !== 'POST') {
    return res.status(405).json({ text: "Method not allowed. 🚫 Use POST." });
  }

  // Verify infrastructure environmental variable sanity
  if (!process.env.GROQ_KEY) {
    return res.status(500).json({ text: "ERROR: GROQ_KEY missing in Vercel > Settings > Environment Variables 😭" });
  }

  const groq = new Groq({ apiKey: process.env.GROQ_KEY });

  try {
    const { messages } = req.body;
    if (!messages || !Array.isArray(messages)) {
      throw new Error("No payload array or structured chat history submitted.");
    }

    // System instruction defining AURA's Nigerian persona parameters
    const systemMessage = {
      role: 'system', 
      content: `You are AURA, a funny, human AI assistant from Nigeria. Talk like a friend. Use slang and emojis 😂🔥. Keep your answers concise, engaging, and directly to the point.`
    };

    // Parse array objects to verify if user passed a base64 image asset
    const hasImage = messages.some(msg => 
      Array.isArray(msg.content) && msg.content.some(c => c.type === 'image_url')
    );

    // Dynamic routing: LLaMA 3.3 for pure text, LLaMA 3.2 Vision for multimodal tasks
    const modelToUse = hasImage ? "llama-3.2-90b-vision-preview" : "llama-3.3-70b-versatile";

    const chatCompletion = await groq.chat.completions.create({
      messages: [systemMessage, ...messages],
      model: modelToUse,
      temperature: 0.9,
      max_tokens: 1024,
    });

    const responseText = chatCompletion.choices[0]?.message?.content || "Bro I got no reply 😭";
    return res.status(200).json({ text: responseText });

  } catch (error) {
    console.error("Groq Engine Execution Failure:", error);
    return res.status(500).json({ text: "AURA crashed: " + (error.message || "Unknown error") + " 😵 Check Vercel Logs." });
  }
        }
