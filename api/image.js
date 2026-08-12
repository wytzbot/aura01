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
function imageUrl(data) {
  return data?.images?.[0]?.url || data?.image?.url || data?.output?.images?.[0]?.url || null;
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
    if(!process.env.FAL_KEY) return res.status(503).json({error:"AURA image generation is not configured yet."});
    const {prompt, imageUrl:sourceImage, size="square"}=req.body||{};
    if(!prompt && !sourceImage) return res.status(400).json({error:"Tell AURA what image you want."});
    const edit=!!sourceImage;
    const list=edit
      ? (process.env.FAL_EDIT_MODELS||"fal-ai/flux-kontext/dev").split(",").map(x=>x.trim()).filter(Boolean)
      : models();
    let last;
    for(const model of list){
      try{
        const input=edit
          ? {prompt, image_url:sourceImage}
          : {prompt, image_size:size==="portrait"?"portrait_4_3":size==="landscape"?"landscape_4_3":"square_hd", num_images:1};
        const data=await fal(model,input);
        const url=imageUrl(data);
        if(url){ await usageRef.set({images:FieldValue.increment(1),plan,updatedAt:FieldValue.serverTimestamp()},{merge:true}); return res.status(200).json({url,model,used:used+1,limit,plan}); }
      }catch(e){last=e; console.error("FAL model failed",model,e.message);}
    }
    return res.status(502).json({error:"AURA couldn't create that image with the currently configured image models. Please try again."});
  }catch(e){
    const status=e.message==="AUTH"?401:500;
    return res.status(status).json({error:e.message==="AUTH"?"Please sign in to use image generation.":"AURA couldn't process the image request right now."});
  }
}
