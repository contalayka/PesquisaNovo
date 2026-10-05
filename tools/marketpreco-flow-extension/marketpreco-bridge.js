(() => {
  const emit = (type, detail) => window.postMessage({ source: 'marketpreco-flow-extension', type, detail }, window.location.origin);
  chrome.runtime.onMessage.addListener((message) => {
    if (message?.source === 'marketpreco-flow-extension') emit('MARKETPRECO_FLOW_PROGRESS', message);
  });
  window.addEventListener('message', (event) => {
    if (event.source !== window || event.origin !== window.location.origin) return;
    const message = event.data;
    if (!message || message.source !== 'marketpreco-app') return;
    if (message.type === 'MARKETPRECO_FLOW_PING') {
      emit('MARKETPRECO_FLOW_READY', { installed: true, version: chrome.runtime.getManifest().version });
      return;
    }
    if (message.type !== 'MARKETPRECO_FLOW_BATCH') return;
    chrome.runtime.sendMessage({source:'marketpreco-app',type:'MARKETPRECO_FLOW_BATCH',products:Array.isArray(message.products)?message.products:[]})
      .then(response => emit('MARKETPRECO_FLOW_PROGRESS', response || {status:'error',message:'A extensão não respondeu.'}))
      .catch(error => emit('MARKETPRECO_FLOW_PROGRESS',{status:'error',message:'Extensão Google Flow não respondeu. Verifique se está instalada e ativa.'}));
  });
  emit('MARKETPRECO_FLOW_READY', { installed: true, version: chrome.runtime.getManifest().version });
})();