# Integração Shopee — MarketPreço

Esta integração usa a Shopee Open Platform oficial. Não pede nem armazena a senha da Shopee.

## O que está implementado

- Conexão OAuth com redirecionamento para a Shopee.
- Armazenamento server-side de access token e refresh token no Cloudflare KV.
- Renovação automática do access token quando expirar.
- Consulta de pedidos e agregação de unidades/valores por produto em um período de até 15 dias.
- Proteção dos endpoints de conexão e sincronização com uma chave administrativa que não fica no código-fonte.

**Limite atual:** a consulta de pedidos não traz visitas de anúncios. A API padrão de pedidos também não fornece o valor líquido final de taxas, frete, cupons e ajustes. Para visitas, será necessária uma API de performance com permissões habilitadas para o aplicativo Shopee.

## Pré-requisitos

1. Criar uma conta de desenvolvedor na Shopee Open Platform e cadastrar um aplicativo com as permissões de loja/pedidos necessárias.
2. Obter o Partner ID e Partner Key. A Shopee pode exigir análise/aprovação do aplicativo antes de liberar acesso de produção.
3. No Cloudflare Pages, criar um namespace KV e vinculá-lo ao projeto com o nome de binding **MARKETPLACE_KV**.
4. Em Settings → Variables and Secrets (Production e Preview, conforme desejado), configurar:
   - `SHOPEE_PARTNER_ID`: Partner ID numérico do app.
   - `SHOPEE_PARTNER_KEY`: Partner Key como Secret.
   - `SHOPEE_REDIRECT_URL`: URL absoluta do callback, por exemplo `https://SEU-DOMINIO/api/marketplace/shopee/connect`. Deve ser cadastrada também como URL de redirecionamento do app na Shopee.
   - `MARKETPLACE_ADMIN_KEY`: uma senha aleatória longa, com pelo menos 24 caracteres, salva como Secret. Não reutilize senha de conta pessoal.
5. Salvar e fazer novo deploy do Cloudflare Pages após configurar variáveis/binding.

## Como testar

1. Abrir a tela **Análise de Vendas** na versão do site que recebeu o deploy.
2. Informar a mesma `MARKETPLACE_ADMIN_KEY` configurada no Cloudflare.
3. Clicar em **Conectar minha loja** e autorizar a loja na página oficial da Shopee.
4. Ao retornar ao MarketPreço, selecionar um período de até 15 dias e clicar em **Sincronizar pedidos**.

Os dados importados são gravados no armazenamento local deste navegador. Use Exportar backup para guardar uma cópia.

## Segurança e limitações

- Não coloque Partner Key, access token ou refresh token no frontend, em arquivos versionados ou em mensagens.
- O endpoint usa uma chave administrativa porque o preview do site pode ser acessível publicamente. Configure uma chave exclusiva para este projeto.
- Tokens são armazenados no Cloudflare KV; o access token é renovado usando o refresh token.
- A sincronização atual considera pedidos que não estejam cancelados, em cancelamento ou não pagos. O faturamento exibido é a soma estimada dos preços dos itens multiplicados pelas quantidades, não o repasse líquido.
