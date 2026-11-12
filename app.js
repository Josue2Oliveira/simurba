import { simular, DEFAULTS, EMPREENDIMENTOS, taxaPolitica, brl, pct } from "./calc.js";

const form = document.getElementById("form");
const $ = (id) => document.getElementById(id);
const fmtData = (d) => d.toLocaleDateString("pt-BR");
const hoje = () => new Date().toISOString().slice(0, 10);
const STORAGE = "simulador-moinho-v1";

// ---------- faixas da entrada ----------
function desenharFaixas(grupos) {
  $("faixas").innerHTML = grupos.map((g, i) => `
    <div class="dupla">
      <label>Faixa ${i + 1} · qtd <input type="number" min="0" data-faixa="${i}" data-campo="qtd" value="${g.qtd || ""}"></label>
      <label>valor (R$) <input type="number" step="0.01" data-faixa="${i}" data-campo="valor" value="${g.valor || ""}"></label>
    </div>`).join("");
}

// ---------- ler / escrever formulário ----------
function preencher(p) {
  for (const el of form.elements) {
    if (!el.name || !(el.name in p)) continue;
    const v = p[el.name];
    if (el.type === "radio") { el.checked = el.value === v; continue; }
    el.value = el.dataset.pct !== undefined ? +(v * 100).toFixed(4) : v;
  }
  if (!p.dataSimulacao) form.dataSimulacao.value = hoje();
  desenharFaixas(p.entradaGrupos);
}

function ler() {
  const p = {};
  for (const el of form.elements) {
    if (!el.name) continue;
    if (el.type === "radio") { if (el.checked) p[el.name] = el.value; continue; }
    if (el.type === "date" || el.tagName === "SELECT" && el.name === "intermPeriodicidade") p[el.name] = el.value;
    else {
      const n = parseFloat(el.value) || 0;
      p[el.name] = el.dataset.pct !== undefined ? n / 100 : n;
    }
  }
  p.entradaGrupos = [0, 1, 2].map((i) => ({
    qtd: parseInt(form.querySelector(`[data-faixa="${i}"][data-campo="qtd"]`).value) || 0,
    valor: parseFloat(form.querySelector(`[data-faixa="${i}"][data-campo="valor"]`).value) || 0,
  }));
  return p;
}

