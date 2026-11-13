import { simular, DEFAULTS, taxaPolitica, brl, pct } from "./calc.js";
import { buscarArea } from "./lotes.js";

const form = document.getElementById("form");
const $ = (id) => document.getElementById(id);
const fmtData = (d) => d.toLocaleDateString("pt-BR");
const hoje = () => new Date().toISOString().slice(0, 10);
const STORAGE = "simulador-moinho-v1";
const num2 = (v) => v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fp = (x, d = 2) => (x * 100).toLocaleString("pt-BR", { maximumFractionDigits: d }) + "%";

// ---------- faixas da entrada ----------
function desenharFaixas(grupos, emPct, proposta) {
  const mostra = (v) => !v ? "" : emPct ? +(v / proposta * 100).toFixed(4) : +(+v).toFixed(2);
  $("faixas").innerHTML = grupos.map((g, i) => `
    <div class="dupla">
      <label>Faixa ${i + 1} · qtd <input type="number" min="0" data-faixa="${i}" data-campo="qtd" value="${g.qtd || ""}"></label>
      <label>${emPct ? "% por parcela" : "valor (R$)"} <input type="number" step="0.01" data-faixa="${i}" data-campo="valor" value="${mostra(g.valor)}"></label>
    </div>`).join("");
}
const emPct = () => form.querySelector('[name="entradaModo"]:checked')?.value === "pct";

// ---------- ler / escrever formulário ----------
function preencher(p) {
  for (const el of form.elements) {
    if (!el.name || !(el.name in p)) continue;
    const v = p[el.name];
    if (el.type === "radio") { el.checked = el.value === v; continue; }
    if (el.type === "checkbox") { el.checked = !!v; continue; }
    if (el.type === "text") { el.value = v ?? ""; continue; }
    el.value = el.dataset.pct !== undefined ? +(v * 100).toFixed(4) : (v || v === 0 ? v : "");
  }
  if (!p.area) form.area.value = "";
  if (!p.dataSimulacao) form.dataSimulacao.value = hoje();
  const pctMode = p.entradaModo === "pct";
  form.sinal.value = !p.sinal ? "" : pctMode ? +(p.sinal / p.valorProposta * 100).toFixed(4) : p.sinal;
  desenharFaixas(p.entradaGrupos, pctMode, p.valorProposta);
  rotulosEntrada();
}

function ler() {
  const p = {};
  for (const el of form.elements) {
    if (!el.name) continue;
    if (el.type === "radio") { if (el.checked) p[el.name] = el.value; continue; }
    if (el.type === "checkbox") { p[el.name] = el.checked; continue; }
    if (el.type === "text" || el.type === "date" || el.name === "intermPeriodicidade") { p[el.name] = el.value.trim(); continue; }
    const n = parseFloat(el.value) || 0;
    p[el.name] = el.dataset.pct !== undefined ? n / 100 : n;
  }
  // sinal e faixas: se informados em %, convertem para R$ sobre o valor da proposta
  const conv = (v) => p.entradaModo === "pct" ? Math.round(v / 100 * p.valorProposta * 100) / 100 : v;
  p.sinal = conv(p.sinal);
  p.entradaGrupos = [0, 1, 2].map((i) => ({
    qtd: parseInt(form.querySelector(`[data-faixa="${i}"][data-campo="qtd"]`).value) || 0,
    valor: conv(parseFloat(form.querySelector(`[data-faixa="${i}"][data-campo="valor"]`).value) || 0),
  }));
  p.correcaoMensal = Math.pow(1 + (p.ipcaAnual || 0), 1 / 12) - 1;   // IPCA anual -> mensal
  return p;
}

