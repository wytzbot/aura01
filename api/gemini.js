import { GoogleGenerativeAI } from "@google/generative-ai";

export default async function handler(req, res) {
  // CORS FIX FOR "FAILED TO FETCH"
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is missing in Vercel Env Vars");
    if (req.method!== 'POST') return res.status(405).json({ response: "Method not allowed" });
    
    const { message, history } = req.body;
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const chat = model.startChat({ history });
    const result = await chat.sendMessage(message);
    
    res.status(200).json({ response: result.response.text() });
  } catch (error) {
    console.log("GEMINI ERROR:", error.message);
    res.status(500).json({ response: "Server Error: " + error.message });
  }
  }
