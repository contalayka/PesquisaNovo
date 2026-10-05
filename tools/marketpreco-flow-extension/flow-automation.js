(() => {
  const S={
    editor:'flow-rich-text-editor.prompt-input div.ProseMirror',
    settings:'flow-base-prompt-box div.submit-controls button.settings-trigger-button',
    generate:'flow-generate-icon-button button.generate-icon-button',
    tiles:'flow-video-tile',
    more:'flow-hotbar-container div.hotbar-inner button:has(mat-icon:has-text("more_vert"))',
    download:'div.mat-mdc-menu-content flow-menu-item button[role="menuitem"]:has(mat-icon:has-text("download"))',
    consent:'flow-upload-consent-dialog mat-dialog-actions div.agree-actions-group button'
  };
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  const all=(s,r=document)=>Array.from(r.querySelectorAll(s));
  const visible=e=>{if(!e)return false;const st=getComputedStyle(e),r=e.getBoundingClientRect();return st.display!=='none'&&st.visibility!=='hidden'&&r.width>0&&r.height>0;};
  async function waitFor(fn,timeout=30000,interval=250,label='elemento'){const start=Date.now();while(Date.now()-start<timeout){const v=fn();if(v)return v;await sleep(interval);}throw new Error('Tempo esgotado aguardando '+label+'. O Google Flow pode ter alterado a interface.');}
  const editor=()=>document.querySelector(S.editor);
  function setPrompt(e,text){e.focus();e.innerHTML='<p><br class="ProseMirror-trailingBreak"></p>';document.execCommand('selectAll',false,null);document.execCommand('insertText',false,text);e.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:text}));e.dispatchEvent(new Event('change',{bubbles:true}));}
  async function attachImage(e,bytes,mime,name){
    const file=new File([bytes instanceof ArrayBuffer?bytes:new Uint8Array(bytes).buffer],name||'produto.jpg',{type:mime||'image/jpeg'});
    const dt=new DataTransfer();dt.items.add(file);
    e.dispatchEvent(new ClipboardEvent('paste',{clipboardData:dt,bubbles:true,cancelable:true}));
    await sleep(700);
    const consent=document.querySelector(S.consent);if(consent&&visible(consent)){consent.click();await sleep(500);}
    await waitFor(()=>all('flow-image-ingredient-chip, flow-ingredient-bar flow-image-ingredient-chip').length>0,true?20000:20000,300,'imagem de referência');
  }
  const menuItems=()=>all('div.mat-mdc-menu-content flow-menu-item button[role="menuitem"]').filter(visible);
  async function openSettings(){const b=document.querySelector(S.settings);if(!b||!visible(b))throw new Error('Configurações de geração não encontradas.');b.click();await waitFor(()=>document.querySelector('flow-prompt-box-settings'),10000,200,'painel de configurações');}
  async function clickOne(re){const item=await waitFor(()=>{const a=menuItems().filter(x=>re.test(x.textContent||'')&&!/Lower Priority/i.test(x.textContent||''));return a.length===1?a[0]:null;},10000,200,'opção de configuração');item.click();await sleep(350);}
  async function configure(){
    await openSettings();
    const panel=document.querySelector('flow-prompt-box-settings');
    const model=panel?.querySelector('button span.model-select-trigger-content')?.closest('button');
    if(!model)throw new Error('Seletor de modelo não encontrado.');
    if(!/Omni\s*(?:1\.1\s*)?Flash/i.test(model.textContent||'')){model.click();await clickOne(/Omni/i);}
    const video=panel.querySelector('mat-button-toggle:has(mat-icon:has-text("videocam")) button');if(!video)throw new Error('Modo Vídeo não encontrado.');video.click();await sleep(250);
    const ing=panel.querySelector('mat-button-toggle:has(mat-icon:has-text("chrome_extension")) button');if(ing){ing.click();await sleep(250);}
    const ratio=Array.from(panel.querySelectorAll('mat-button-toggle button,button')).find(b=>/9\s*:\s*16/.test(b.textContent||'')||b.querySelector('mat-icon')?.textContent.trim()==='crop_9_16');if(ratio){ratio.click();await sleep(200);}
    const dur=Array.from(panel.querySelectorAll('mat-button-toggle button,button')).find(b=>/^\s*10\s*(s|sec|seg|segundos|dtk)?\s*$/i.test((b.textContent||'')));if(dur){dur.click();await sleep(200);}
    document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));await sleep(350);
  }
  function completedCount(){return all(S.tiles).filter(t=>visible(t)&&!t.querySelector('flow-error-tile,.error-tile,.error-tile-content,.progress-bar,[role="progressbar"]')).length;}
  async function waitVideo(base){return waitFor(()=>{const tiles=all(S.tiles).filter(visible).filter(t=>!t.querySelector('flow-error-tile,.error-tile,.error-tile-content,.progress-bar,[role="progressbar"]'));return tiles.length>base?tiles[tiles.length-1]:null;},9*60*1000,1500,'vídeo concluído');}
  async function download(tile){
    const more=tile.querySelector(S.more);if(!more||!visible(more))throw new Error('Menu do vídeo não encontrado.');more.click();
    const d=await waitFor(()=>{const x=document.querySelector(S.download);return x&&visible(x)?x:null;},10000,200,'opção de download');d.click();
    await sleep(1000);
    await waitFor(()=>!document.querySelector(S.download),10000,200,'fechamento do menu');
  }
  async function generate(p){
    const e=await waitFor(()=>editor()&&visible(editor())?editor():null,45000,300,'caixa de comando');
    const base=completedCount();
    await configure();
    await attachImage(e,p.imageBytes,p.mimeType,p.imageName);
    setPrompt(e,p.prompt);
    const g=await waitFor(()=>{const b=document.querySelector(S.generate);return b&&!b.hasAttribute('disabled')&&!b.classList.contains('mat-mdc-button-disabled')?b:null;},10000,200,'botão Gerar');
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