// ---------- quadra / lote -> área ----------
function atualizarLote() {
  const p = ler();
  const area = buscarArea(p.empreendimento, p.quadra, p.lote);
  if (area) {
    form.area.value = area;
    $("dicaLote").textContent = `Área cadastrada para a quadra ${p.quadra}, lote ${p.lote}: ${num2(area)} m².`;
  } else if (p.quadra && p.lote) {
    $("dicaLote").textContent = "Lote não encontrado no cadastro. Informe a área manualmente, se quiser.";
  } else {
    $("dicaLote").textContent = "";
  }
}

// ---------- tabela do PDF agrupada por faixas ----------
function agrupar(s, p) {
  const linhas = s.linhas.map((l) => {
    const serv = p.pdfServico ? l.comissaoMes : 0;
    const tipo = l.numero === 1 ? "Sinal" : l.tipo === "E" ? "Entrada" : "Mensal";
    return {
      ...l, tipoLabel: tipo, serv,
      totalMes: l.parcela + l.intermTaxa + l.balaoTaxa + serv,
      projMes: l.corrigida + l.intermTaxa + l.balaoTaxa + serv,
    };
  });
  const grupos = [];
  for (const l of linhas) {
    const g = grupos.at(-1);
    const igual = g && l.tipoLabel !== "Sinal" && g.tipoLabel === l.tipoLabel && !g.intermTaxa && !l.intermTaxa && !g.balaoTaxa && !l.balaoTaxa &&
      Math.abs(g.parcela - l.parcela) < 0.005 && Math.abs(g.serv - l.serv) < 0.005;
    if (igual) { g.fim = l; g.qtd++; g.projFim = l.projMes; g.somaTotal += l.totalMes; g.somaProj += l.projMes; }
    else grupos.push({ ...l, ini: l, fim: l, qtd: 1, projIni: l.projMes, projFim: l.projMes, somaTotal: l.totalMes, somaProj: l.projMes });
  }
  return grupos;
}

function tabelaPdf(s, p) {
  const r = s.resumo;
  const temInterm = r.totalInterm > 0;
  const temServ = p.pdfServico && r.comissao > 0;
  const temBalao = r.balao > 0;
  const proj = p.pdfIpca;
  const grupos = agrupar(s, p);
  const ipcaTag = ' <span class="ipca">+ IPCA</span>';
  let t = `<thead><tr><th>Parcelas</th><th>Tipo</th><th>Vencimento</th><th>Valor da parcela</th>` +
    (temServ ? "<th>Serviço</th>" : "") + (temInterm ? "<th>Intermediária</th>" : "") + (temBalao ? "<th>Balão final</th>" : "") +
    `<th>Total do mês</th>${proj ? "<th>Projeção c/ IPCA</th>" : ""}</tr></thead><tbody>`;
  let soma = 0, somaProj = 0;
  for (const g of grupos) {
    const ehM = g.tipo === "M";
    const parc = g.qtd > 1 ? `${g.ini.numero} a ${g.fim.numero} <small>(${g.qtd}x)</small>` : `${g.ini.numero}`;
    const venc = g.qtd > 1 ? `${fmtData(g.ini.venc)}<br><small>a</small> ${fmtData(g.fim.venc)}` : fmtData(g.ini.venc);
    const pj = !proj ? "" : `<td>${g.qtd > 1 && ehM ? `${brl(g.projIni)}<br><small>a</small> ${brl(g.projFim)}` : brl(g.projIni)}</td>`;
    t += `<tr class="${g.intermTaxa || g.balaoTaxa ? "int" : ""}"><td>${parc}</td><td>${g.tipoLabel}</td><td>${venc}</td>` +
      `<td>${brl(g.parcela)}${ehM ? ipcaTag : ""}</td>` +
      (temServ ? `<td>${g.serv ? brl(g.serv) : ""}</td>` : "") +
      (temInterm ? `<td>${g.intermTaxa ? brl(g.intermTaxa) : ""}</td>` : "") +
      (temBalao ? `<td>${g.balaoTaxa ? brl(g.balaoTaxa) : ""}</td>` : "") +
      `<td>${brl(g.totalMes)}${ehM ? ipcaTag : ""}</td>${pj}</tr>`;
    soma += g.somaTotal; somaProj += g.somaProj;
  }
  const cols = 4 + (temServ ? 1 : 0) + (temInterm ? 1 : 0) + (temBalao ? 1 : 0);
  t += `<tr class="totalgeral"><td colspan="${cols}">Total a pagar (sem IPCA)</td><td>${brl(soma)}</td>${proj ? `<td>${brl(somaProj)}</td>` : ""}</tr></tbody>`;
  $("tabelaPdf").innerHTML = t;
  $("notaIpca").textContent = proj
    ? "As parcelas mensais do financiamento são corrigidas pelo IPCA."
    : "As parcelas do financiamento (mensais) são corrigidas mensalmente pelo IPCA. O total acima não inclui essa correção.";
}

