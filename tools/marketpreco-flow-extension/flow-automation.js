(() => {
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  const all=(s,r=document)=>Array.from(r.querySelectorAll(s));
  const visible=e=>{if(!e)return false;const st=getComputedStyle(e),r=e.getBoundingClientRect();return st.display!=='none'&&st.visibility!=='hidden'&&r.width>0&&r.height>0;};
  const txt=e=>String(e?.innerText||e?.textContent||e?.getAttribute?.('aria-label')||e?.getAttribute?.('title')||'').replace(/\s+/g,' ').trim();
  async function waitFor(fn,timeout=30000,interval=250,label='elemento'){const start=Date.now();while(Date.now()-start<timeout){try{const v=fn();if(v)return v;}catch{}await sleep(interval);}throw new Error('Tempo esgotado aguardando '+label+'. O Google Flow pode ter alterado a interface.');}

  function findEditor(){
    const exact=[
      'flow-rich-text-editor.prompt-input div.ProseMirror',
      'flow-rich-text-editor [contenteditable="true"]',
      'flow-prompt-box [contenteditable="true"]',
      '[contenteditable="true"][role="textbox"]',
      '[contenteditable="true"]',
      'textarea'
    ];
    for(const s of exact){const e=all(s).find(visible);if(e)return e;}
    return null;
  }

  function setPrompt(e,text){
    e.focus();
    if(e.tagName==='TEXTAREA'){const proto=Object.getPrototypeOf(e);const setter=Object.getOwnPropertyDescriptor(proto,'value')?.set;if(setter)setter.call(e,text);else e.value=text;e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));return;}
    document.execCommand('selectAll',false,null);
    document.execCommand('insertText',false,text);
    e.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:text}));
    e.dispatchEvent(new Event('change',{bubbles:true}));
  }

  async function attachImage(e,bytes,mime,name){
    const file=new File([bytes instanceof ArrayBuffer?bytes:new Uint8Array(bytes).buffer],name||'produto.jpg',{type:mime||'image/jpeg'});
    const dt=new DataTransfer();dt.items.add(file);
    e.focus();
    e.dispatchEvent(new ClipboardEvent('paste',{clipboardData:dt,bubbles:true,cancelable:true}));
    await sleep(900);
    const consent=all('button').find(b=>visible(b)&&/^(aceitar|concordo|agree|continue)$/i.test(txt(b)));
    if(consent){consent.click();await sleep(700);}
    await waitFor(()=>all('flow-image-ingredient-chip,flow-ingredient-bar img,flow-ingredient-bar [role="img"],flow-prompt-box img').some(visible)||all('img').some(x=>visible(x)&&/ingredient|referenc/i.test(txt(x.parentElement))),30000,300,'imagem de referência');
  }

  function buttons(){return all('button').filter(visible);}
  function findButton(re){
    return buttons().find(b=>re.test(txt(b)))||buttons().find(b=>re.test(String(b.getAttribute('aria-label')||'')))||null;
  }

  async function openSettings(){
    const direct=all('flow-base-prompt-box button.settings-trigger-button,button[aria-label*="settings" i],button[aria-label*="configura" i]').find(visible);
    const b=direct||findButton(/configurações|configurações de geração|settings|generation settings|opções/i);
    if(!b)throw new Error('Configurações de geração não encontradas.');
    b.click();
    await waitFor(()=>all('flow-prompt-box-settings,[role="dialog"],mat-menu-panel').some(visible),12000,200,'painel de configurações');
  }

  async function chooseText(re,label){
    const candidates=buttons().filter(b=>re.test(txt(b))&&!/lower priority/i.test(txt(b)));
    if(candidates.length){candidates[0].click();await sleep(500);return true;}
    const nodes=all('[role="option"],mat-menu-item,button,div').filter(visible).filter(e=>re.test(txt(e)));
    if(nodes.length){nodes[0].click();await sleep(500);return true;}
    throw new Error('Opção '+label+' não encontrada.');
  }

  async function configure(){
    await openSettings();
    const model=findButton(/Omni Flash|Gemini Omni|Veo/i);
    if(model && !/Omni\s*Flash/i.test(txt(model))){model.click();await chooseText(/Omni\s*Flash/i,'Gemini Omni Flash');}
    const video=findButton(/^vídeo$|^video$|vídeo/i);
    if(video)video.click();
    await sleep(400);
    const ratio=findButton(/9\s*:\s*16|vertical/i);
    if(ratio)ratio.click();
    const dur=findButton(/10\s*(s|sec|seg|segundos)\b/i);
    if(dur)dur.click();
    const result=findButton(/1\s*(resultado|result|resultados)\b/i);
    if(result)result.click();
    document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
    await sleep(500);
  }

  function completedTiles(){
    return all('flow-video-tile,[data-testid*="video" i],video').filter(visible).filter(t=>!t.querySelector('[role="progressbar"],progress,.progress-bar,.error'));
  }

  async function waitVideo(base){
    return waitFor(()=>{const tiles=completedTiles();return tiles.length>base?tiles[tiles.length-1]:null;},9*60*1000,1500,'vídeo concluído');
  }

  async function download(tile){
    const direct=all('button').find(b=>visible(b)&&/download|baixar/i.test(txt(b)));
    if(direct){direct.click();await sleep(1500);return;}
    const more=all('button').find(b=>visible(b)&&/more_vert|mais opções|more options/i.test(String(b.getAttribute('aria-label')||'')+' '+txt(b)));
    if(more){more.click();await sleep(500);}
    const d=await waitFor(()=>all('button,[role="menuitem"]').find(x=>visible(x)&&/download|baixar/i.test(txt(x))),12000,250,'opção de download');
    d.click();await sleep(1200);
    const quality=all('button,[role="menuitem"]').find(x=>visible(x)&&/720p/i.test(txt(x)));
    if(quality){quality.click();await sleep(1800);}
  }

  async function generate(p){
    const e=await waitFor(()=>findEditor(),60000,300,'caixa de comando do Google Flow');
    const base=completedTiles().length;
    await configure();
    await attachImage(e,p.imageBytes,p.mimeType,p.imageName);
    setPrompt(e,p.prompt);
    const g=await waitFor(()=>findButton(/^gerar$|^generate$|gerar vídeo|generate video/i),20000,250,'botão Gerar');
    g.click();
    const tile=await waitVideo(base);
    await download(tile);
  }

  chrome.runtime.onMessage.addListener((m,s,sendResponse)=>{
    if(m?.type==='FLOW_PING'){sendResponse({ready:true,url:location.href});return;}
    if(m?.source!=='marketpreco-flow-extension'||m.type!=='FLOW_GENERATE_PRODUCT')return;
    generate(m.product).then(()=>sendResponse({ok:true})).catch(e=>{console.error('[MARKETPREÇO Flow]',e);sendResponse({ok:false,error:e?.message||String(e)});});
    return true;
  });
})();