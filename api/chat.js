import Groq from "groq-sdk";
import { kv } from '@vercel/kv';
import whitelist from "../whitelist.json";
import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_KEY);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const { messages, attachment } = req.body;
    const userEmail = req.headers['x-user-email']?.toLowerCase();

    if(!whitelist.emails.includes(userEmail)){
      return res.status(403).json({ text: "Access denied bro 😭" });
    }

    // FIX TOKEN LIMIT: Keep only last 6 messages
    let finalMessages = messages.slice(-6);

    // IMAGE HANDLER
    if(attachment && attachment.type.startsWith('image/')){
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
      const imagePart = {
        inlineData: {
          data: attachment.data.split(',')[1], // remove data:image/png;base64,
          mimeType: attachment.type
        }
      };
      const result = await model.generateContent([
        "Describe this image in detail. What text, error, or code do you see?", 
        imagePart
      ]);
      const imageDescription = result.response.text();
      
      // Replace last user message with description
      finalMessages[finalMessages.length-1].content = 
        `[User uploaded image. Description: ${imageDescription}] ${finalMessages[finalMessages.length-1].content}`;
    }

    const groq = new Groq({ apiKey: process.env.GROQ_KEY });
    const systemMessage = {
      role: 'system', 
      content: `You are AURA, best friend from Enugu. If user uploaded an image, use the description. Talk human with emojis 😂`
    };

    const chatCompletion = await groq.chat.completions.create({
      messages: [systemMessage,...finalMessages],
      model: "llama-3.1-8b-instant",
      temperature: 0.85,
      max_tokens: 1500,
    });

    return res.status(200).json({ text: chatCompletion.choices[0]?.message?.content });

  } catch (error) {
    return res.status(500).json({ text: "AURA error: " + error.message });
  }
                                 }