// ---------- cards ----------
const card = (t, v, extra = "", cls = "") => `<div class="card ${cls}"><span>${t}</span><strong>${v}</strong>${extra ? `<small>${extra}</small>` : ""}</div>`;

function cards(s, p, modoPdf) {
  const r = s.resumo;
  const mostrarServ = r.comissao > 0 && (!modoPdf || p.pdfServico);
  const nomeServ = modoPdf ? "Serviço" : "Comissão apartada";
  const entrada = r.entradaInformada + (mostrarServ ? r.comissao : 0);
  let h = card("Parcela mensal", brl(r.parcelaMensal) + ' <span class="ipca">+ IPCA</span>', `${p.prazo}× após a entrada`);
  h += r.desconto > 0
    ? `<div class="card desconto"><span>Valor da proposta</span><strong>${brl(r.valorProposta)}</strong><small><s>Tabela ${brl(r.valorTabela)}</s><br><b>Desconto de ${brl(r.desconto)} (${pct(r.descontoPct)})</b></small></div>`
    : card("Valor da proposta", brl(r.valorProposta));
  h += card("Entrada total", brl(entrada), `${pct(entrada / r.valorProposta)} · ${mostrarServ ? `inclui ${nomeServ.toLowerCase()} de ${brl(r.comissao)}` : `sinal + ${r.nEntrada} parcelas`}`);
  h += card("Valor financiado", brl(r.financiamento));
  if (mostrarServ) h += card(nomeServ, brl(r.comissao), `${r.qtdComissao}× de ${brl(r.comissaoParcela)}`);
  if (r.totalInterm > 0 || !modoPdf) h += card("Intermediárias", brl(r.totalInterm), pct(r.intermPct));
  if (r.balao > 0) h += card("Balão final", brl(r.balaoFinal), `${pct(r.balaoPct)} da venda (${brl(r.balao)}) · com a última parcela`);
  if (p.area > 0 && (!modoPdf || p.pdfM2)) {
    const m2 = r.valorProposta / p.area;
    const extra = r.desconto > 0 ? `<s>Tabela ${brl(r.valorTabela / p.area)}/m²</s> · ${num2(p.area)} m²` : `${num2(p.area)} m²`;
    h += card("Valor do m²", brl(m2), extra);
  }
  h += card("Pagamentos", `${r.prazoTotal + 1}`, `último em ${s.linhas.at(-1).venc.toLocaleDateString("pt-BR", { month: "short", year: "numeric" })}`);
  return h;
}

