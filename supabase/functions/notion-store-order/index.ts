// SPDX-License-Identifier: MIT
// Public guest checkout -> existing Notion commercial request register.
// Notion credentials and customer data never reach the browser.
const ALLOWED_ORIGINS=new Set(["https://balabs-biotech.github.io"]);
const DATA_SOURCE_ID=Deno.env.get("NOTION_STORE_DATA_SOURCE_ID")??"7a40b95b-e353-4eb9-a471-99c97c5904f5";
const NOTION_VERSION="2025-09-03",MAX_BODY_BYTES=16384,MAX_ITEMS=20;
const rateBuckets=new Map<string,{started:number;count:number}>();
type Obj=Record<string,unknown>;
function isObject(v:unknown):v is Obj{return typeof v==="object"&&v!==null&&!Array.isArray(v);}
function clean(v:unknown,max:number):string{return typeof v==="string"?v.trim().replace(/\u0000/g,"").slice(0,max):"";}
function rich(v:string){return {rich_text:v?[{type:"text",text:{content:v.slice(0,1900)}}]:[]};}
function json(status:number,body:Obj,origin:string|null){
 const h=new Headers({"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","Vary":"Origin"});
 if(origin&&ALLOWED_ORIGINS.has(origin)){h.set("Access-Control-Allow-Origin",origin);h.set("Access-Control-Allow-Methods","POST, OPTIONS");h.set("Access-Control-Allow-Headers","apikey, content-type, x-client-info");}
 return new Response(JSON.stringify(body),{status,headers:h});
}
function limited(req:Request):boolean{
 const ip=(req.headers.get("cf-connecting-ip")??req.headers.get("x-real-ip")??req.headers.get("x-forwarded-for")?.split(",").at(-1)??"unknown").trim().slice(0,100);
 const now=Date.now(),bucket=rateBuckets.get(ip);
 if(!bucket||now-bucket.started>600000){rateBuckets.set(ip,{started:now,count:1});return false;}
 bucket.count++;return bucket.count>5;
}
function category(items:Obj[]):string{
 const families=new Set(items.map(x=>clean(x.family,40)));
 if(families.size!==1)return "Autre";
 const f=[...families][0];
 if(f==="agar")return "Géloses";
 if(f==="liquid"||f==="spawn")return "Cultures";
 if(f==="substrate")return "Milieux";
 return "Autre";
}
async function notion(path:string,token:string,method:string,body?:Obj){
 const r=await fetch("https://api.notion.com/v1"+path,{method,headers:{"Authorization":"Bearer "+token,"Notion-Version":NOTION_VERSION,"Content-Type":"application/json"},...(body?{body:JSON.stringify(body)}:{})});
 return {response:r,data:await r.json().catch(()=>({}))};
}
Deno.serve(async(req:Request)=>{
 const origin=req.headers.get("origin");
 if(origin&&!ALLOWED_ORIGINS.has(origin))return json(403,{error:"origin_not_allowed"},origin);
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:{"Access-Control-Allow-Origin":origin??"https://balabs-biotech.github.io","Access-Control-Allow-Methods":"POST, OPTIONS","Access-Control-Allow-Headers":"apikey, content-type, x-client-info","Vary":"Origin"}});
 if(req.method!=="POST")return json(405,{error:"method_not_allowed"},origin);
 const declared=Number(req.headers.get("content-length")??"0");
 if(declared>MAX_BODY_BYTES)return json(413,{error:"request_too_large"},origin);
 const raw=await req.text();if(new TextEncoder().encode(raw).byteLength>MAX_BODY_BYTES)return json(413,{error:"request_too_large"},origin);
 let body:unknown;try{body=JSON.parse(raw);}catch{return json(400,{error:"invalid_json"},origin);}
 if(!isObject(body)||!isObject(body.customer)||!Array.isArray(body.items))return json(422,{error:"invalid_payload"},origin);
 if(clean(body.website,200))return json(422,{error:"invalid_payload"},origin);
 if(limited(req))return json(429,{error:"rate_limited"},origin);
 const token=Deno.env.get("NOTION_API_KEY");
 if(!token){console.error("[notion-store-order] NOTION_API_KEY missing");return json(503,{error:"store_temporarily_unavailable"},origin);}
 const c=body.customer;
 const name=clean(c.name,160),phone=clean(c.phone,40),email=clean(c.email,254).toLowerCase(),org=clean(c.organization,180);
 const wilaya=clean(c.wilaya,100),commune=clean(c.commune,100),address=clean(c.address,500),note=clean(c.note,1000);
 const delivery=clean(c.delivery_mode,20),locale=clean(c.locale,5);
 if(name.length<2||phone.length<6||!wilaya||(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))||
 !["pickup","delivery"].includes(delivery)||!["fr","en","ar","pt"].includes(locale)||c.consent!==true||(delivery==="delivery"&&!address))
 return json(422,{error:"invalid_customer_fields"},origin);
 if(body.items.length<1||body.items.length>MAX_ITEMS)return json(422,{error:"invalid_item_count"},origin);
 const items:Obj[]=[];
 for(const rawItem of body.items){
  if(!isObject(rawItem))return json(422,{error:"invalid_item"},origin);
  const code=clean(rawItem.product_code,80),title=clean(rawItem.title,180),family=clean(rawItem.family,40),quantity=Number(rawItem.quantity);
  if(!code||!title||!Number.isInteger(quantity)||quantity<1||quantity>1000)return json(422,{error:"invalid_item"},origin);
  items.push({product_code:code,title,family,quantity});
 }
 const requestId=clean(body.request_id,50);
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId))
 return json(422,{error:"invalid_request_reference"},origin);
 const orderRef="BA-"+new Date().toISOString().slice(0,10).replace(/-/g,"")+"-"+requestId.slice(0,6).toUpperCase();
 const pageTitle="Boutique BA Labs — "+orderRef;
 try{
  const existing=await notion("/data_sources/"+DATA_SOURCE_ID+"/query",token,"POST",{filter:{property:"Demande",title:{equals:pageTitle}},page_size:1});
  if(!existing.response.ok){const code=isObject(existing.data)?clean(existing.data.code,80):"";console.error("[notion-store-order] lookup failed",existing.response.status,code);return json(503,{error:"notion_unavailable"},origin);}
  const found=isObject(existing.data)&&Array.isArray(existing.data.results)?existing.data.results:[];
  if(found.length)return json(200,{ok:true,order_ref:orderRef,duplicate:true},origin);
  const productText=items.map(x=>Number(x.quantity)+" × "+clean(x.title,180)+" ["+clean(x.product_code,80)+"]").join("\n");
  const totalQuantity=items.reduce((sum,x)=>sum+Number(x.quantity),0);
  const formatText=items.map(x=>clean(x.product_code,80)+" : "+Number(x.quantity)+" unité(s) — conditionnement à confirmer").join("\n");
  const message=[
   "Référence : "+orderRef,
   "Mode : "+(delivery==="pickup"?"Retrait sur place":"Livraison / expédition"),
   delivery==="delivery"?"Adresse : "+[address,commune,wilaya].filter(Boolean).join(", "):"Wilaya : "+wilaya,
   note?"Instructions : "+note:"",
   "Prix, disponibilité, frais et délai à confirmer par BA Labs.",
   "Aucun paiement effectué à ce stade."
  ].filter(Boolean).join("\n");
  const internal=[
   "Origine : Boutique en ligne BA Labs",
   "Référence commande : "+orderRef,
   "Request ID : "+requestId,
   "Traitement : demande reçue, en attente de qualification et de confirmation humaine."
  ].join("\n");
  const properties:Obj={
   "Demande":{title:[{type:"text",text:{content:pageTitle}}]},
   "Statut":{select:{name:"🆕 Nouvelle"}},
   "Nom":rich(name),"Téléphone":{phone_number:phone},"Wilaya":rich(wilaya),
   "Produit":rich(productText),"Format":rich(formatText),"Quantité":{number:totalQuantity},
   "Catégorie":{select:{name:category(items)}},
   "Mode de livraison":{select:{name:delivery==="pickup"?"Retrait sur place":"Livraison"}},
   "Message":rich(message),"Notes internes":rich(internal)
  };
  if(email)properties["Email"]={email};
  if(org)properties["Organisation"]=rich(org);
  const created=await notion("/pages",token,"POST",{parent:{type:"data_source_id",data_source_id:DATA_SOURCE_ID},properties});
  if(!created.response.ok){const code=isObject(created.data)?clean(created.data.code,80):"";console.error("[notion-store-order] create failed",created.response.status,code);return json(503,{error:"notion_write_failed"},origin);}
  return json(201,{ok:true,order_ref:orderRef},origin);
 }catch(error){
  console.error("[notion-store-order] unexpected failure",error instanceof Error?error.message:"unknown");
  return json(503,{error:"store_temporarily_unavailable"},origin);
 }
});