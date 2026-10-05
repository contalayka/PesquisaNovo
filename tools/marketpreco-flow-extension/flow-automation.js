(() => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const all = (s, r = document) => Array.from(r.querySelectorAll(s));
  const visible = e => {
    if (!e) return false;
    const st = getComputedStyle(e), r = e.getBoundingClientRect();
    return st.display !== 'none' && st.visibility !== 'hidden' && r.width > 0 && r.height > 0;
  };
  const textOf = e => String(e?.innerText || e?.textContent || e?.getAttribute?.('aria-label') || e?.getAttribute?.('title') || e?.getAttribute?.('placeholder') || '').replace(/\s+/g,' ').trim();

  async function waitFor(fn, timeout=90000, interval=250, label='elemento') {
    const start = Date.now();
    while (Date.now()-start < timeout) {
      try { const v=fn(); if(v) return v; } catch {}
      await sleep(interval);
    }
    throw new Error('Tempo esgotado aguardando '+label+'. A interface atual do Google Flow não expôs o elemento esperado.');
  }

  function findEditor() {
    const selectors = [
      'flow-rich-text-editor.prompt-input div.ProseMirror',
      'flow-rich-text-editor [contenteditable="true"]',
      'flow-prompt-box [contenteditable="true"]',
      '[contenteditable="true"][role="textbox"]',
      '[contenteditable="true"]',
      'textarea',
      'input[type="text"]'
    ];
    for (const s of selectors) {
      const e=all(s).find(visible);
      if(e) return e;
    }
    return all('[role="textbox"],[aria-label],[placeholder]').filter(visible)
      .find(e=>/prompt|comando|command|describe|descreva|scene|cena/i.test(textOf(e))) || null;
  }

  function setPrompt(e,value) {
    e.focus();
    if(e instanceof HTMLTextAreaElement || e instanceof HTMLInputElement) {
      const proto=Object.getPrototypeOf(e);
      const setter=Object.getOwnPropertyDescriptor(proto,'value')?.set;
      if(setter) setter.call(e,value); else e.value=value;
      e.dispatchEvent(new Event('input',{bubbles:true}));
      e.dispatchEvent(new Event('change',{bubbles:true}));
      return;
    }
    try {
      document.execCommand('selectAll',false,null);
      document.execCommand('insertText',false,value);
    } catch {}
    e.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:value}));
  }

  async function attachImage(editor,bytes,mime,name) {
    const buffer=bytes instanceof ArrayBuffer ? bytes : new Uint8Array(bytes).buffer;
    const file=new File([buffer],name||'produto.jpg',{type:mime||'image/jpeg'});
    const dt=new DataTransfer();
    dt.items.add(file);
    editor.focus();
    editor.dispatchEvent(new ClipboardEvent('paste',{clipboardData:dt,bubbles:true,cancelable:true}));
    await sleep(1500);
    await waitFor(()=>all('img,video,[role="img"],[class*="ingredient" i],[data-testid*="ingredient" i]')
      .filter(visible).some(e=>e!==editor),30000,300,'imagem de referência');
  }

  const buttons=()=>all('button,[role="button"]').filter(visible);
  const findButton=re=>buttons().find(b=>re.test(textOf(b)))||null;
  async function clickIfFound(re) {
    const b=findButton(re);
    if(b){b.click();await sleep(500);return true;}
    return false;
  }

  async function configure() {
    await clickIfFound(/^vídeo$|^video$/i);
    const model=findButton(/Nano Banana Pro|Nano Banana|Omni Flash|Gemini Omni|Veo/i);
    if(model){
      model.click(); await sleep(500);
      const omni=findButton(/Omni Flash|Gemini Omni/i);
      if(omni){omni.click();await sleep(500);}
    }
    await clickIfFound(/9\s*:\s*16|vertical/i);
    await clickIfFound(/10\s*(s|sec|seg|segundos)\b/i);
    await clickIfFound(/^1\s*(resultado|result|results?)$/i);
    document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
  }

  function completedTiles(){
    return all('flow-video-tile,[data-testid*="video" i],video').filter(visible)
      .filter(t=>!t.querySelector('[role="progressbar"],progress,.progress-bar,.error'));
  }

  async function waitVideo(base){
    return waitFor(()=>{
      const tiles=completedTiles();
      return tiles.length>base ? tiles[tiles.length-1] : null;
    },9*60*1000,1500,'vídeo concluído');
  }

  async function download(tile){
    let d=all('button,[role="button"]',tile||document).find(x=>visible(x)&&/download|baixar/i.test(textOf(x)));
    if(!d) d=buttons().find(x=>/download|baixar/i.test(textOf(x)));
    if(d){d.click();await sleep(1800);return;}
    const more=buttons().find(x=>/more options|mais opções|more_vert|menu/i.test(textOf(x)));
    if(more){more.click();await sleep(500);}
    d=await waitFor(()=>all('button,[role="menuitem"]').find(x=>visible(x)&&/download|baixar/i.test(textOf(x))),12000,250,'opção de download');
    d.click(); await sleep(1000);
    const quality=all('button,[role="menuitem"]').find(x=>visible(x)&&/720p/i.test(textOf(x)));
    if(quality){quality.click();await sleep(1800);}
  }

  async function generate(p){
    const editor=await waitFor(()=>findEditor(),90000,300,'caixa de comando do Google Flow');
    const base=completedTiles().length;
    await attachImage(editor,p.imageBytes,p.mimeType,p.imageName);
    await configure();
    setPrompt(editor,p.prompt);
    const g=await waitFor(()=>findButton(/^gerar(?:\s+(?:imagem|vídeo))?$|^generate(?:\s+(?:image|video))?$|gerar vídeo|generate video|generate image|gerar image/i),30000,250,'botão Gerar');
    g.click();
    const tile=await waitVideo(base);
    await download(tile);
  }

  chrome.runtime.onMessage.addListener((m,s,sendResponse)=>{
    if(m?.type==='FLOW_PING'){sendResponse({ready:true,url:location.href});return;}
    if(m?.source!=='marketpreco-flow-extension'||m.type!=='FLOW_GENERATE_PRODUCT')return;
    generate(m.product).then(()=>sendResponse({ok:true})).catch(e=>{
      console.error('[MARKETPREÇO Flow]',e);
      sendResponse({ok:false,error:e?.message||String(e)});
    });
    return true;
  });
})();