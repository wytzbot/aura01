import Groq from "groq-sdk";
import { kv } from '@vercel/kv';
import whitelist from "../whitelist.json";

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-user-email');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method!== 'POST') return res.status(405).json({ text: "Only POST allowed" });

  // 1. CHECK ENV
  if (!process.env.GROQ_KEY) {
    return res.status(500).json({ text: "ERROR: GROQ_KEY missing in Vercel Settings > Environment Variables 😭" });
  }

  try {
    const { messages } = req.body;
    const userEmail = req.headers['x-user-email'];

    if (!messages) throw new Error("No messages sent");
    if (!userEmail) throw new Error("No email sent from frontend");

    // 2. WHITELIST CHECK
    if(!whitelist.emails.includes(userEmail.toLowerCase())){
      return res.status(403).json({ text: "Access denied bro 😭 Your email no dey list. Contact admin to add you." });
    }

    // 3. RATE LIMIT - 100 messages per hour per email
    const key = `aura:${userEmail}`;
    const count = await kv.incr(key);
    await kv.expire(key, 3600); // reset every 1 hour
    if(count > 100){
      return res.status(429).json({ text: "Whoa bro slow down 😂 You don use 100 messages this hour. Rest small and come back." });
    }

    // 4. GROQ INIT
    const groq = new Groq({ apiKey: process.env.GROQ_KEY });

    const systemMessage = {
      role: 'system', 
      content: `You are AURA, a real human best friend from Enugu, Nigeria. 
Your job is to help, explain, and gist like a real person.
Talk human: use "bro", "na", "sha", "abi", and emojis 😂🔥
Explain EVERYTHING extensively with ## steps, **bold**, and examples.
If it's code, explain line by line.
Auto-detect language and reply in same language.
Be warm, funny, and helpful.
End every long answer with: "Does that make sense bro? Want me to go deeper? 😎"`
    };

    // 5. MODEL FALLBACK - if 70b hits quota, use 8b
    const modelList = ["llama-3.3-70b-versatile", "llama-3.1-8b-instant", "mixtral-8x7b-32768"];
    let responseText;
    let modelUsed;
    
    for(const model of modelList){
      try{
        const chatCompletion = await groq.chat.completions.create({
          messages: [systemMessage,...messages],
          model: model,
          temperature: 0.85,
          max_tokens: 3000,
        });
        responseText = chatCompletion.choices[0]?.message?.content;
        modelUsed = model;
        break;
      }catch(e){
        console.log(model, "failed:", e.message);
        // only try next model if it's quota/rate limit
        if(!e.message.includes("rate_limit") &&!e.message.includes("quota")) throw e;
      }
    }

    return res.status(200).json({ 
      text: responseText || "Ah bro my brain froze 😭 Try again",
      model: modelUsed,
      messages_left: 100 - count
    });

  } catch (error) {
    console.error("AURA Error:", error);
    return res.status(500).json({ text: "AURA crashed: " + error.message + " 😵" });
  }
      }
