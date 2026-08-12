import { getApps, initializeApp, cert } from "firebase-admin/app";
import { getAuth, getFirestore } from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
function init(){
 if(!getApps().length){
  const projectId=process.env.FIREBASE_PROJECT_ID, clientEmail=process.env.FIREBASE_CLIENT_EMAIL, privateKey=process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g,"\n");
  if(!projectId||!clientEmail||!privateKey) throw new Error("CONFIG");
  initializeApp({credential:cert({projectId,clientEmail,privateKey})});
 }
}
async function auth(req){const h=req.headers.authorization||"";if(!h.startsWith("Bearer "))throw new Error("AUTH");init();return getAuth().verifyIdToken(h.slice(7));}
export default async function handler(req,res){
 res.setHeader("Access-Control-Allow-Origin",process.env.ALLOWED_ORIGIN||"*");
 res.setHeader("Access-Control-Allow-Headers","Content-Type, Authorization");
 if(req.method!=="POST")return res.status(405).json({error:"Method not allowed."});
 try{
  const u=await auth(req), db=getFirestore();
  const userSnap=await db.collection("users").doc(u.uid).get();
  const userPlan=userSnap.exists?userSnap.data().plan||"free":"free";
  const period=new Date().toISOString().slice(0,10);
  const ref=db.collection("users").doc(u.uid).collection("usage").doc(period);
  const snap=await ref.get();
  const data=snap.exists?snap.data():{};
  const plan=userPlan;
  const images=Number(data.images||0);
  const limit=plan==="pro"?10:5;
  if(req.body?.kind==="image"){
    if(images>=limit)return res.status(429).json({allowed:false,limit,used:images,plan});
    await ref.set({images:FieldValue.increment(1),updatedAt:FieldValue.serverTimestamp()},{merge:true});
    return res.json({allowed:true,limit,used:images+1,plan});
  }
  return res.json({allowed:true,plan,limit,used:images});
 }catch(e){return res.status(e.message==="AUTH"?401:500).json({error:e.message==="AUTH"?"Please sign in first.":"Usage service unavailable."});}
}
