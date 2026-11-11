// Motor de cálculo do simulador (réplica da planilha "simulador_moinho")
// Funciona no navegador e no Node (para testes).

// PMT no estilo Excel, retornando valor positivo
export function pmt(rate, n, pv) {
  if (n <= 0) return 0;
  if (rate === 0) return pv / n;
  return (pv * rate) / (1 - Math.pow(1 + rate, -n));
}

// Soma meses mantendo o dia (equivalente a EDATE; ajusta fim de mês)
export function addMonths(date, m) {
  const d = new Date(date.getFullYear(), date.getMonth() + m, 1);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(date.getDate(), last));
  return d;
}

const ym = (d) => `${d.getMonth() + 1}/${d.getFullYear()}`;

export const EMPREENDIMENTOS = {
  moinho: { nome: "Recanto do Moinho", jurosZeroAte: 48 },
  botanique: { nome: "Botanique Residence", jurosZeroAte: 60 },
};

export const DEFAULTS = {
  empreendimento: "moinho",
  valorTabela: 217000,
  valorProposta: 217000,
  entradaPct: 0.08,
  sinal: 5000,
  entradaGrupos: [{ qtd: 12, valor: 1030 }, { qtd: 0, valor: 0 }, { qtd: 0, valor: 0 }],
  prazo: 144,
  taxa: 0.0089,
  diaVenc: 25,
  intermQtd: 0,
  intermValor: 0,
  intermPrimeiroVenc: "",          // "AAAA-MM-DD"
  intermPeriodicidade: "Anual",    // "Anual" | "Semestral"
  intermTaxa: 0.005,
  correcaoMensal: 0.0036,          // correção estimada (planilha: W3)
  dataSimulacao: "",               // "AAAA-MM-DD"; vazio = hoje
};

// Política de juros por empreendimento
// Juros zero até 48x (Moinho) ou 60x (Botanique); depois 0,89% até 144x e 0,92% até 180x (ambos)
export function taxaPolitica(prazo, empreendimento = "moinho") {
  const emp = EMPREENDIMENTOS[empreendimento] || EMPREENDIMENTOS.moinho;
  if (prazo <= emp.jurosZeroAte) return 0;
  if (prazo <= 144) return 0.0089;
  if (prazo <= 180) return 0.0092;
  return null;
}

