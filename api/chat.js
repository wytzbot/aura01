import Groq from "groq-sdk";
import { kv } from '@vercel/kv';
import whitelist from "../whitelist.json";

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-user-email');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // WRAP EVERYTHING IN TRY CATCH
  try {
    if (req.method!== 'POST') {
      return res.status(405).json({ text: "Only POST allowed bro" });
    }

    if (!process.env.GROQ_KEY) {
      return res.status(500).json({ text: "ERROR: GROQ_KEY missing. Go Vercel > Settings > Env Vars and add it 😭" });
    }

    const { messages } = req.body || {};
    const userEmail = req.headers['x-user-email']?.toLowerCase();

    if (!messages) return res.status(400).json({ text: "No messages sent" });
    if (!userEmail) return res.status(400).json({ text: "No email sent from frontend. Did you add 'x-user-email' header?" });

    // 1. WHITELIST CHECK
    if(!whitelist.emails.includes(userEmail)){
      return res.status(403).json({ text: `Access denied bro 😭 ${userEmail} no dey list.` });
    }

    // 2. RATE LIMIT
    try {
      const key = `aura:${userEmail}`;
      const count = await kv.incr(key);
      await kv.expire(key, 3600);
      if(count > 100){
        return res.status(429).json({ text: `Slow down bro 😂 You don use ${count} messages this hour.` });
      }
    } catch(kvError){
      console.log("KV Error:", kvError.message);
      // Don't block if KV fails, just continue
    }

    const groq = new Groq({ apiKey: process.env.GROQ_KEY });
    const systemMessage = {
      role: 'system', 
      content: `You are AURA, a real human best friend from Enugu, Nigeria. Talk like bro. Use emojis 😂`
    };

    const chatCompletion = await groq.chat.completions.create({
      messages: [systemMessage,...messages],
      model: "llama-3.1-8b-instant", // use 8b first, it's faster
      temperature: 0.85,
      max_tokens: 2000,
    });

    const responseText = chatCompletion.choices[0]?.message?.content;
