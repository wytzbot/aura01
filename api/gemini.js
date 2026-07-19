import { GoogleGenerativeAI } from "@google/generative-ai";

export default async function handler(req, res) {
  try {
    if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is missing");
    const { message, history } = req.body;
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const chat = model.startChat({ history });
    const result = await chat.sendMessage(message);
    res.status(200).json({ response: result.response.text() });
  } catch (error) {
    console.log("GEMINI ERROR:", error.message); // this will show in Vercel logs
    res.status(500).json({ response: "Server Error: " + error.message });
  }
                }
