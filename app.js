import { simular, DEFAULTS, taxaPolitica, brl, pct } from "./calc.js";

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
    el.value = el.dataset.pct !== undefined ? +(v * 100).toFixed(4) : v;
  }
  if (!p.dataSimulacao) form.dataSimulacao.value = hoje();
  desenharFaixas(p.entradaGrupos);
}

function ler() {
  const p = {};
  for (const el of form.elements) {
    if (!el.name) continue;
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
    : "ATENÇÃO: há regras não atendidas — confira abaixo.";

  const card = (t, v, extra = "") => `<div class="card"><span>${t}</span><strong>${v}</strong>${extra ? `<small>${extra}</small>` : ""}</div>`;
  $("cards").innerHTML =
    card("Parcela mensal", brl(r.parcelaMensal), `${p.prazo}× após a entrada`) +
    card("Valor da venda (CRM)", brl(r.valorVenda)) +
    card("Entrada total", brl(r.entradaInformada), `${pct(r.entradaEfetivaPct)} · sinal + ${r.nEntrada} parcelas`) +
    card("Valor financiado", brl(r.financiamento)) +
    card("Intermediárias", brl(r.totalInterm), pct(r.intermPct)) +
    card("Pagamentos", `${r.prazoTotal + 1}`, `último em ${s.linhas.at(-1).venc.toLocaleDateString("pt-BR", { month: "short", year: "numeric" })}`);

  $("regras").innerHTML = s.regras.map((x) =>
    `<li class="${x.ok ? "ok" : "erro"}"><span class="sel">${x.ok ? "OK" : "Erro"}</span>${x.nome}${x.ok ? "" : `<em>${x.msg}</em>`}</li>`).join("");
  $("avisos").innerHTML = s.avisos.map((a) => `<p class="aviso">⚠ ${a}</p>`).join("");

  const m = [
    ["Valor de venda", r.valorVenda],
    ["(−) Total de entrada (sinal + parcelas)", -r.entradaInformada],
    ["(−) Intermediárias", -r.totalInterm],
    ["(=) Valor financiado", r.financiamento, "forte"],
    ["(+) Juros do período da entrada", r.jurosPeriodoEntrada],
    ["(=) Base de cálculo do Price", r.baseCalculoPrice, "forte"],
    ["Parcela: principal", r.pmtPrincipal],
    ["Parcela: juros do período da entrada", r.pmtJuros],
    ["(=) Parcela mensal", r.parcelaMensal, "forte"],
  ];
  if (r.comissao > 0) m.push(["Comissão apartada (total)", r.comissao], [`Comissão por parcela (${p.qtdComissao}×)`, r.comissaoParcela]);
  $("memoria").innerHTML = m.map(([t, v, c]) => `<tr class="${c || ""}"><td>${t}</td><td>${brl(v)}</td></tr>`).join("");

  const det = $("mostrarDetalhe").checked;
  const temInterm = r.totalInterm > 0;
  let h = `<thead><tr><th>Nº</th><th>Tipo</th><th>Vencimento</th><th>Parcela</th>${det ? "<th>Principal</th><th>Juros</th><th>Corrigida (est.)</th>" : ""}${temInterm ? "<th>Intermediária</th><th>Interm. + taxa</th>" : ""}<th>Total</th></tr></thead><tbody>`;
  for (const l of s.linhas) {
    const tipo = l.numero === 1 ? "Sinal" : l.tipo === "E" ? "Entrada" : "Mensal";
    h += `<tr class="${l.tipo === "E" ? "ent" : ""}${l.intermCRM ? " int" : ""}"><td>${l.numero}</td><td>${tipo}</td><td>${fmtData(l.venc)}</td><td>${brl(l.parcela)}</td>` +
      (det ? `<td>${brl(l.principal)}</td><td>${brl(l.juros)}</td><td>${brl(l.corrigida)}</td>` : "") +
      (temInterm ? `<td>${l.intermCRM ? brl(l.intermCRM) : ""}</td><td>${l.intermTaxa ? brl(l.intermTaxa) : ""}</td>` : "") +
      `<td>${brl(l.total)}</td></tr>`;
  }
  h += "</tbody>";
  $("fluxo").innerHTML = h;

  // Tabela do PDF: só valores a pagar (sem principal/juros)
  $("dataTopo").textContent = "Simulação de " + fmtData(new Date((p.dataSimulacao || hoje()) + "T12:00:00"));
  let t = `<thead><tr><th>Nº</th><th>Tipo</th><th>Vencimento</th><th>Parcela</th>${temInterm ? "<th>Intermediária</th>" : ""}<th>Total do mês</th></tr></thead><tbody>`;
  for (const l of s.linhas) {
    const tipo = l.numero === 1 ? "Sinal" : l.tipo === "E" ? "Entrada" : "Mensal";
    t += `<tr class="${l.intermTaxa ? "int" : ""}"><td>${l.numero}</td><td>${tipo}</td><td>${fmtData(l.venc)}</td><td>${brl(l.parcela)}</td>` +
      (temInterm ? `<td>${l.intermTaxa ? brl(l.intermTaxa) : ""}</td>` : "") + `<td>${brl(l.total)}</td></tr>`;
  }
  t += `<tr class="totalgeral"><td colspan="${temInterm ? 5 : 4}">Total a pagar</td><td>${brl(r.somaTotal)}</td></tr></tbody>`;
  $("tabelaPdf").innerHTML = t;
}

// ---------- ações ----------
function baixarCsv() {
  const num = (v) => v.toFixed(2).replace(".", ",");
  const linhas = [["Parcela", "Tipo", "Vencimento", "Parcela mensal", "Principal", "Juros", "Valor corrigido (est.)", "Intermediária", "Intermediária + taxa", "Total"]];
  for (const l of ultimo.linhas)
    linhas.push([l.numero, l.tipo, fmtData(l.venc), num(l.parcela), num(l.principal), num(l.juros), num(l.corrigida), num(l.intermCRM), num(l.intermTaxa), num(l.total)]);
  const csv = "﻿" + linhas.map((x) => x.join(";")).join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  a.download = `simulacao_simurba_${hoje()}.csv`;
  a.click();
}

form.addEventListener("input", render);
$("mostrarDetalhe").addEventListener("change", render);
$("btnCsv").onclick = baixarCsv;
$("btnPrint").onclick = () => window.print();
$("btnReset").onclick = () => { preencher({ ...DEFAULTS, dataSimulacao: hoje() }); render(); };
$("btnTaxa").onclick = () => {
  const t = taxaPolitica(parseInt(form.prazo.value) || 0);
  if (t !== null) { form.taxa.value = +(t * 100).toFixed(4); render(); }
};

let inicial = { ...DEFAULTS };
try { const salvo = JSON.parse(localStorage.getItem(STORAGE)); if (salvo) inicial = { ...inicial, ...salvo }; } catch {}
preencher(inicial);
render();