// ---------- renderização ----------
let ultimo;
function render() {
  const p = ler();
  try { localStorage.setItem(STORAGE, JSON.stringify(p)); } catch {}
  const s = simular(p);
  ultimo = s;
  const r = s.resumo;

  $("alerta").className = "alerta nao-imprimir " + (s.tudoOk ? "ok" : "erro");
  $("alerta").textContent = s.tudoOk ? "Simulação dentro das regras comerciais."
    : "ATENÇÃO: há regras não atendidas — o PDF sairá como PROPOSTA FORA DA POLÍTICA.";
  const falhas = s.regras.filter((x) => !x.ok);
  $("foraPolitica").className = "fora-politica" + (falhas.length ? " ativo" : "");
  $("foraPolitica").innerHTML = falhas.length
    ? `<strong>PROPOSTA FORA DA POLÍTICA</strong>Sujeita à análise e aprovação da Coordenação de Vendas. Itens fora da política:<ul>${falhas.map((x) => `<li>${x.nome}</li>`).join("")}</ul>` : "";

  const card = (t, v, extra = "") => `<div class="card"><span>${t}</span><strong>${v}</strong>${extra ? `<small>${extra}</small>` : ""}</div>`;
  $("cards").innerHTML =
    card("Parcela mensal", brl(r.parcelaMensal) + ' <span class="ipca">+ IPCA</span>', `${p.prazo}× após a entrada`) +
    (r.desconto > 0
      ? `<div class="card desconto"><span>Valor da proposta</span><strong>${brl(r.valorProposta)}</strong><small><s>Tabela ${brl(r.valorTabela)}</s><br><b>Desconto de ${brl(r.desconto)} (${pct(r.descontoPct)})</b></small></div>`
      : card("Valor da proposta", brl(r.valorProposta))) +
    (r.comissao > 0
      ? card("Entrada total", brl(r.entradaInformada + r.comissao), `${pct((r.entradaInformada + r.comissao) / r.valorProposta)} · inclui comissão de ${brl(r.comissao)}`)
      : card("Entrada total", brl(r.entradaInformada), `${pct(r.entradaEfetivaPct)} · sinal + ${r.nEntrada} parcelas`)) +
    card("Valor financiado", brl(r.financiamento)) +
    (r.comissao > 0 ? card("Comissão apartada", brl(r.comissao), `${r.qtdComissao}× de ${brl(r.comissaoParcela)}`) : "") +
    card("Intermediárias", brl(r.totalInterm), pct(r.intermPct)) +
    card("Pagamentos", `${r.prazoTotal + 1}`, `último em ${s.linhas.at(-1).venc.toLocaleDateString("pt-BR", { month: "short", year: "numeric" })}`);

  $("regras").innerHTML = s.regras.map((x) =>
    `<li class="${x.ok ? "ok" : "erro"}"><span class="sel">${x.ok ? "OK" : "Erro"}</span>${x.nome}${x.ok ? "" : `<em>${x.msg}</em>`}</li>`).join("");
  $("avisos").innerHTML = s.avisos.map((a) => `<p class="aviso">⚠ ${a}</p>`).join("");

  const m = [
    ...(r.comissao > 0 ? [["Valor da proposta", r.valorProposta], ["(−) Comissão apartada", -r.comissao]] : []),
    ["(=) Valor de venda (CRM)", r.valorVenda, r.comissao > 0 ? "forte" : ""],
    ["(−) Total de entrada (sinal + parcelas)", -r.entradaInformada],
    ["(−) Intermediárias", -r.totalInterm],
    ["(=) Valor financiado", r.financiamento, "forte"],
    ["(+) Juros do período da entrada", r.jurosPeriodoEntrada],
    ["(=) Base de cálculo do Price", r.baseCalculoPrice, "forte"],
    ["Parcela: principal", r.pmtPrincipal],
    ["Parcela: juros do período da entrada", r.pmtJuros],
    ["(=) Parcela mensal", r.parcelaMensal, "forte"],
  ];
  if (r.comissao > 0) m.push([`Comissão apartada: ${r.qtdComissao}× de`, r.comissaoParcela, "forte"]);
  $("dicaComissao").textContent = r.comissao > 0
    ? `Comissão de ${brl(r.comissao)} em ${r.qtdComissao}× de ${brl(r.comissaoParcela)}, somada às primeiras ${r.qtdComissao} parcelas.` : "";
  $("memoria").innerHTML = m.map(([t, v, c]) => `<tr class="${c || ""}"><td>${t}</td><td>${brl(v)}</td></tr>`).join("");

  const det = $("mostrarDetalhe").checked;
  const temInterm = r.totalInterm > 0;
  const temCom = r.comissao > 0;
  let h = `<thead><tr><th>Nº</th><th>Tipo</th><th>Vencimento</th><th>Parcela</th>${det ? "<th>Principal</th><th>Juros</th><th>Corrigida (est.)</th>" : ""}${temInterm ? "<th>Intermediária</th><th>Interm. + taxa</th>" : ""}${temCom ? "<th>Comissão</th>" : ""}<th>Total</th></tr></thead><tbody>`;
  for (const l of s.linhas) {
    const tipo = l.numero === 1 ? "Sinal" : l.tipo === "E" ? "Entrada" : "Mensal";
    h += `<tr class="${l.tipo === "E" ? "ent" : ""}${l.intermCRM ? " int" : ""}"><td>${l.numero}</td><td>${tipo}</td><td>${fmtData(l.venc)}</td><td>${brl(l.parcela)}</td>` +
      (det ? `<td>${brl(l.principal)}</td><td>${brl(l.juros)}</td><td>${brl(l.corrigida)}</td>` : "") +
      (temInterm ? `<td>${l.intermCRM ? brl(l.intermCRM) : ""}</td><td>${l.intermTaxa ? brl(l.intermTaxa) : ""}</td>` : "") +
      (temCom ? `<td>${l.comissaoMes ? brl(l.comissaoMes) : ""}</td>` : "") +
      `<td>${brl(l.total)}</td></tr>`;
  }
  h += "</tbody>";
  $("fluxo").innerHTML = h;

  // Tabela do PDF: só valores a pagar (sem principal/juros)
  $("nomeEmp").textContent = s.empreendimento.nome;
  const lim = s.empreendimento.jurosZeroAte;
  const semJuros = p.taxa === 0;
  $("faixaJuros").className = "faixa-juros" + (semJuros ? " ativa" : "");
  $("faixaJuros").innerHTML = semJuros
    ? `<strong>JUROS ZERO</strong> Esta simulação em ${p.prazo}x não tem juros. ${s.empreendimento.nome}: financiamento sem juros em até ${lim}x.`
    : `<strong>JUROS ZERO EM ATÉ ${lim}x</strong> No ${s.empreendimento.nome}, o financiamento em até ${lim}x não tem juros.`;
  const e = s.empreendimento, fp = (x) => (Math.round(x * 1000) / 10).toString().replace(".", ",") + "%";
  $("dicaJuros").textContent = `Juros zero até ${e.jurosZeroAte}x · 0,89% a.m. até 144x · 0,92% a.m. até 180x. ` +
    `Entrada mín. ${fp(e.entradaMin)} · ato mín. ${fp(e.atoMin)} · intermediárias até ${fp(e.intermMaxPct)}` +
    (e.limiteQtdInterm ? " (máx. 6 no plano longo, 4 no curto)" : "") + ".";
  $("dataTopo").textContent = "Simulação de " + fmtData(new Date((p.dataSimulacao || hoje()) + "T12:00:00"));
  let t = `<thead><tr><th>Nº</th><th>Tipo</th><th>Vencimento</th><th>Parcela</th>${temInterm ? "<th>Intermediária</th>" : ""}${temCom ? "<th>Comissão</th>" : ""}<th>Total do mês</th></tr></thead><tbody>`;
  for (const l of s.linhas) {
    const tipo = l.numero === 1 ? "Sinal" : l.tipo === "E" ? "Entrada" : "Mensal";
    const ipca = l.tipo === "M" ? ' <span class="ipca">+ IPCA</span>' : "";
    t += `<tr class="${l.intermTaxa ? "int" : ""}"><td>${l.numero}</td><td>${tipo}</td><td>${fmtData(l.venc)}</td><td>${brl(l.parcela)}${ipca}</td>` +
      (temInterm ? `<td>${l.intermTaxa ? brl(l.intermTaxa) : ""}</td>` : "") +
      (temCom ? `<td>${l.comissaoMes ? brl(l.comissaoMes) : ""}</td>` : "") + `<td>${brl(l.total)}${ipca}</td></tr>`;
  }
  t += `<tr class="totalgeral"><td colspan="${4 + (temInterm ? 1 : 0) + (temCom ? 1 : 0)}">Total a pagar (sem IPCA)</td><td>${brl(r.somaTotal)}</td></tr></tbody>`;
  $("tabelaPdf").innerHTML = t;
}

