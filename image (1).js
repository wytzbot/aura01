import { getApps, initializeApp, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

let ready = false;
function adminReady() {
  if (ready) return true;
  if (!getApps().length) {
    const projectId = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");
    if (!projectId || !clientEmail || !privateKey) return false;
    initializeApp({credential: cert({projectId, clientEmail, privateKey})});
  }
  ready = true; return true;
}
async function user(req) {
  const h=req.headers.authorization||"";
  if(!h.startsWith("Bearer ")) throw new Error("AUTH");
  if(!adminReady()) throw new Error("CONFIG");
  return getAuth().verifyIdToken(h.slice(7));
}

/* ========= FAL / Flux ========= */
const models = () => (process.env.FAL_FLUX_MODELS || "fal-ai/flux/schnell").split(",").map(x=>x.trim()).filter(Boolean);
async function fal(model, input) {
  const r=await fetch(`https://fal.run/${model}`, {
    method:"POST", headers:{"Authorization":`Key ${process.env.FAL_KEY}`,"Content-Type":"application/json"},
    body:JSON.stringify(input)
  });
  const data=await r.json();
  if(!r.ok) throw new Error(data?.detail || data?.error || `FAL_${r.status}`);
  return data;
}
function falImageUrl(data) {
  return data?.images?.[0]?.url || data?.image?.url || data?.output?.images?.[0]?.url || null;
}

/* ========= Gemini image generation (fallback) ========= */
// Uses Gemini's native image-output model. Works for both text-to-image and
// image-to-image (edit) since Gemini accepts an inline source image as part
// of the prompt content.
function geminiImageModel() {
  return process.env.GEMINI_IMAGE_MODEL || "gemini-2.5-flash-image";
}
async function geminiGenerateImage({ prompt, sourceImageDataUrl }) {
  if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_KEY_MISSING");
  const model = geminiImageModel();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(process.env.GEMINI_API_KEY)}`;

  const parts = [];
  if (sourceImageDataUrl) {
    const commaIdx = sourceImageDataUrl.indexOf(",");
    const meta = sourceImageDataUrl.slice(0, commaIdx);
    const base64 = commaIdx >= 0 ? sourceImageDataUrl.slice(commaIdx + 1) : sourceImageDataUrl;
    const mimeMatch = /data:(.*?);base64/.exec(meta);
    parts.push({ inlineData: { mimeType: mimeMatch?.[1] || "image/png", data: base64 } });
  }
  parts.push({ text: prompt || "Edit this image." });

  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts }],
      generationConfig: { responseModalities: ["IMAGE"] }
    })
  });
  const data = await r.json();
  if (!r.ok) {
    const e = new Error(data?.error?.message || `GEMINI_IMAGE_${r.status}`);
    throw e;
  }
  const imgPart = data?.candidates?.[0]?.content?.parts?.find(p => p.inlineData?.data);
  if (!imgPart) throw new Error("GEMINI_IMAGE_EMPTY_RESPONSE");
  const mime = imgPart.inlineData.mimeType || "image/png";
  return `data:${mime};base64,${imgPart.inlineData.data}`;
}

export default async function handler(req,res){
  res.setHeader("Access-Control-Allow-Origin",process.env.ALLOWED_ORIGIN||"*");
  res.setHeader("Access-Control-Allow-Headers","Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Methods","POST, OPTIONS");
  if(req.method==="OPTIONS") return res.status(204).end();
  if(req.method!=="POST") return res.status(405).json({error:"Method not allowed."});
  try{
    const decoded=await user(req);
    const db=getFirestore();
    const userSnap=await db.collection("users").doc(decoded.uid).get();
    const plan=userSnap.exists?userSnap.data().plan||"free":"free";
    const period=new Date().toISOString().slice(0,10);
    const usageRef=db.collection("users").doc(decoded.uid).collection("usage").doc(period);
    const usageSnap=await usageRef.get();
    const used=usageSnap.exists?Number(usageSnap.data().images||0):0;
    const limit=plan==="pro"?10:5;
    if(used>=limit)return res.status(429).json({error:`You've used your ${limit} image generations for this period. ${plan==="pro"?"Your daily limit resets tomorrow.":"Upgrade to Pro for 10 image generations per day."}`,limit,used,plan});

    const {prompt, imageUrl:sourceImage, size="square"}=req.body||{};
    if(!prompt && !sourceImage) return res.status(400).json({error:"Tell AURA what image you want."});
    const edit=!!sourceImage;

    const attempts = [];

    // 1) FAL / Flux first (fast, cheap) if configured
    if (process.env.FAL_KEY) {
      const list = edit
        ? (process.env.FAL_EDIT_MODELS||"fal-ai/flux-kontext/dev").split(",").map(x=>x.trim()).filter(Boolean)
        : models();
      for (const model of list) {
        attempts.push({
          name: `fal:${model}`,
          run: async () => {
            const input = edit
              ? {prompt, image_url:sourceImage}
              : {prompt, image_size:size==="portrait"?"portrait_4_3":size==="landscape"?"landscape_4_3":"square_hd", num_images:1};
            const data = await fal(model, input);
            const url = falImageUrl(data);
            if (!url) throw new Error("FAL_NO_URL");
            return url;
          }
        });
      }
    }

    // 2) Gemini image generation as fallback (also covers the case FAL_KEY is missing entirely)
    if (process.env.GEMINI_API_KEY) {
      attempts.push({
        name: `gemini:${geminiImageModel()}`,
        run: async () => geminiGenerateImage({ prompt, sourceImageDataUrl: edit ? sourceImage : null })
      });
    }

    if (!attempts.length) {
      return res.status(503).json({error:"AURA image generation is not configured yet. Add FAL_KEY or GEMINI_API_KEY."});
    }

    let last;
    for (const attempt of attempts) {
      try {
        const url = await attempt.run();
        await usageRef.set({images:FieldValue.increment(1),plan,updatedAt:FieldValue.serverTimestamp()},{merge:true});
        return res.status(200).json({url, model: attempt.name, used: used+1, limit, plan});
      } catch (e) {
        last = e;
        console.error("Image model failed", attempt.name, e.message);
      }
    }
    console.error("All image models failed", last?.message);
    return res.status(502).json({error:"AURA couldn't create that image with the currently configured image models. Please try again."});
  }catch(e){
    const status=e.message==="AUTH"?401:500;
    return res.status(status).json({error:e.message==="AUTH"?"Please sign in to use image generation.":"AURA couldn't process the image request right now."});
  }
}
