// Record the unmodified browser-demo build. No API responses or balances are injected.
const {chromium} = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'public/captures');
const BASE = process.env.ARCANA_DEMO_URL || 'http://127.0.0.1:5176';
const scenes = [];
fs.mkdirSync(OUT, {recursive:true});
(async()=>{
 const browser = await chromium.launch({executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium',args:['--no-sandbox']});
 const context = await browser.newContext({viewport:{width:1280,height:800},recordVideo:{dir:path.join(ROOT,'out/raw'),size:{width:1280,height:800}},acceptDownloads:true});
 const page = await context.newPage();
 const started = Date.now();
 const errors=[]; page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>document.addEventListener('DOMContentLoaded',()=>{
   // Capture-only privacy mask and visible pointer. Does not change application state.
   const style=document.createElement('style');style.textContent='input[aria-label="Receipt code"]{filter:blur(12px)} span.select-all, .text-signal.font-mono{filter:blur(12px)}';document.head.appendChild(style); const mask=()=>{document.querySelectorAll('span').forEach(el=>{if(/^RCT-[A-Z0-9-]+$/.test(el.textContent.trim()))el.style.filter='blur(14px)'});}; new MutationObserver(mask).observe(document.body,{childList:true,subtree:true});mask();
   const cursor=document.createElement('div');cursor.id='capture-cursor';cursor.style.cssText='position:fixed;width:22px;height:28px;top:-100px;left:-100px;pointer-events:none;z-index:999999;filter:drop-shadow(0 1px 2px #fff)';
   cursor.innerHTML='<svg viewBox="0 0 24 30"><path d="M2 1v24l7-7 5 10 4-2-5-9h10Z" fill="#161612" stroke="#fff" stroke-width="1.4"/></svg>';
   document.body.appendChild(cursor);
   document.addEventListener('mousemove',e=>{cursor.style.left=e.clientX+'px';cursor.style.top=e.clientY+'px'});
 }));
 const wait=ms=>page.waitForTimeout(ms);
 const click=async locator=>{const el=typeof locator==='string'?page.locator(locator).first():locator;await el.scrollIntoViewIfNeeded();const r=await el.boundingBox();await page.mouse.move(r.x+r.width/2,r.y+r.height/2,{steps:22});await wait(350);await el.click()};
 const scene=async(name,fn,hold=2200)=>{const start=(Date.now()-started)/1000;await fn();await wait(hold);await page.screenshot({path:path.join(OUT,name+'.png')});scenes.push({name,start,end:(Date.now()-started)/1000});fs.writeFileSync(path.join(OUT,'scenes.json'),JSON.stringify(scenes,null,2));console.log(name)};
 try {
 await scene('home',async()=>{await page.goto(BASE);await page.getByText('Explore the demo market',{exact:false}).waitFor();await page.evaluate(()=>document.fonts.ready);await wait(2000);await page.getByText('Powered by Zcash',{exact:true}).first().scrollIntoViewIfNeeded()},4000);
 await scene('alias',async()=>{await page.goto(BASE+'/auth?mode=signup');await wait(700);await page.locator('#alias').pressSequentially('solara',{delay:95});await page.locator('#pass').fill('amber paper river studio 543');await wait(500);await click('button[type=submit]');await page.waitForURL('**/studio')},1200);
 await page.goto(BASE+'/studio?tab=keys');await click('button:has-text("Create my keys")');await page.getByText('Keys active in this browser').waitFor();
 await scene('market',async()=>{await page.goto(BASE+'/market');await page.getByText('Cipher Grid',{exact:true}).waitFor();await wait(1600);await click(page.getByRole('button',{name:'Collectibles',exact:true}));await wait(900);await click(page.getByText('Cipher Grid',{exact:true}));await page.waitForURL('**/listing/*')},3200);
 const listingURL=page.url();
 await scene('listing',async()=>{await page.evaluate(()=>window.scrollTo(0,160));await wait(700)},2500);
 await scene('message',async()=>{await click('button:has-text("privately")');await page.waitForURL('**/studio?tab=messages*');await click('button:has-text("Trust this key")');await page.locator('textarea').pressSequentially('Is the original file included?',{delay:65});await click('button:has(svg.lucide-send)');await page.getByText(/Hi — @.*here \(simulated seller\)/).waitFor({timeout:20000});},3200);
 await page.goto(listingURL);await click('button:has-text("Request to buy")');await page.getByRole('button',{name:/Checkout/}).waitFor({timeout:25000});
 await scene('invoice',async()=>{await click('button:has-text("Checkout")');await page.waitForURL('**/orders/*');await page.reload();await page.getByText('Send payment',{exact:true}).waitFor();await page.evaluate(()=>window.scrollTo(0,180))},5500);
 await scene('funded',async()=>{await page.getByRole('button',{name:'Decrypt locally & verify'}).waitFor({timeout:45000});await page.evaluate(()=>window.scrollTo(0,110))},4000);
 let sha;
 await scene('decrypt',async()=>{const event=page.waitForEvent('download');await click('button:has-text("Decrypt locally & verify")');const dl=await event;const saved=path.join(ROOT,'out/delivered.svg');await dl.saveAs(saved);sha=crypto.createHash('sha256').update(fs.readFileSync(saved)).digest('hex');await page.getByText('Checksum matches',{exact:true}).waitFor();},4200);
 await scene('accept',async()=>{await page.getByRole('button',{name:'Fetch & verify'}).waitFor();await click('button:has-text("Fetch & verify")');await page.getByText('Signature valid against the published key',{exact:true}).waitFor();await page.getByText('Signature valid against the published key',{exact:true}).scrollIntoViewIfNeeded()},4200);
 await scene('terms',async()=>{await page.goto(BASE+'/terms#escrow');await page.locator('#escrow').scrollIntoViewIfNeeded();await page.evaluate(()=>window.scrollBy(0,180));await wait(1200)},2200);
 await scene('privacy',async()=>{await page.goto(BASE+'/privacy');await page.locator('#collect').scrollIntoViewIfNeeded();await page.evaluate(()=>window.scrollBy(0,220));await wait(1200)},2200);
 const orderScene=scenes.find(x=>x.name==='accept');
 fs.writeFileSync(path.join(OUT,'verification.json'),JSON.stringify({sourceCommit:process.env.SOURCE_COMMIT||'502ece5',mode:'browser-demo',localBuild:true,simulatedSeller:true,simulatedPayment:true,liveZcashVerified:false,downloadSha256:sha,checksumMatchedInUI:true,demoReceiptSignatureVerified:true,pageErrors:errors,scenes},null,2));
 if(errors.length)throw new Error('Browser errors: '+errors.join('; '));
 } catch(e) {await page.screenshot({path:path.join(ROOT,'out/capture-failure.png')});throw e}
 finally {const video=page.video();await context.close();await video.saveAs(path.join(ROOT,'out/raw/journey.webm'));await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
