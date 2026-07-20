import Groq from "groq-sdk";
import { kv } from '@vercel/kv';
import whitelist from "../whitelist.json";
import { GoogleGenerativeAI } from "@google/generative-ai"; // NEW

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY); // NEW

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-user-email');
  res.setHeader('Content-Type', 'application/json');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    if (!process.env.GROQ_KEY) return res.status(500).json({ text: "GROQ_KEY missing" });
    if (!process.env.GEMINI_API_KEY) return res.status(500).json({ text: "GEMINI_API_KEY missing" }); // NEW

    const { messages, attachment } = req.body; // NEW: attachment
    const userEmail = req.headers['x-user-email']?.toLowerCase();

    if(!whitelist.emails.includes(userEmail)){
      return res.status(403).json({ text: "Access denied bro 😭" });
    }

    // RATE LIMIT
    const key = `aura:${userEmail}`;
    const count = await kv.incr(key);
    await kv.expire(key, 3600);
    if(count > 100) return res.status(429).json({ text: "Slow down bro" });

    let finalMessages = [...messages];

    // 2. IMAGE HANDLER - If user uploaded image
    if(attachment && attachment.type.startsWith('image/')){
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
      
      const imagePart = {
        inlineData: {
          data: attachment.data.split(',')[1], // remove data:image/png;base64,
          mimeType: attachment.type
        }
      };

      const prompt = "Describe this image in detail for an AI assistant. What do you see? Text, objects, context.";
      const result = await model.generateContent([prompt, imagePart]);
      const imageDescription = result.response.text();

      // Add the description to the chat so Groq can use it
      finalMessages.push({
        role: 'user',
        content: `[User uploaded an image. Here's what it shows: ${imageDescription}] ${messages[messages.length-1].content}`
      });
    }

    // 3. SEND TO GROQ AS NORMAL
    const groq = new Groq({ apiKey: process.env.GROQ_KEY });
    const systemMessage = {
      role: 'system', 
      content: `You are AURA. If user mentions an image was uploaded, use the description provided. Talk like bro from Enugu 😂`
    };

    const chatCompletion = await groq.chat.completions.create({
      messages: [systemMessage,...finalMessages],
      model: "llama-3.1-8b-instant",
      temperature: 0.85,
    });

    return res.status(200).json({ text: chatCompletion.choices[0]?.message?.content });

  } catch (error) {
    return res.status(500).json({ text: "AURA error: " + error.message });
  }
  }
