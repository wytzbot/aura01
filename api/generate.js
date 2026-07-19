import { GoogleGenerativeAI } from "@google/generative-ai";
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

export default async function handler(req, res) {
  if (req.method!== 'POST') return res.status(405).end();
  const { message, history } = req.body;
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
  const chat = model.startChat({ history: history.map(h=>({role:h.role,parts:[{text:h.content||h.parts[0].text}]})) });
  const result = await chat.sendMessage(message);
  res.status(200).json({ response: result.response.text() });
}