// ---------- ações ----------
function baixarCsv() {
  const num = (v) => v.toFixed(2).replace(".", ",");
  const linhas = [["Parcela", "Tipo", "Vencimento", "Parcela mensal", "Principal", "Juros", "Valor corrigido (est.)", "Intermediária", "Intermediária + taxa", "Comissão", "Total"]];
  for (const l of ultimo.linhas)
    linhas.push([l.numero, l.tipo, fmtData(l.venc), num(l.parcela), num(l.principal), num(l.juros), num(l.corrigida), num(l.intermCRM), num(l.intermTaxa), num(l.comissaoMes), num(l.total)]);
  const csv = "﻿" + linhas.map((x) => x.join(";")).join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  a.download = `simulacao_${ultimo.params.empreendimento}_${hoje()}.csv`;
  a.click();
}

// Ao trocar empreendimento ou prazo, aplica a taxa da política automaticamente
function aplicarTaxa() {
  const emp = form.querySelector('[name="empreendimento"]:checked')?.value;
  const t = taxaPolitica(parseInt(form.prazo.value) || 0, emp);
  if (t !== null) form.taxa.value = +(t * 100).toFixed(4);
}
form.addEventListener("input", (e) => {
  if (e.target.name === "empreendimento" || e.target.name === "prazo") aplicarTaxa();
  render();
});
$("mostrarDetalhe").addEventListener("change", render);
$("btnCsv").onclick = baixarCsv;
$("btnPrint").onclick = () => window.print();
$("btnReset").onclick = () => { preencher({ ...DEFAULTS, dataSimulacao: hoje() }); render(); };
$("btnTaxa").onclick = () => { aplicarTaxa(); render(); };

let inicial = { ...DEFAULTS };
try { const salvo = JSON.parse(localStorage.getItem(STORAGE)); if (salvo) inicial = { ...inicial, ...salvo }; } catch {}
preencher(inicial);
render();
