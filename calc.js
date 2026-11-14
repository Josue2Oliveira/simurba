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

// Regras comerciais por empreendimento
export const EMPREENDIMENTOS = {
  moinho: {
    nome: "Recanto do Moinho", jurosZeroAte: 48,
    entradaMin: 0.10, atoMin: 0.01, intermMaxPct: 0.30, limiteQtdInterm: false, balaoMaxPct: 0,
  },
  botanique: {
    nome: "Botanique Residence", jurosZeroAte: 60,
    entradaMin: 0.10, atoMin: 0.01, intermMaxPct: 0.40, limiteQtdInterm: true, // 6 (prazo ≥ 72x) ou 4 (< 72x)
    balaoMaxPct: 0.40, // balão final: até 40% do valor da proposta (já com desconto), limite separado das intermediárias
  },
};
export const IDADE_MAXIMA = 80; // idade do cliente na última parcela (ambos)

export const DEFAULTS = {
  empreendimento: "moinho",
  valorTabela: 217000,
  valorProposta: 217000,
  entradaPct: 0.10,
  comissaoPct: 0,
  qtdComissao: 1,
  entradaModo: "valor",            // "valor" (R$) ou "pct" (% da proposta) — só muda a forma de digitar
  sinal: 5500,
  entradaGrupos: [{ qtd: 12, valor: 1350 }, { qtd: 0, valor: 0 }, { qtd: 0, valor: 0 }],
  dataNascimento: "",              // "AAAA-MM-DD"
  // dados só de exibição / PDF
  nomeCliente: "", quadra: "", lote: "", area: 0,
  pdfM2: false, pdfServico: true, pdfTotal: false, pdfIpca: false, ipcaAnual: 0.0441,
  prazo: 144,
  taxa: 0.0089,
  diaVenc: 25,
  intermModo: "valor",             // "valor" (R$) ou "pct" (% da proposta, por parcela)
  intermQtd: 0,
  balaoPct: 0,                     // balão final (% da proposta) — só Botanique
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

  // Comissão apartada: sai da entrada e é paga à parte, em qtdComissao parcelas
  const comissao = p.comissaoPct * p.valorProposta;                     // K9 (sobre a proposta)
  const qtdComissao = Math.max(1, Math.round(p.qtdComissao || 1));
  const comissaoParcela = comissao / qtdComissao;                       // BK9
  const valorVenda = p.valorProposta - comissao;                        // H5 (venda CRM)
  const entradaPctLiq = p.entradaPct;                                   // entrada Urba (sem a comissão)
  const entradaTotalEsperada = entradaPctLiq * p.valorProposta;         // % sobre a proposta
  const grupos = p.entradaGrupos.filter((g) => g.qtd > 0);
  const nEntrada = grupos.reduce((s, g) => s + g.qtd, 0);               // B12
  const totalEntradaExSinal = grupos.reduce((s, g) => s + g.qtd * g.valor, 0); // B11
  const totalInterm = p.intermQtd * p.intermValor;                      // H24
  // Balão final (modelo "intermediária"): sai do financiamento e é pago com a última parcela,
  // corrigido pela taxa da intermediária (1 + taxa)^nº da parcela
  const empB = EMPREENDIMENTOS[p.empreendimento] || EMPREENDIMENTOS.moinho;
  const balao = empB.balaoMaxPct > 0 ? Math.max(0, p.balaoPct || 0) * p.valorProposta : 0;
  const financiamento = valorVenda - p.sinal - totalEntradaExSinal - totalInterm - balao; // H18

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
      if (k === nEntrada + 1) saldoAntigo -= totalInterm + balao;
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
    const comissaoMes = comissao > 0 && numero <= qtdComissao ? comissaoParcela : 0;
    const balaoCRM = k === prazoTotal && tipo === "M" ? balao : 0;
    const balaoTaxa = balaoCRM * Math.pow(1 + p.intermTaxa, numero);
    const total = parcela + intermTaxa + comissaoMes + balaoTaxa;
    somaCorrigida += corrigida; somaTotal += total;
    linhas.push({ numero, tipo, venc, parcela, principal, juros, corrigida, intermCRM, intermTaxa, balaoCRM, balaoTaxa, comissaoMes, total });
  }

  // Regras (planilha H34:H39 + regras da coluna CB)
  const emp = EMPREENDIMENTOS[p.empreendimento] || EMPREENDIMENTOS.moinho;
  const regras = [];
  const add = (nome, ok, msg) => regras.push({ nome, ok, msg });
  const pc = (x) => { const v = Math.round(x * 1000) / 10; return (Number.isInteger(v) ? v : v.toFixed(1).replace(".", ",")) + "%"; };
  add(`Intermediárias até ${pc(emp.intermMaxPct)} do valor da venda`, totalInterm / valorVenda <= emp.intermMaxPct + 1e-9,
    `A soma das intermediárias (${pct(totalInterm / valorVenda)}) ultrapassa ${pc(emp.intermMaxPct)} do valor da venda. Reduza a quantidade ou o valor.`);
  if (balao > 0) add(`Balão final até ${pc(emp.balaoMaxPct)} do valor da venda`, balao / p.valorProposta <= emp.balaoMaxPct + 1e-9,
    `O balão final (${pct(balao / p.valorProposta)}) ultrapassa ${pc(emp.balaoMaxPct)} do valor da venda.`);
  if (emp.limiteQtdInterm && p.intermQtd > 0 && p.prazo >= 72) {
    // plano longo (72x ou mais): no máximo 6 intermediárias; plano curto sem limite de quantidade
    add("No máximo 6 intermediárias (plano longo, 72x ou mais)", p.intermQtd <= 6,
      `Com ${p.prazo} meses de financiamento são permitidas no máximo 6 intermediárias.`);
  }
  if (p.intermQtd > 0) {
    add("Intermediárias dentro do período das mensais", !intermNaEntrada && intermContadas >= p.intermQtd,
      "Todas as intermediárias devem vencer entre a primeira e a última parcela mensal do financiamento.");
    add("Intermediária até 6× a parcela mensal", parcelaMensal * 6 >= p.intermValor,
      `O valor da intermediária não pode passar de ${brl(parcelaMensal * 6)}.`);
    const dia = intermDatas[0]?.getDate();
    add("Intermediárias vencem dia 10 ou 26", dia === 10 || dia === 26,
      "O vencimento das intermediárias deve ser dia 10 ou 26.");
  }
  // ato Urba = só o sinal (o serviço/comissão não tem mínimo; quem define é o corretor)
  add(`Ato Urba mínimo de ${pc(emp.atoMin)}`, p.sinal / p.valorProposta >= emp.atoMin - 0.0001,
    `O ato Urba (sinal) está em ${brl(p.sinal)} (${pct(p.sinal / p.valorProposta)}); o mínimo é ${brl(p.valorProposta * emp.atoMin)} (${pc(emp.atoMin)}).`);
  // entrada real = sinal + parcelas de entrada + comissão apartada
  const entradaReal = p.sinal + totalEntradaExSinal + comissao;
  add(`Entrada${comissao > 0 ? " + comissão" : ""}: mínimo de ${pc(emp.entradaMin)}`, entradaReal / p.valorProposta >= emp.entradaMin - 0.0001,
    `Sinal + parcelas de entrada${comissao > 0 ? " + comissão" : ""} somam ${brl(entradaReal)} (${pct(entradaReal / p.valorProposta)}); o mínimo é ${brl(p.valorProposta * emp.entradaMin)}.`);
  // idade do cliente na última parcela
  const ultimaParcela = linhas[linhas.length - 1].venc;
  if (p.dataNascimento) {
    const nasc = new Date(p.dataNascimento + "T12:00:00");
    const limite = new Date(nasc); limite.setFullYear(nasc.getFullYear() + IDADE_MAXIMA);
    let idadeFim = ultimaParcela.getFullYear() - nasc.getFullYear();
    if (ultimaParcela < new Date(ultimaParcela.getFullYear(), nasc.getMonth(), nasc.getDate())) idadeFim--;
    add(`Cliente com até ${IDADE_MAXIMA} anos no fim do financiamento`, ultimaParcela < limite,
      `Na última parcela (${ultimaParcela.toLocaleDateString("pt-BR")}) o cliente terá ${idadeFim} anos.`);
  } else {
    add(`Cliente com até ${IDADE_MAXIMA} anos no fim do financiamento`, false, "Informe a data de nascimento do cliente.");
  }
  const tp = taxaPolitica(p.prazo, p.empreendimento);
  add("Taxa de juros dentro da política", tp !== null && Math.abs(p.taxa - tp) < 1e-9,
    tp === null ? "Prazo acima de 180 meses não é permitido."
      : `No ${emp.nome}, para ${p.prazo} meses a taxa da política é ${(tp * 100).toFixed(2).replace(".", ",")}% a.m.`);

  const entradaInformada = p.sinal + totalEntradaExSinal;
  const avisos = [];
  if (Math.abs(entradaInformada - entradaTotalEsperada) > 1)
    avisos.push(`Sinal + parcelas de entrada somam ${brl(entradaInformada)}, mas a entrada de ${pct(entradaPctLiq)} sobre a proposta é ${brl(entradaTotalEsperada)}.`);

  return {
    params: p,
    empreendimento: emp,
    resumo: {
      valorVenda, entradaTotalEsperada, entradaInformada,
      valorTabela: p.valorTabela,
      valorProposta: p.valorProposta,
      comissao, qtdComissao, comissaoParcela,
      desconto: Math.max(0, p.valorTabela - p.valorProposta),
      descontoPct: p.valorTabela > 0 ? Math.max(0, p.valorTabela - p.valorProposta) / p.valorTabela : 0,
      entradaEfetivaPct: entradaInformada / p.valorProposta,
      nEntrada, totalEntradaExSinal, totalInterm, intermPct: totalInterm / valorVenda,
      balao, balaoPct: balao / p.valorProposta, balaoFinal: linhas[linhas.length - 1].balaoTaxa,
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
