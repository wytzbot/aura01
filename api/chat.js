export default async function handler(req, res) {
  // 1. Allow CORS so your frontend can call it
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  // Handle preflight request
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const GROQ_KEY = process.env.GROQ_KEY; // Gets key from Vercel Environment Variables
    
    if (!GROQ_KEY) {
      return res.status(500).json({ error: 'GROQ_KEY not set in Vercel' });
    }

    // 2. Forward request to GROQ
    const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${GROQ_KEY}`
      },
      body: JSON.stringify(req.body) // This is what we send from index.html
    });

    const data = await groqRes.json();
    
    // 3. Send GROQ response back to frontend
    return res.status(200).json(data);

  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
      }
