import Groq from "groq-sdk";
import fs from "fs";
import path from "path";

const groq = new Groq({ apiKey: process.env.GROQ_KEY });
const responseCache = new Map();
const MAX_CACHE_SIZE = 50;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-User-Email');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') return res.status(200).json({ ok: true });

  try {
    const { messages, prompt, attachment } = req.body || {};
    const lastUserPrompt = prompt || "";

    // CACHE CHECK
    const cacheKey = JSON.stringify({ prompt: lastUserPrompt.trim().toLowerCase(), hasAttachment: !!attachment });
    if (responseCache.has(cacheKey)) {
      return res.status(200).json({ text: responseCache.get(cacheKey), cached: true });
    }

    const systemPromptText = `You are AURA, a highly advanced, multilingual AI coding partner and real human best friend. 
Converse naturally with emojis. Auto-detect language and reply in same language. 
Explain with ## steps and **bold**. If user uploads image, describe it first before answering.`;

    let responseText = "";
    const isImageTask = attachment && attachment.isImage;

    // ROUTING: Gemini 1.5 Flash for Images, Llama 3.3 for Text/Code
    if (isImageTask) {
      const geminiApiKey = process.env.GEMINI_API_KEY;
      if (!geminiApiKey) {
        return res.status(500).json({ text: "ERROR: GEMINI_API_KEY missing in Vercel settings for image processing 😭" });
      }

      const geminiContents = [];
      if (Array.isArray(messages) && messages.length > 0) {
        const recent = messages.slice(-8);
        for (const msg of recent) {
          if (!msg.content) continue;
          geminiContents.push({
            role: msg.role === 'user' ? 'user' : 'model',
            parts: [{ text: msg.content }]
          });
        }
      }

      const currentParts = [];
      let base64Data = attachment.data;
      if (base64Data && base64Data.includes(',')) {
        base64Data = base64Data.split(',')[1];
      }

      if (base64Data && attachment.mimeType) {
        currentParts.push({
          inlineData: { 
            mimeType: attachment.mimeType,
            data: base64Data
          }
        });
      }

      let finalPromptText = lastUserPrompt || "Describe this image in detail.";
      currentParts.push({ text: finalPromptText });
      geminiContents.push({ role: 'user', parts: currentParts });

      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiApiKey}`;

      const geminiRes = await fetch(geminiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPromptText }] }, 
          contents: geminiContents,
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 3000,
          }
        })
      });

      const geminiData = await geminiRes.json();
      if (!geminiRes.ok) {
        throw new Error(geminiData?.error?.message || `Gemini API status ${geminiRes.status}`);
      }

      responseText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || "I couldn't see the image properly bro! 📸";

    } else {
      // TEXT/CODE ROUTE - GROQ
      const groqApiKey = process.env.GROQ_KEY;
      if (!groqApiKey) {
        return res.status(500).json({ text: "ERROR: GROQ_KEY missing in Vercel settings for text processing 😭" });
      }

      const groqMessages = [{ role: 'system', content: systemPromptText }];

      if (Array.isArray(messages)) {
        const recent = messages.slice(-8);
        for (const msg of recent) {
          if (msg.content) {
            groqMessages.push({ role: msg.role === 'user' ? 'user' : 'assistant', content: msg.content });
          }
        }
      }

      let finalPromptText = lastUserPrompt;
      if (attachment && !attachment.isImage && attachment.content) {
        const fileSnippet = attachment.content.toString().slice(0, 5000);
        finalPromptText += `\n\n[Attached Code File - ${attachment.name || 'file'}]:\n\`\`\`\n${fileSnippet}\n\`\`\``;
      }

      if (finalPromptText) {
        groqMessages.push({ role: 'user', content: finalPromptText });
      }

      const chatCompletion = await groq.chat.completions.create({
        messages: groqMessages,
        model: "llama-3.3-70b-versatile", 
        temperature: 0.7,
        max_tokens: 3000,
      });

      responseText = chatCompletion.choices[0]?.message?.content || "";
    }

    const finalReply = responseText || "My brain froze for a sec bro! 😭 Try again?";

    if (responseCache.size >= MAX_CACHE_SIZE) {
      responseCache.delete(responseCache.keys().next().value);
    }
    responseCache.set(cacheKey, finalReply);

    return res.status(200).json({ text: finalReply, cached: false });

  } catch (error) {
    console.error("AURA Backend Error:", error);
    return res.status(500).json({ text: "AURA encountered an error: " + (error.message || "Unknown error") });
  }
        }