// ---------- renderização ----------
let ultimo;
function render() {
  const p = ler();
  try { localStorage.setItem(STORAGE, JSON.stringify(p)); } catch {}
  const s = simular(p);
  ultimo = s;
  const r = s.resumo;
  const e = s.empreendimento;
  const dataSim = fmtData(new Date((p.dataSimulacao || hoje()) + "T12:00:00"));

  // alertas / política
  $("alerta").className = "alerta nao-imprimir " + (s.tudoOk ? "ok" : "erro");
  $("alerta").textContent = s.tudoOk ? "Simulação dentro das regras comerciais."
    : "ATENÇÃO: há regras não atendidas — o PDF sairá como PROPOSTA FORA DA POLÍTICA.";
  const falhas = s.regras.filter((x) => !x.ok);
  $("foraPolitica").className = "fora-politica" + (falhas.length ? " ativo" : "");
  $("foraPolitica").innerHTML = falhas.length
    ? `<strong>PROPOSTA FORA DA POLÍTICA</strong>Sujeita à análise e aprovação da Coordenação de Vendas. Itens fora da política:<ul>${falhas.map((x) => `<li>${x.nome}</li>`).join("")}</ul>` : "";

  // topo (tela) e cabeçalho (PDF)
  $("nomeEmp").textContent = e.nome;
  $("dataTopo").textContent = "Simulação de " + dataSim;
  const imovel = [p.quadra && `Quadra ${p.quadra}`, p.lote && `Lote ${p.lote}`, p.area > 0 && `${num2(p.area)} m²`].filter(Boolean).join(" · ");
  const chip = (rot, val) => `<div class="chip"><small>${rot}</small><b>${val}</b></div>`;
  const chips = [p.quadra && chip("Quadra", esc(p.quadra)), p.lote && chip("Lote", esc(p.lote)),
    p.area > 0 && chip("Área", `${num2(p.area)} m²`)].filter(Boolean).join("");
  $("cabPdf").innerHTML = `
    <div class="cab-marca"><span class="marca">SIMURBA</span><span class="marca-sub">Simulador URBA</span></div>
    <div class="cab-corpo">
      <p class="cab-rotulo">Simulação do condomínio</p>
      <h2 class="cab-titulo">${e.nome}</h2>
      ${chips ? `<div class="cab-chips">${chips}</div>` : ""}
    </div>
    <div class="cab-meta">
      <div><small>Data da simulação</small><b>${dataSim}</b></div>
      ${p.nomeCliente ? `<div><small>Cliente</small><b>${esc(p.nomeCliente)}</b></div>` : ""}
    </div>`;

  const lim = e.jurosZeroAte;
  const semJuros = p.taxa === 0;
  $("faixaJuros").className = "faixa-juros" + (semJuros ? " ativa" : "");
  $("faixaJuros").innerHTML = semJuros
    ? `<strong>JUROS ZERO</strong> Esta simulação em ${p.prazo}x não tem juros. ${e.nome}: financiamento sem juros em até ${lim}x.`
    : `<strong>JUROS ZERO EM ATÉ ${lim}x</strong> No ${e.nome}, o financiamento em até ${lim}x não tem juros.`;
  $("dicaJuros").textContent = `Juros zero até ${lim}x · 0,89% a.m. até 144x · 0,92% a.m. até 180x. ` +
    `Entrada mín. ${fp(e.entradaMin, 1)} · ato mín. ${fp(e.atoMin, 1)} · intermediárias até ${fp(e.intermMaxPct, 1)}` +
    (e.limiteQtdInterm ? " (máx. 6 no plano de 72x ou mais)" : "") + ".";
  const prop = p.valorProposta || 1;
  $("dicaSinal").textContent = p.sinal ? `= ${brl(p.sinal)} · ${fp(p.sinal / prop)} da proposta` : "";
  $("dicaFaixas").innerHTML = p.entradaGrupos.filter((g) => g.qtd > 0).map((g, i) =>
    `Faixa ${i + 1}: ${g.qtd}x de ${brl(g.valor)} (${fp(g.valor / prop)} cada · ${fp(g.qtd * g.valor / prop)} no total)`).join("<br>") +
    (r.nEntrada ? `<br><b>Sinal + parcelas: ${brl(r.entradaInformada)} · ${fp(r.entradaInformada / prop)}</b>` : "");
  const podeBalao = e.balaoMaxPct > 0;
  $("campoBalao").style.display = podeBalao ? "" : "none";
  $("dicaBalao").textContent = r.balao > 0
    ? `${brl(r.balao)} pagos com a última parcela (${fmtData(s.linhas.at(-1).venc)}), corrigidos pela taxa da intermediária: ${brl(r.balaoFinal)}. Limite: ${fp(e.balaoMaxPct, 1)} do valor da venda.`
    : `Opcional. Pago junto com a última parcela do financiamento, até ${fp(e.balaoMaxPct, 1)} do valor da venda.`;
  $("dicaIpca").textContent = `Equivale a ${fp(p.correcaoMensal, 3)} ao mês. Usado só na coluna de projeção.`;

  $("cards").innerHTML = cards(s, p, false);
  $("cardsPdf").innerHTML = cards(s, p, true);

  $("regras").innerHTML = s.regras.map((x) =>
    `<li class="${x.ok ? "ok" : "erro"}"><span class="sel">${x.ok ? "OK" : "Erro"}</span>${x.nome}${x.ok ? "" : `<em>${x.msg}</em>`}</li>`).join("");
  $("avisos").innerHTML = s.avisos.map((a) => `<p class="aviso">⚠ ${a}</p>`).join("");

  // memória de cálculo
  const m = [
    ...(r.comissao > 0 ? [["Valor da proposta", r.valorProposta], ["(−) Comissão apartada", -r.comissao]] : []),
    ["(=) Valor de venda (CRM)", r.valorVenda, r.comissao > 0 ? "forte" : ""],
    ["(−) Total de entrada (sinal + parcelas)", -r.entradaInformada],
    ["(−) Intermediárias", -r.totalInterm],
    ...(r.balao > 0 ? [["(−) Balão final", -r.balao]] : []),
    ["(=) Valor financiado", r.financiamento, "forte"],
    ["(+) Juros do período da entrada", r.jurosPeriodoEntrada],
    ["(=) Base de cálculo do Price", r.baseCalculoPrice, "forte"],
    ["Parcela: principal", r.pmtPrincipal],
    ["Parcela: juros do período da entrada", r.pmtJuros],
    ["(=) Parcela mensal", r.parcelaMensal, "forte"],
  ];
  if (r.comissao > 0) m.push([`Comissão apartada: ${r.qtdComissao}× de`, r.comissaoParcela, "forte"]);
  $("dicaComissao").textContent = (r.comissao > 0
    ? `Comissão de ${brl(r.comissao)} em ${r.qtdComissao}× de ${brl(r.comissaoParcela)}, somada às primeiras ${r.qtdComissao} parcelas. No PDF aparece como "Serviço". ` : "") +
    `Entrada + comissão: ${fp(p.entradaPct + p.comissaoPct, 2)} (mínimo ${fp(e.entradaMin, 1)}).`;
  $("memoria").innerHTML = m.map(([t, v, c]) => `<tr class="${c || ""}"><td>${t}</td><td>${brl(v)}</td></tr>`).join("");

  // fluxo completo (tela)
  const det = $("mostrarDetalhe").checked;
  const temInterm = r.totalInterm > 0;
  const temCom = r.comissao > 0;
  const temBalao = r.balao > 0;
  let h = `<thead><tr><th>Nº</th><th>Tipo</th><th>Vencimento</th><th>Parcela</th>${det ? "<th>Principal</th><th>Juros</th><th>Corrigida (IPCA proj.)</th>" : ""}${temInterm ? "<th>Intermediária</th><th>Interm. + taxa</th>" : ""}${temBalao ? "<th>Balão final</th>" : ""}${temCom ? "<th>Comissão</th>" : ""}<th>Total</th></tr></thead><tbody>`;
  for (const l of s.linhas) {
    const tipo = l.numero === 1 ? "Sinal" : l.tipo === "E" ? "Entrada" : "Mensal";
    h += `<tr class="${l.tipo === "E" ? "ent" : ""}${l.intermCRM || l.balaoCRM ? " int" : ""}"><td>${l.numero}</td><td>${tipo}</td><td>${fmtData(l.venc)}</td><td>${brl(l.parcela)}</td>` +
      (det ? `<td>${brl(l.principal)}</td><td>${brl(l.juros)}</td><td>${brl(l.corrigida)}</td>` : "") +
      (temInterm ? `<td>${l.intermCRM ? brl(l.intermCRM) : ""}</td><td>${l.intermTaxa ? brl(l.intermTaxa) : ""}</td>` : "") +
      (temBalao ? `<td>${l.balaoTaxa ? brl(l.balaoTaxa) : ""}</td>` : "") +
      (temCom ? `<td>${l.comissaoMes ? brl(l.comissaoMes) : ""}</td>` : "") +
      `<td>${brl(l.total)}</td></tr>`;
  }
  $("fluxo").innerHTML = h + "</tbody>";

  tabelaPdf(s, p);
}

