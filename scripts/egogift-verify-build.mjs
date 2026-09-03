// 빌드 검증: public/index.html 의 giftMap 을 scripts/egogift-assembled-ref.json 과 대조.
// 텍스트는 render 동등 정규화(jsonify 직렬화 아티팩트 = 사이트 parseDesc/strip이 처리하는 것과 등가).
// 실행: (yeon-sim.github.io 에서) node scripts/egogift-verify-build.mjs   (hugo 빌드 후)
import fs from "node:fs";
const html=fs.readFileSync("public/index.html","utf8");
const gm=eval("({"+html.match(/const giftMap = \{([\s\S]*?)\n\};/)[1]+"})");
const built=new Map(Object.entries(gm).map(([k,v])=>[Number(k),v]));
const R=new Map(JSON.parse(fs.readFileSync("scripts/egogift-assembled-ref.json","utf8")).map(g=>[g.id,g]));
const BS=String.fromCharCode(92);
const render=s=>typeof s==="string"?s.replace(/^"|"$/g,"").split(BS+"n").join("\n").split(BS+'"').join('"'):s;
const J=v=>JSON.stringify(v===undefined||v===null?null:v);
const onlyB=[...built.keys()].filter(id=>!R.has(id)), onlyR=[...R.keys()].filter(id=>!built.has(id));
const f={grade:0,category:0,categoryOrigin:0,difficulty:0,packs:0,curse:0,bless:0,associated:0,tags:0,name:0,desc:0,upgrade:0};
const n2=new Map(JSON.parse(fs.readFileSync("data/lang/kr/yeonsim/KR_Tags.json","utf8")).map(e=>[e.id,e.name]));
for(const [id,b] of built){ const r=R.get(id); if(!r)continue;
  if(J(b.grade)!==J(r.grade))f.grade++;
  if(J(b.category)!==J(r.category))f.category++;
  if(J(b.categoryOrigin||"")!==J(r.category_origin||""))f.categoryOrigin++;
  if(J(b.difficulty)!==J(r.difficulty))f.difficulty++;
  if(J([...(b.packs||[])].sort((a,c)=>a-c))!==J([...(r.packs||[])].sort((a,c)=>a-c)))f.packs++;
  if(J(b.curse?Number(b.curse):null)!==J(r.curse??null))f.curse++;
  if(J(b.bless?Number(b.bless):null)!==J(r.bless??null))f.bless++;
  if(J([...(b.associated||[])].sort((a,c)=>a-c))!==J([...(r.associated||[])].sort((a,c)=>a-c)))f.associated++;
  if(J(b.tags||[])!==J((r.tags||[]).map(t=>n2.get(t)).filter(Boolean)))f.tags++;
  if(render(b.name)!==r.name)f.name++;
  if(render(b.desc)!==r.desc)f.desc++;
  const bu=(b.upgrades||[]).map(u=>({n:render(u.name),d:render(u.desc),c:u.category,t:u.tags}));
  const ru=(r.upgrade||[]).map(u=>({n:u.name,d:u.desc,c:u.category,t:u.tags}));
  if(J(bu)!==J(ru))f.upgrade++;
}
const total=Object.values(f).reduce((a,b)=>a+b,0)+onlyB.length+onlyR.length;
console.log("멤버십: built",built.size,"ref",R.size,"| built에만",onlyB.length,"ref에만",onlyR.length);
console.log("필드 불일치:",JSON.stringify(f));
console.log(total===0?"✅ 빌드 == 기준점 (완전일치)":"⚠ 불일치 "+total+"건");
