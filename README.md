# Simulador Moinho — Plano Price

Site estático (HTML + CSS + JavaScript, sem servidor e sem build).
Todos os cálculos rodam no navegador, então nada é enviado para servidor nenhum.

## Arquivos
- `index.html` — página e formulário
- `calc.js` — **motor de cálculo** (mesma lógica da planilha). Regras, taxas da política e correção estão aqui.
- `app.js` — liga o formulário ao motor e desenha resultados
- `style.css` — visual

## Testar no computador
Abra um terminal nesta pasta e rode `npx serve .` (ou qualquer servidor estático) e acesse o endereço mostrado.
(Abrir o `index.html` com duplo clique não funciona porque o navegador bloqueia módulos JS em `file://`.)

## Publicar na Vercel
**Opção A — GitHub (recomendada, atualiza sozinho):**
1. Crie um repositório no GitHub e envie esta pasta (pode ser pelo botão "Add file → Upload files" no site do GitHub).
2. Em vercel.com → *Add New → Project* → importe o repositório.
3. Framework Preset: **Other**. Não precisa de build command. Clique em *Deploy*.
4. Toda vez que alterar um arquivo no GitHub, a Vercel publica a nova versão automaticamente.

**Opção B — linha de comando:**
```
npm i -g vercel
cd simulador-moinho
vercel        # primeira vez (cria o projeto)
vercel --prod # publica em produção
```

## Onde mudar regras
Em `calc.js`:
- `taxaPolitica()` — faixas de prazo × taxa.
- `DEFAULTS` — valores iniciais do formulário (lote, sinal, entrada etc.).
- bloco "Regras" dentro de `simular()` — limites de 30%, 6×, ato 1%, entrada 8%, dias 10/26.