const esc = (t) => t.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// ---------- ações ----------
function baixarCsv() {
  const num = (v) => v.toFixed(2).replace(".", ",");
  const linhas = [["Parcela", "Tipo", "Vencimento", "Parcela mensal", "Principal", "Juros", "Valor corrigido (IPCA proj.)", "Intermediária", "Intermediária + taxa", "Balão final", "Comissão (serviço)", "Total"]];
  for (const l of ultimo.linhas)
    linhas.push([l.numero, l.tipo, fmtData(l.venc), num(l.parcela), num(l.principal), num(l.juros), num(l.corrigida), num(l.intermCRM), num(l.intermTaxa), num(l.balaoTaxa), num(l.comissaoMes), num(l.total)]);
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
function rotulosEntrada() {
  const pc = emPct();
  $("rotSinal").textContent = pc ? "Sinal / ato (% da proposta)" : "Sinal / ato (R$)";
  $("rotFaixa").textContent = pc ? "percentual de cada parcela sobre a proposta" : "valor de cada parcela";
}
// troca R$ <-> %: converte os números digitados para manter os mesmos valores
function trocarModoEntrada() {
  const proposta = parseFloat(form.valorProposta.value) || 0;
  const paraPct = emPct();
  const cv = (el) => {
    const v = parseFloat(el.value); if (!v || !proposta) return;
    el.value = paraPct ? +(v / proposta * 100).toFixed(4) : +(v / 100 * proposta).toFixed(2);
  };
  cv(form.sinal);
  form.querySelectorAll('[data-campo="valor"]').forEach(cv);
  rotulosEntrada();
  desenharFaixas(ler().entradaGrupos, paraPct, proposta);
}
form.addEventListener("input", (ev) => {
  const n = ev.target.name;
  if (n === "entradaModo") trocarModoEntrada();
  if (n === "empreendimento" || n === "prazo") aplicarTaxa();
  if (n === "empreendimento" || n === "quadra" || n === "lote") atualizarLote();
  render();
});
$("mostrarDetalhe").addEventListener("change", render);
$("btnCsv").onclick = baixarCsv;
function imprimir(pb) {
  document.body.classList.toggle("pb", pb);
  window.print();
}
window.addEventListener("afterprint", () => document.body.classList.remove("pb"));
$("btnPrint").onclick = () => imprimir(false);
$("btnPrintPB").onclick = () => imprimir(true);
$("btnReset").onclick = () => { preencher({ ...DEFAULTS, dataSimulacao: hoje() }); atualizarLote(); render(); };
$("btnTaxa").onclick = () => { aplicarTaxa(); render(); };

let inicial = { ...DEFAULTS };
try { const salvo = JSON.parse(localStorage.getItem(STORAGE)); if (salvo) inicial = { ...inicial, ...salvo }; } catch {}
preencher(inicial);
atualizarLote();
render();
