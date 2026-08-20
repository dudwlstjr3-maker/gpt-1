import { chromium } from 'playwright';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const ROOT='/home/user/gpt-1', PORT=8781;
const s=http.createServer((q,r)=>{const f=path.join(ROOT,(q.url.split('?')[0].replace(/^\/+/,''))||'index.html');
  if(!fs.existsSync(f)){r.writeHead(404);return r.end()} r.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});fs.createReadStream(f).pipe(r)});
await new Promise(r=>s.listen(PORT,r));
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
const p=await b.newPage({viewport:{width:1400,height:1000}});
p.on('pageerror',e=>console.log('PAGEERROR:',e.message));
p.on('console',m=>{if(m.type()==='error')console.log('CONSOLE:',m.text().slice(0,200))});
await p.goto(`http://localhost:${PORT}/index.html`,{waitUntil:'networkidle'});
await p.click('nav button[data-v="tour"]'); await p.waitForTimeout(300);
// 슬라이드 2장 준비
await p.evaluate(()=>{
  localStorage.setItem('hb.tdslides', JSON.stringify([
    {id:'s1',title:'다음 대회 — 금요일 몬스터',body:'매주 금요일 19:30 · 바이인 3만원 · 500만 스택'},
    {id:'s2',title:'매장 공지',body:'주차는 건물 뒤편 공영주차장을 이용해 주세요'}
  ]));
  localStorage.setItem('hb.adcfg', JSON.stringify({on:true,sec:5,bigOnBreak:true}));
});
await p.reload({waitUntil:'networkidle'});
await p.click('nav button[data-v="tour"]'); await p.waitForTimeout(300);
await p.click('#td-quick'); await p.waitForTimeout(600);   // 대회 시작
const themes=['night','black','felt','wine','steel','bright'];
for(const t of themes){
  await p.evaluate(x=>{ localStorage.setItem('hb.btheme', JSON.stringify(x)); }, t);
  await p.click('nav button[data-v="home"]'); await p.click('nav button[data-v="tour"]');
  await p.waitForTimeout(450);
  await p.locator('#td-screen').screenshot({path:`/home/user/gpt-1/tools/_shots/board-${t}.png`});
}
// 꾸미기 카드
await p.locator('.tdboard').screenshot({path:'/home/user/gpt-1/tools/_shots/boardcard.png'});
await b.close(); s.close();
console.log('done');
