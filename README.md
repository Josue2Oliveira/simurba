# SIMURBA — Simulador URBA

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
Tudo em `calc.js`:
- `EMPREENDIMENTOS` — regras de cada produto: juros zero até (48x Moinho / 60x Botanique), entrada mínima (10%),
  ato mínimo (1% Moinho / 2,5% Botanique), limite de intermediárias (30% / 40%) e limite de quantidade (só Botanique: 6 ou 4).
- `IDADE_MAXIMA` — idade máxima do cliente na última parcela (80 anos, ambos).
- `taxaPolitica()` — 0,89% a.m. até 144x e 0,92% a.m. até 180x (ambos).
- `DEFAULTS` — valores iniciais do formulário.

Se alguma regra não for atendida, a simulação continua funcionando e o PDF sai marcado como
"PROPOSTA FORA DA POLÍTICA", listando os itens fora da política.
