// 검증 기준점 생성기: 분산 소스(ego-gift·KR_EGOgift·tag·fusion·floor_data·override) → 기프트 454종 조립.
// 산출물 scripts/egogift-assembled-ref.json = 빌드 대조(egogift-verify-build.mjs)의 기준점. (egogifts.json 은퇴됨)
// 실행: (yeon-sim.github.io 에서) node scripts/egogift-assemble-check.mjs
import fs from "node:fs";
const D="data";
const readList=p=>{const d=JSON.parse(fs.readFileSync(p,"utf8"));return d.list||d.dataList||d;};
const rec=new Map();
for(const f of fs.readdirSync(D+"/egogift").filter(f=>f.startsWith("ego-gift")&&f.endsWith(".json")))
  for(const r of readList(D+"/egogift/"+f)) rec.set(r.id,r);   // last-seen dedup
const lang=new Map();
for(const f of fs.readdirSync(D+"/lang/kr/egogift").filter(f=>f.startsWith("KR_EGOgift")&&f.endsWith(".json")))
  for(const r of (JSON.parse(fs.readFileSync(D+"/lang/kr/egogift/"+f,"utf8")).dataList||[])) if(!lang.has(r.id))lang.set(r.id,r);
const tagMap=new Map(readList(D+"/egogift/tag.json").map(r=>[r.id,r.tags]));
const fusion=readList(D+"/fusion.json").map(f=>({result:Number(f.result),mats:f.materials.map(Number)}));
const fusionResults=new Set(fusion.map(f=>f.result));
const recipesOf=id=>fusion.filter(f=>f.result===id).map(f=>f.mats);
const specInv=new Map();
for(const f of fs.readdirSync(D+"/floor_data").filter(f=>f.endsWith(".json")))
  for(const t of readList(D+"/floor_data/"+f)) for(const g of (t.specificEgoGiftPool||[])){ if(!specInv.has(g))specInv.set(g,new Set()); specInv.get(g).add(t.id); }
const pm=new Map();
function packs(id){ if(pm.has(id))return pm.get(id); let o;
  if(fusionResults.has(id)){ const s=new Set(); for(const f of fusion.filter(f=>f.result===id))for(const m of f.mats)for(const p of packs(m))s.add(p); o=[...s]; }
  else o=[...(specInv.get(id)||[])]; o.sort((a,b)=>a-b); pm.set(id,o); return o; }
const grade=tag=>{const t=tag||[];if(t.includes("TIER_EX"))return"ex";return t.map(x=>x.replace("TIER_","")).filter(x=>/^\d$/.test(x))[0];};
function assoc(id){ const rs=recipesOf(id); if(rs.length!==1)return null; const mine=new Set(rs[0]); const out=new Set();
  for(const f of fusion){ if(f.result===id)continue; if(recipesOf(f.result).length!==1)continue; if(mine.has(f.result)||f.mats.includes(id))continue; if(f.mats.some(m=>mine.has(m)))out.add(f.result); }
  return out.size?[...out].sort((a,b)=>a-b):null; }
const ids=[...rec.keys()].filter(id=>/^9\d{3}$/.test(String(id))&&lang.has(id)&&lang.get(id).name);
const out=[];
for(const id of ids.sort((a,b)=>a-b)){
  const r=rec.get(id),L=lang.get(id),keyword=r.keyword||"None",category=r.category||keyword;
  const o={id,name:L.name,category,desc:L.desc,grade:grade(r.tag),tags:tagMap.get(id)||[]};
  o.difficulty=r.difficulty||((r.tag||[]).includes("UNRECORDABLE")?"limited":"normal");
  o.packs=packs(id);
  const ups=(r.upgradeDataList||[]).filter(u=>u.upgradeLevel>0).map(u=>{const lu=lang.get(u.localizeID)||{};return{name:lu.name,category,desc:lu.desc,tags:[]};});
  if(ups.length)o.upgrade=ups;
  if(r.convertDataList&&r.convertDataList.length)o.curse=r.convertDataList[0];
  const a=assoc(id); if(a)o.associated=a;
  if(category!==keyword)o.category_origin=keyword;
  out.push(o);
}
const cp=new Map(out.filter(g=>g.curse).map(g=>[g.curse,g.id]));
for(const g of out) if(cp.has(g.id))g.bless=cp.get(g.id);
fs.writeFileSync("scripts/egogift-assembled-ref.json",JSON.stringify(out,null,1));
console.log("조립:",out.length);
