(() => {
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

  function roots(root = document, out = []) {
    out.push(root);
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
    let node;
    while ((node = walker.nextNode())) {
      if (node.shadowRoot) roots(node.shadowRoot, out);
    }
    return out;
  }

  const each = (selector) => {
    const found = [];
    for (const root of roots()) {
      try { found.push(...root.querySelectorAll(selector)); } catch {}
    }
    return [...new Set(found)];
  };

  const visible = el => {
    if (!el) return false;
    const r = el.getBoundingClientRect?.();
    if (!r || r.width <= 0 || r.height <= 0) return false;
    const s = getComputedStyle(el);
    return s.display !== 'none' && s.visibility !== 'hidden' && s.opacity !== '0';
  };

  const label = el => String(
    el?.innerText ||
    el?.textContent ||
    el?.getAttribute?.('aria-label') ||
    el?.getAttribute?.('data-tooltip') ||
    el?.getAttribute?.('title') ||
    el?.getAttribute?.('placeholder') ||
    ''
  ).replace(/\s+/g, ' ').trim();

  const click = el => {
    if (!el) return false;
    el.scrollIntoView?.({block:'center', inline:'center'});
    el.click();
    return true;
  };

  async function waitFor(fn, timeout, name) {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      try {
        const value = fn();
        if (value) return value;
      } catch {}
      await sleep(300);
    }
    throw new Error('Tempo esgotado aguardando ' + name + '. O Google Flow mudou a interface.');
  }

  function findPrompt() {
    const candidates = [
      ...each('[contenteditable="true"]'),
      ...each('textarea'),
      ...each('input[type="text"]')
    ].filter(visible);

    const preferred = candidates.find(el => {
      const t = label(el);
      return /prompt|command|comando|describe|descreva|scene|cena/i.test(t) ||
             el.matches?.('.ProseMirror');
    });
    return preferred || candidates[0] || null;
  }

  function setText(el, value) {
    el.focus();
    if (el.matches?.('textarea,input')) {
      const proto = Object.getPrototypeOf(el);
      const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
      setter ? setter.call(el, value) : (el.value = value);
      el.dispatchEvent(new InputEvent('input', {bubbles:true, inputType:'insertText', data:value}));
      el.dispatchEvent(new Event('change', {bubbles:true}));
      return;
    }
    try {
      document.execCommand('selectAll', false);
      document.execCommand('insertText', false, value);
    } catch {
      el.textContent = value;
    }
    el.dispatchEvent(new InputEvent('input', {bubbles:true, inputType:'insertText', data:value}));
  }

  async function uploadImage(bytes, mime, name) {
    const buffer = bytes instanceof ArrayBuffer ? bytes : new Uint8Array(bytes).buffer;
    const file = new File([buffer], name || 'produto.jpg', {type: mime || 'image/jpeg'});
    const inputs = each('input[type="file"]').filter(visible);

    if (inputs.length) {
      const input = inputs[0];
      const dt = new DataTransfer();
      dt.items.add(file);
      Object.defineProperty(input, 'files', {value: dt.files, configurable: true});
      input.dispatchEvent(new Event('input', {bubbles:true}));
      input.dispatchEvent(new Event('change', {bubbles:true}));
    } else {
      const editor = findPrompt();
      if (!editor) throw new Error('Caixa de comando do Google Flow não encontrada.');
      const dt = new DataTransfer();
      dt.items.add(file);
      editor.focus();
      editor.dispatchEvent(new ClipboardEvent('paste', {
        clipboardData: dt, bubbles:true, cancelable:true
      }));
    }

    await waitFor(() => {
      const media = each('img,video,[role="img"],[data-testid*="ingredient" i],[class*="ingredient" i]')
        .filter(visible);
      return media.length > 0;
    }, 30000, 'a imagem do produto');
  }

  function findButton(regex) {
    return each('button,[role="button"]').filter(visible).find(b => regex.test(label(b)));
  }

  function clickButton(regex) {
    const b = findButton(regex);
    return b ? click(b) : false;
  }

  async function configureVideo() {
    // Flow's current desktop flow: model selector -> Video -> preferences.
    clickButton(/^video$|^vídeo$/i);
    await sleep(700);

    const model = findButton(/Nano Banana Pro|Nano Banana|Omni Flash|Gemini Omni|Veo/i);
    if (model) {
      click(model);
      await sleep(500);
      const omni = findButton(/Omni Flash|Gemini Omni/i);
      if (omni) {
        click(omni);
        await sleep(500);
      }
    }

    clickButton(/9\s*[:x]\s*16|vertical/i);
    clickButton(/10\s*(s|sec|seg|segundos)\b/i);
    clickButton(/^1\s*(output|outputs|result|results|resultado|resultados)$/i);

    document.dispatchEvent(new KeyboardEvent('keydown', {key:'Escape', bubbles:true}));
  }

  function generatedMedia() {
    return each('video,flow-video-tile,[data-testid*="video" i]')
      .filter(visible)
      .filter(el => !el.querySelector?.('[role="progressbar"],progress,[aria-busy="true"]'));
  }

  async function waitForNewVideo(before) {
    return waitFor(() => {
      const now = generatedMedia();
      return now.length > before ? now[now.length - 1] : null;
    }, 9 * 60 * 1000, 'o vídeo ser concluído');
  }

  async function downloadVideo(tile) {
    let button = each('button,[role="button"]').filter(visible).find(b =>
      /download|baixar/i.test(label(b)) && (!tile || tile.contains(b))
    );

    if (!button) {
      button = each('button,[role="button"]').filter(visible).find(b =>
        /download|baixar/i.test(label(b))
      );
    }

    if (button) {
      click(button);
      await sleep(1800);
      return;
    }

    const more = each('button,[role="button"]').filter(visible).find(b =>
      /more|mais|options|opções|menu/i.test(label(b))
    );
    if (more) {
      click(more);
      await sleep(700);
    }

    const downloadItem = await waitFor(
      () => each('[role="menuitem"],button,[role="option"]').filter(visible)
        .find(x => /download|baixar/i.test(label(x))),
      15000,
      'a opção de download'
    );

    click(downloadItem);
    await sleep(1200);

    const quality = each('[role="menuitem"],button,[role="option"]').filter(visible)
      .find(x => /720p/i.test(label(x)));
    if (quality) {
      click(quality);
      await sleep(1800);
    }
  }

  async function generate(product) {
    const prompt = await waitFor(findPrompt, 45000, 'a caixa de comando do Google Flow');
    const before = generatedMedia().length;

    await uploadImage(product.imageBytes, product.mimeType, product.imageName);
    await configureVideo();
    setText(prompt, product.prompt);

    const generateButton = await waitFor(
      () => findButton(/^(generate|gerar)(\s+(image|video|imagem|vídeo))?$/i) ||
            findButton(/generate|gerar/i),
      30000,
      'o botão Gerar'
    );

    click(generateButton);

    const video = await waitForNewVideo(before);
    await downloadVideo(video);
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type === 'FLOW_PING') {
      sendResponse({ready:true, url:location.href});
      return;
    }

    if (message?.source !== 'marketpreco-flow-extension' ||
        message.type !== 'FLOW_GENERATE_PRODUCT') return;

    generate(message.product)
      .then(() => sendResponse({ok:true}))
      .catch(error => {
        console.error('[MARKETPREÇO Flow]', error);
        sendResponse({ok:false, error:error?.message || String(error)});
      });

    return true;
  });
})();