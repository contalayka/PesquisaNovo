# MARKETPREÇO • Google Flow

Automação local para o MARKETPREÇO usar sua própria sessão do Google Flow e os créditos da conta Google AI Pro. Nenhuma chave Gemini API é usada.

## Instalação
1. Chrome → chrome://extensions
2. Ative Modo do desenvolvedor.
3. Clique em Carregar sem compactação.
4. Selecione esta pasta: tools/marketpreco-flow-extension
5. Abra https://pesquisaproduto.pages.dev
6. Abra https://flow.google.com/ e confirme sua conta Google AI Pro.

## Uso
1. MARKETPREÇO → Central de vídeos.
2. Selecione os produtos.
3. Clique em Gerar selecionados no Google Flow.
4. As imagens e prompts são enviados automaticamente para o Flow.
5. A extensão configura Gemini Omni 1.1 Flash, 9:16, 10 segundos e 1 resultado.
6. Cada vídeo concluído é baixado automaticamente em Downloads/MARKETPRECO/Google-Flow/.

A automação é local no Chrome. A sessão Google não é enviada ao MARKETPREÇO.

## Importante
O Google Flow pode alterar a interface. Os seletores ficam isolados em flow-automation.js. Teste primeiro com 1 produto.
