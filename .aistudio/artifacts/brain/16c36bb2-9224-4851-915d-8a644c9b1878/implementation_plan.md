# Plano de Implementação: Visualização e Filtro dos Produtos Fora do Site (471 no Projeto vs 443 no Site)

## Objetivo
Permitir que o usuário visualize imediatamente, com um clique, quais são exatamente os 28 produtos cadastrados no projeto que não constam mais na lista ativa de 443 itens do fornecedor, com estatísticas claras, comparativo de catálogo e ferramentas de gestão (manter, reativar ou descartar).

---

## 1. Banner Informativo de Conciliação de Catálogo
- Inserir um card resumo no topo da listagem de produtos exibindo:
  - **Total no Projeto:** 471 produtos
  - **No Site do Fornecedor:** 443 produtos
  - **Fora do Site:** 28 produtos em destaque
- Incluir botões diretos de ação rápida:
  - Botão de atalho: **"Filtrar 28 Fora do Site"** (ativa o filtro com 1 clique)
  - Botão de atalho: **"Ver 443 Ativos no Fornecedor"**
  - Botão: **"Reconciliar com Planilha"** (para atualizar ou reimportar a lista de 443 itens)

---

## 2. Botão de Filtro Rápido e Contador em Destaque
- Garantir que a aba **"Fora do Site (X)"** na barra de status mostre a contagem exata e destaque os itens com badge e moldura âmbar.
- Exibir aviso explicativo ao ativar o filtro:
  > *"Exibindo os produtos mantidos no seu catálogo que não estão mais presentes na lista ativa do fornecedor. Você pode mantê-los para referência ou atualizar seus status."*

---

## 3. Modal de Auditoria e Gestão dos 28 Produtos Ausentes
- Adicionar modal de inspeção detalhada dos produtos fora do site:
  - Lista com foto, nome, SKU, preço de custo anterior e data de ausência.
  - Ações individuais: "Reativar no Site", "Marcar como Descartado" ou "Excluir Definitivamente".
  - Ações em lote: selecionar múltiplos itens ausentes para descarte ou arquivamento.

---

## 4. Verificação e Validação
- Compilar o projeto com `compile_applet`.
- Validar ausência de erros com `lint_applet`.
- Executar os testes automatizados existentes para garantir integridade.
