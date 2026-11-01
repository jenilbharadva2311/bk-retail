const J=(d,s=200,h={})=>new Response(JSON.stringify(d),{status:s,headers:{"Content-Type":"application/json","Cache-Control":"no-store",...h}});
const enc=new TextEncoder(),hex=b=>[...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,"0")).join("");
async function sign(v,env){const k=await crypto.subtle.importKey("raw",enc.encode(env.SESSION_SECRET||"x"),{name:"HMAC",hash:"SHA-256"},false,["sign"]);return hex(await crypto.subtle.sign("HMAC",k,enc.encode(v)))}
async function authed(req,env){const m=(req.headers.get("Cookie")||"").match(/bk_admin=(\d+)\.([0-9a-f]+)/);return !!m&&+m[1]>Date.now()&&m[2]===await sign(m[1],env)}
const t=(v,n)=>String(v??"").trim().slice(0,n),js=v=>JSON.stringify(v);
export async function onRequest({request:req,env,params}){
 const p="/"+[].concat(params.path||[]).join("/"),m=req.method,db=env.DB;
 const body=async()=>{try{return await req.json()}catch{return{}}};
 try{
 if(m=="GET"&&p=="/products"){const r=await db.prepare("SELECT * FROM products WHERE hidden=0 AND sold_out=0 ORDER BY pos,id").all(),o={};
  for(const x of r.results){const out=JSON.parse(x.out||"[]"),g={};for(const[k,a]of Object.entries(JSON.parse(x.groups)))g[k]=a.filter(f=>!out.includes(f));o[x.slug]={n:x.name,t:x.tagline,d:x.descr,sz:JSON.parse(x.sizes),img:x.image,g,fimg:JSON.parse(x.fimg||"{}")}}return J(o)}
 let mm=p.match(/^\/img\/(\d+)$/);
 if(m=="GET"&&mm){const r=await db.prepare("SELECT data FROM images WHERE id=?").bind(+mm[1]).first();if(!r)return new Response("",{status:404});const [h,b]=r.data.split(",");const bin=Uint8Array.from(atob(b),c=>c.charCodeAt(0));return new Response(bin,{headers:{"Content-Type":h.slice(5,h.indexOf(";")),"Cache-Control":"public,max-age=31536000,immutable"}})}
 if(m=="GET"&&p=="/reviews"){const r=await db.prepare("SELECT name,city,rating,product,comment,created_at FROM reviews WHERE status='approved' ORDER BY id DESC LIMIT 300").all();return J(r.results)}
 if(m=="POST"&&p=="/reviews"){const b=await body(),r=+b.rating;if(t(b.name,60).length<2||!(r>=1&&r<=5)||t(b.comment,800).length<15)return J({error:"invalid"},400);
  await db.prepare("INSERT INTO reviews(name,city,rating,product,comment) VALUES(?,?,?,?,?)").bind(t(b.name,60),t(b.city,60),r,t(b.product,30)||"all",t(b.comment,800)).run();return J({ok:1})}
 if(m=="POST"&&p=="/wholesale"){const b=await body();if(t(b.business_name,100).length<2||t(b.mobile,30).length<8)return J({error:"invalid"},400);
  await db.prepare("INSERT INTO wholesale(business_name,contact_person,mobile,email,business_type,expected_quantity,country,city,products,message) VALUES(?,?,?,?,?,?,?,?,?,?)").bind(t(b.business_name,100),t(b.contact_person,80),t(b.mobile,30),t(b.email,120),t(b.business_type,60),t(b.expected_quantity,60),t(b.country,60),t(b.city,60),js(Array.isArray(b.products)?b.products.slice(0,10):[]),t(b.message,1000)).run();return J({ok:1})}
 if(m=="POST"&&p=="/order"){const o=(await body()).p||{},items=Array.isArray(o.items)?o.items:[];if(t(o.name,100).length<2||t(o.mobile,30).length<8||!items.length||js(items).length>20000||!t(o.address,500))return J({error:"invalid"},400);
  const n=(await db.prepare("UPDATE counters SET n=n+1 WHERE k='order' RETURNING n").first()).n,d=new Date(),oid="BK-"+String(d.getFullYear()).slice(2)+String(d.getMonth()+1).padStart(2,"0")+"-"+String(n).padStart(5,"0");
  await db.prepare("INSERT INTO orders(order_id,name,mobile,email,country,state,city,postal_code,address,notes,is_international,items,total_packs) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(oid,t(o.name,100),t(o.mobile,30),t(o.email,120),t(o.country,60),t(o.state,80),t(o.city,80),t(o.postal_code,12),t(o.address,500),t(o.notes,500),o.is_international?1:0,js(items),+o.total_packs||0).run();return J(oid)}
 if(m=="POST"&&p=="/admin/login"){const b=await body();if(!env.ADMIN_PASSWORD||t(b.password,200)!==env.ADMIN_PASSWORD){await new Promise(r=>setTimeout(r,700));return J({error:"wrong"},401)}
  const e=String(Date.now()+12*36e5);return J({ok:1},200,{"Set-Cookie":`bk_admin=${e}.${await sign(e,env)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=43200`})}
 if(p.startsWith("/admin/")){if(!await authed(req,env))return J({error:"auth"},401);
  if(p=="/admin/logout")return J({ok:1},200,{"Set-Cookie":"bk_admin=; Path=/; Max-Age=0"});
  if(m=="GET"&&p=="/admin/data"){const q=s=>db.prepare(s).all().then(r=>r.results);return J({orders:await q("SELECT * FROM orders ORDER BY id DESC LIMIT 500"),reviews:await q("SELECT * FROM reviews ORDER BY id DESC LIMIT 500"),wholesale:await q("SELECT * FROM wholesale ORDER BY id DESC LIMIT 500"),products:await q("SELECT * FROM products ORDER BY pos,id")})}
  const b=await body();
  if(p=="/admin/order"){await db.prepare("UPDATE orders SET status=?,courier=?,tracking=?,admin_note=?,sent=? WHERE id=?").bind(t(b.status,20),t(b.courier,60),t(b.tracking,80),t(b.admin_note,500),js(b.sent||{}),+b.id).run();return J({ok:1})}
  if(p=="/admin/review"){if(b.action=="delete")await db.prepare("DELETE FROM reviews WHERE id=?").bind(+b.id).run();else await db.prepare("UPDATE reviews SET status=? WHERE id=?").bind(b.action=="approve"?"approved":"rejected",+b.id).run();return J({ok:1})}
  if(p=="/admin/wholesale"){await db.prepare("UPDATE wholesale SET status=?,note=? WHERE id=?").bind(t(b.status,20),t(b.note,500),+b.id).run();return J({ok:1})}
  if(p=="/admin/image"){if(!/^data:image\/(jpeg|png|webp);base64,/.test(b.data||"")||b.data.length>600000)return J({error:"bad image"},400);const r=await db.prepare("INSERT INTO images(data) VALUES(?)").bind(b.data).run();return J({url:"/api/img/"+r.meta.last_row_id})}
  if(p=="/admin/product"){if(b.delete){await db.prepare("DELETE FROM products WHERE id=?").bind(+b.id).run();return J({ok:1})}
   const slug=t(b.slug,40).toLowerCase().replace(/[^a-z0-9-]/g,"-");if(!slug||t(b.name,80).length<2)return J({error:"name/slug"},400);
   const v=[slug,t(b.name,80),t(b.tagline,160),t(b.descr,1200),js(b.sizes||[]),t(b.image,200),js(b.groups||{}),js(b.fimg||{}),js(b.out||[]),b.sold_out?1:0,b.hidden?1:0,+b.pos||0];
   if(b.id)await db.prepare("UPDATE products SET slug=?,name=?,tagline=?,descr=?,sizes=?,image=?,groups=?,fimg=?,out=?,sold_out=?,hidden=?,pos=? WHERE id=?").bind(...v,+b.id).run();
   else await db.prepare("INSERT INTO products(slug,name,tagline,descr,sizes,image,groups,fimg,out,sold_out,hidden,pos) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)").bind(...v).run();return J({ok:1})}
 }
 return J({error:"not found"},404)}catch(e){return J({error:"server"},500)}}