export function simular(inp) {
  const p = { ...DEFAULTS, ...inp };
  const r = p.taxa;

  const valorVenda = p.valorProposta;                                   // H5
  const entradaPctLiq = p.entradaPct;                                   // H7
  const entradaTotalEsperada = entradaPctLiq * p.valorTabela;           // H8
  const grupos = p.entradaGrupos.filter((g) => g.qtd > 0);
  const nEntrada = grupos.reduce((s, g) => s + g.qtd, 0);               // B12
  const totalEntradaExSinal = grupos.reduce((s, g) => s + g.qtd * g.valor, 0); // B11
  const totalInterm = p.intermQtd * p.intermValor;                      // H24
  const financiamento = valorVenda - p.sinal - totalEntradaExSinal - totalInterm; // H18

  const fatorEntrada = Math.pow(1 + r, nEntrada);
  const pmtPrincipal = pmt(r, p.prazo, financiamento);                  // C19
  const pmtJuros = pmt(r, p.prazo, financiamento * (fatorEntrada - 1)); // C20
  const parcelaMensal = pmtPrincipal + pmtJuros;                        // B15
  const jurosPeriodoEntrada = financiamento * (fatorEntrada - 1);       // C29
  const prazoTotal = nEntrada + p.prazo;                                // C22

  // valor da parcela de entrada nº k (1..nEntrada)
  const valorEntrada = (k) => {
    let acc = 0;
    for (const g of grupos) { acc += g.qtd; if (k <= acc) return g.valor; }
    return 0;
  };

  // Datas: 1ª parcela (sinal) = data da simulação + 1 dia; demais no dia escolhido
  const base = p.dataSimulacao ? new Date(p.dataSimulacao + "T12:00:00") : new Date();
  base.setHours(12, 0, 0, 0);
  const datas = [];
  let d = new Date(base); d.setDate(d.getDate() + 1);
  datas.push(d);
  for (let k = 1; k <= prazoTotal; k++) {
    const nx = addMonths(datas[k - 1], 1);
    const lastDay = new Date(nx.getFullYear(), nx.getMonth() + 1, 0).getDate();
    datas.push(new Date(nx.getFullYear(), nx.getMonth(), Math.min(p.diaVenc, lastDay), 12));
  }

  // Intermediárias: mapa mês/ano -> valor
  const interm = new Map();
  const intermDatas = [];
  if (p.intermQtd > 0 && p.intermPrimeiroVenc) {
    let di = new Date(p.intermPrimeiroVenc + "T12:00:00");
    const passo = p.intermPeriodicidade === "Semestral" ? 6 : 12;
    for (let j = 0; j < p.intermQtd; j++) {
      intermDatas.push(di);
      interm.set(ym(di), (interm.get(ym(di)) || 0) + totalInterm / p.intermQtd);
      di = addMonths(di, passo);
    }
  }

  // Tabela de amortização "antiga" (só para separar principal/juros, colunas T/U)
  let saldoAntigo = valorVenda;
  const linhas = [];
  let intermNaEntrada = false, intermContadas = 0;
  let somaCorrigida = 0, somaTotal = 0;

  for (let k = 0; k <= prazoTotal; k++) {
    const tipo = k <= nEntrada ? "E" : "M";
    let principal, juros, parcela;
    if (k === 0) { parcela = p.sinal; principal = p.sinal; juros = 0; saldoAntigo -= p.sinal; }
    else if (tipo === "E") { parcela = valorEntrada(k); principal = parcela; juros = 0; saldoAntigo -= parcela; }
    else {
      if (k === nEntrada + 1) saldoAntigo -= totalInterm;
      const jAnt = saldoAntigo * r;
      principal = pmtPrincipal - jAnt;
      juros = jAnt + pmtJuros;
      parcela = parcelaMensal;
      saldoAntigo = saldoAntigo + jAnt - pmtPrincipal;
    }
    const fatorCorr = tipo === "M" ? Math.pow(1 + p.correcaoMensal, k) : 1;
    const corrigida = parcela * fatorCorr;
    const numero = k + 1;
    const venc = datas[k];
    const intermCRM = interm.get(ym(venc)) || 0;
    if (intermCRM > 0) { if (tipo === "E") intermNaEntrada = true; else intermContadas++; }
    const intermTaxa = tipo === "M" ? Math.pow(1 + p.intermTaxa, numero) * intermCRM : 0;
    const total = parcela + intermTaxa;
    somaCorrigida += corrigida; somaTotal += total;
    linhas.push({ numero, tipo, venc, parcela, principal, juros, corrigida, intermCRM, intermTaxa, total });
  }

  // Regras (planilha H34:H39 + regras da coluna CB)
  const regras = [];
  const add = (nome, ok, msg) => regras.push({ nome, ok, msg });
  add("Intermediárias até 30% do valor da venda", totalInterm / valorVenda <= 0.30,
    "A soma das intermediárias ultrapassa 30% do valor do lote. Reduza a quantidade ou o valor.");
  if (p.intermQtd > 0) {
    add("Intermediárias dentro do período das mensais", !intermNaEntrada && intermContadas >= p.intermQtd,
      "Todas as intermediárias devem vencer entre a primeira e a última parcela mensal do financiamento.");
    add("Intermediária até 6× a parcela mensal", parcelaMensal * 6 >= p.intermValor,
      `O valor da intermediária não pode passar de ${brl(parcelaMensal * 6)}.`);
    const dia = intermDatas[0]?.getDate();
    add("Intermediárias vencem dia 10 ou 26", dia === 10 || dia === 26,
      "O vencimento das intermediárias deve ser dia 10 ou 26.");
  }
  add("Ato mínimo de 1%", p.sinal / p.valorTabela >= 0.01,
    `O sinal (ato) precisa ser de pelo menos ${brl(p.valorTabela * 0.01)}.`);
  add("Entrada mínima de 8%", p.entradaPct >= 0.08, "A entrada precisa ser de no mínimo 8%.");
  const emp = EMPREENDIMENTOS[p.empreendimento] || EMPREENDIMENTOS.moinho;
  const tp = taxaPolitica(p.prazo, p.empreendimento);
  add("Taxa de juros dentro da política", tp !== null && Math.abs(p.taxa - tp) < 1e-9,
    tp === null ? "Prazo acima de 180 meses não é permitido."
      : `No ${emp.nome}, para ${p.prazo} meses a taxa da política é ${(tp * 100).toFixed(2).replace(".", ",")}% a.m.`);

  const entradaInformada = p.sinal + totalEntradaExSinal;
  const avisos = [];
  if (Math.abs(entradaInformada - entradaTotalEsperada) > 1)
    avisos.push(`Sinal + parcelas de entrada somam ${brl(entradaInformada)}, mas a entrada de ${pct(entradaPctLiq)} sobre a tabela é ${brl(entradaTotalEsperada)}.`);

  return {
    params: p,
    empreendimento: emp,
    resumo: {
      valorVenda, entradaTotalEsperada, entradaInformada,
      entradaEfetivaPct: entradaInformada / valorVenda,
      nEntrada, totalEntradaExSinal, totalInterm, intermPct: totalInterm / valorVenda,
      financiamento, jurosPeriodoEntrada, baseCalculoPrice: financiamento * fatorEntrada,
      parcelaMensal, pmtPrincipal, pmtJuros, prazoTotal,
      somaCorrigida, somaTotal,
    },
    linhas, regras, avisos,
    tudoOk: regras.every((x) => x.ok),
  };
}

export const brl = (v) => (v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
export const pct = (v, d = 2) => `${((v ?? 0) * 100).toFixed(d).replace(".", ",")}%`;
