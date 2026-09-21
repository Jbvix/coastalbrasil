/*
════════════════════════════════════════════════════════════════════════════════
  A CONVERSA — gramática de intenções local
════════════════════════════════════════════════════════════════════════════════
  Versão: 1.0.0  ·  Autor: Jossian Brito (Charlie Bravo)  ·  2026-09-21 20:10 UTC
  SPRINT 6a.

  MODIFICAÇÕES DESTA VERSÃO (1.0.0 — app v2.13.0)
    + normalizar()        tira acento, caixa e pontuação do que o motor devolve
    + INTENCOES           20 intenções, ~90 gatilhos, cobrindo o que se pergunta
    + reconhecerIntencao() pontuação por gatilho, com limiar e desempate
    + responder()         a resposta, montada do estado real da navegação
    + foraDoEscopo()      o que ela NÃO sabe, dito como não sabe

════════════════════════════════════════════════════════════════════════════════
  POR QUE GRAMÁTICA E NÃO UM MODELO DE LINGUAGEM
════════════════════════════════════════════════════════════════════════════════
  Registrei esta discordância na proposta e ela continua valendo.

  NUMA PONTE, UM ASSISTENTE LIMITADO QUE ESTÁ SEMPRE CERTO VALE MAIS QUE UM
  ILIMITADO QUE ÀS VEZES ERRA COM CONFIANÇA.

  Um modelo na nuvem responde qualquer coisa — e às três da manhã, a 40 milhas
  da costa, responde exatamente NADA, porque não há sinal. Pior: pode responder
  algo plausível e errado sobre a viagem, e uma voz feminina, simpática e
  segura é muito convincente. Quem está de quarto há seis horas não confere.

  Esta gramática:
    · é DETERMINÍSTICA  — a mesma pergunta dá sempre a mesma resposta;
    · é AUDITÁVEL       — dá para ler a lista inteira do que ela sabe;
    · custa ZERO        — nenhuma chamada, nenhuma chave, nenhuma conta;
    · FUNCIONA SEM NUVEM (dado o reconhecimento de voz, que é outra história);
    · e quando não entende, DIZ QUE NÃO ENTENDEU — que é a resposta honesta.

  O modelo de linguagem continua fazendo sentido como LUXO OPCIONAL, desligado
  por padrão, para conversa aberta em porto com sinal. Não foi construído aqui
  porque exige chave, custo e servidor, e porque nenhuma dessas três decisões é
  minha. Ver o fim de docs/manual_usuario.md §9.8.

  DEPENDE DE: estadoAtualParaRelatorio, montarRelatorioHora, falar* (relatorio_voz),
  estadoDoMarMedido (ondas), conselhoDeRotacao (consumo), iaraDizer (iara).
*/

/*
NORMALIZAÇÃO — e por que tirar acento não é preguiça.

O motor de reconhecimento devolve texto com acentuação inconsistente: a mesma
frase vem "está" numa vez e "esta" noutra, "vocês" e "voces". Casar com acento
transformaria cada gatilho em duas ou quatro variantes, e alguma ficaria de
fora. Normaliza-se uma vez, na entrada, e o resto do módulo vive num alfabeto
só.

Também some a pontuação: o motor às vezes põe interrogação, às vezes não.
*/
/*
AS CONTRAÇÕES DO PASSADIÇO — e como elas derrubaram 17 de 61 frases.

Escrevi os gatilhos em português correto: "como está o tempo", "estou no
rumo". Depois rodei o corpus de frases REAIS e 17 falharam de uma vez, todas
pelo mesmo motivo: NINGUÉM FALA ASSIM NUMA PONTE. Fala-se "como tá o tempo",
"tô no rumo", "pra onde a gente vai".

Dava para enumerar as duas formas em cada gatilho — e alguma ficaria de fora,
sempre. Melhor normalizar a fala para a forma escrita uma vez só, na entrada,
e o resto do módulo vive num dialeto só.

A troca é por PALAVRA INTEIRA. Sem a fronteira, o "ta" dentro de
"estabilidade" viraria outra coisa e a intenção do GM sumiria.
*/
const CONVERSA_CONTRACOES = [
  [/\bta\b/g, 'esta'], [/\btao\b/g, 'estao'], [/\bto\b/g, 'estou'],
  [/\btamos\b/g, 'estamos'], [/\bpra\b/g, 'para'], [/\bpro\b/g, 'para o'],
  [/\bce\b/g, 'voce'], [/\bcade\b/g, 'onde esta'],
  [/\bnum\b/g, 'nao'], [/\bqto\b/g, 'quanto'], [/\bhrs\b/g, 'horas']
];

function normalizar(texto) {
  let t = String(texto || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')   // tira acentos
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')                        // tira pontuação
    .replace(/\s+/g, ' ')
    .trim();
  for (const [de, para] of CONVERSA_CONTRACOES) t = t.replace(de, para);
  return t.replace(/\s+/g, ' ').trim();
}

/*
════════════════════════════════════════════════════════════════════════════════
  AS INTENÇÕES
════════════════════════════════════════════════════════════════════════════════
  Cada uma declara:
    chave     identificador
    gatilhos  expressões que a disparam. Pesos: uma expressão de 2+ palavras
              vale mais que uma palavra solta, porque "rumo" sozinho aparece em
              meia dúzia de perguntas e "estou no rumo" só aparece numa.
    exemplos  frases REAIS de passadiço, que a prova 25.2 exige rotear certo.
              Não é documentação: é o corpus da prova.

  A LISTA É PARA SER LIDA. Se alguém precisar saber o que a Iara sabe
  responder, lê daqui — e é exatamente isso que um modelo de linguagem não
  permite fazer.
*/
const INTENCOES = [
  {
    chave: 'falta', gatilhos: ['quanto falta', 'falta muito', 'quanto tempo falta', 'quando e que chega',
      'quanto tempo', 'que horas a gente chega', 'que horas chega', 'quando a gente chega',
      'quando chega', 'qual o eta', 'hora de chegada', 'previsao de chegada'],
    exemplos: ['quanto falta', 'falta muito pra chegar', 'que horas a gente chega',
               'qual o ETA?', 'quando é que chega']
  },
  {
    chave: 'proximo-wp', gatilhos: ['proximo waypoint', 'proximo ponto', 'qual o proximo',
      'pra onde a gente vai', 'para onde vamos', 'qual o rumo agora', 'que rumo',
      'qual a marcacao'],
    exemplos: ['qual o próximo waypoint', 'pra onde a gente vai agora',
               'qual o próximo ponto', 'que rumo eu ponho']
  },
  {
    chave: 'posicao', gatilhos: ['onde a gente esta', 'onde estamos', 'qual a posicao',
      'onde eu estou', 'me da a posicao', 'qual nossa posicao', 'onde a gente'],
    exemplos: ['onde a gente tá', 'qual a posição', 'me dá a posição aí']
  },
  {
    chave: 'referencia', gatilhos: ['cidade mais proxima', 'que cidade', 'porto mais proximo',
      'qual porto', 'terra mais perto', 'que lugar e esse', 'estamos perto de que', 'que porto', 'perto de que', 'tem porto'],
    exemplos: ['qual a cidade mais próxima', 'que porto tem perto',
               'a gente tá perto de quê']
  },
  {
    chave: 'rumo-certo', gatilhos: ['estou no rumo', 'to no rumo', 'estamos no rumo',
      'fora de rumo', 'qual o desvio', 'o xte', 'estou desviado'],
    exemplos: ['tô no rumo?', 'a gente tá fora de rumo', 'qual o desvio agora']
  },
  {
    chave: 'tempo', gatilhos: ['como esta o tempo', 'como ta o tempo', 'qual o tempo',
      'previsao do tempo', 'como vai ficar o tempo', 'vai piorar', 'qual a previsao'],
    exemplos: ['como tá o tempo', 'qual a previsão', 'o tempo vai piorar?']
  },
  {
    chave: 'vento', gatilhos: ['qual o vento', 'como esta o vento', 'quanto de vento',
      'tem vento', 'a rajada', 'tem rajada', 'quanto esta ventando'],
    exemplos: ['qual o vento', 'quanto tá ventando', 'tem rajada?']
  },
  {
    chave: 'mar', gatilhos: ['como esta o mar', 'como ta o mar', 'qual a altura da onda',
      'tamanho da onda', 'quanto de onda', 'a ondulacao'],
    exemplos: ['como tá o mar', 'qual a altura da onda', 'quanto de onda tem']
  },
  {
    chave: 'corrente', gatilhos: ['qual a corrente', 'tem corrente', 'a corrente esta',
      'corrente contra', 'corrente a favor', 'a corrente esta', 'corrente esta contra'],
    exemplos: ['qual a corrente', 'a corrente tá contra?', 'tem corrente aí']
  },
  {
    chave: 'consumo', gatilhos: ['quanto a gente gastou', 'quanto gastamos', 'qual o consumo',
      'quanto de oleo', 'quanto de combustivel', 'quanto sobrou', 'qual o saldo',
      'tem oleo suficiente', 'tem oleo', 'oleo para chegar'],
    exemplos: ['quanto a gente gastou', 'qual o consumo', 'quanto de óleo sobrou',
               'tem óleo pra chegar?']
  },
  {
    chave: 'rotacao', gatilhos: ['qual a rotacao', 'quanto de rpm', 'rotacao economica',
      'posso reduzir', 'da pra economizar', 'faixa economica', 'quanto de rotacao'],
    exemplos: ['qual a rotação econômica', 'dá pra economizar?', 'posso reduzir a rotação']
  },
  {
    chave: 'carga-motor', gatilhos: ['como esta o motor', 'a carga do motor', 'qual a carga',
      'o motor esta pesado', 'motor forcando', 'como esta o motor', 'o motor esta'],
    exemplos: ['como tá o motor', 'qual a carga do motor', 'o motor tá pesado?']
  },
  {
    chave: 'farol', gatilhos: ['que farol', 'qual farol', 'tem farol', 'farol mais proximo',
      'aquela luz', 'que luz e aquela'],
    exemplos: ['que farol é aquele', 'tem farol perto', 'que luz é aquela ali']
  },
  {
    chave: 'balanco', gatilhos: ['como esta o balanco', 'quanto esta jogando',
      'quanto de balanco', 'o barco esta jogando', 'esta jogando', 'o balanco'],
    /* 'o jogo' saiu daqui. Casava com "quem ganhou o jogo" — dois pontos,
       acima do limiar, e a Iara respondia a amplitude de balanço a uma
       pergunta de futebol. GATILHO CURTO E GENÉRICO É FALSO POSITIVO
       ESPERANDO ACONTECER: as outras expressões já cobrem a intenção sem
       roubar uma frase que não é dela. */
    exemplos: ['como tá o balanço', 'quanto o barco tá jogando']
  },
  {
    chave: 'estabilidade', gatilhos: ['qual o gm', 'a estabilidade', 'o barco esta duro',
      'o barco esta mole', 'periodo de balanco'],
    exemplos: ['qual o GM', 'como tá a estabilidade', 'qual o período de balanço']
  },
  {
    chave: 'velocidade', gatilhos: ['qual a velocidade', 'quantos nos', 'quanto de velocidade',
      'a gente ta fazendo quanto'],
    exemplos: ['qual a velocidade', 'a gente tá fazendo quantos nós']
  },
  {
    chave: 'hora', gatilhos: ['que horas sao', 'me da a hora', 'qual a hora', 'que hora e'],
    exemplos: ['que horas são', 'que hora é agora']
  },
  {
    chave: 'repetir', gatilhos: ['repete', 'repita', 'fala de novo', 'nao ouvi',
      'o que voce disse', 'qual foi o ultimo relatorio', 'de novo'],
    exemplos: ['repete', 'não ouvi, fala de novo', 'o que você disse?']
  },
  {
    chave: 'relatorio', gatilhos: ['me da o relatorio', 'faz o relatorio', 'como esta a viagem',
      'me conta como esta', 'situacao geral', 'resumo da viagem', 'como esta a viagem', 'faz um resumo'],
    exemplos: ['me dá o relatório', 'como tá a viagem', 'faz um resumo aí']
  },
  {
    chave: 'ajuda', gatilhos: ['o que voce sabe', 'o que voce faz', 'o que posso perguntar',
      'me ajuda', 'quais perguntas', 'voce sabe fazer o que', 'posso perguntar',
      'posso te perguntar', 'o que eu posso', 'o que perguntar'],
    exemplos: ['o que você sabe fazer', 'o que eu posso te perguntar', 'me ajuda aí']
  }
];

/*
PONTUAÇÃO — por que não é "primeiro que casar".

"Qual o vento" e "como está o tempo" compartilham palavras. Com casamento por
primeira regra, a ordem da lista decidiria a resposta — e a ordem da lista não
é conhecimento sobre a pergunta, é acidente de quem escreveu.

Aqui cada gatilho que aparece na frase soma, e o peso é o NÚMERO DE PALAVRAS
do gatilho: "estou no rumo" (3) vence "rumo" (1), porque a expressão longa é
específica e a curta aparece em meia dúzia de perguntas diferentes.
*/
const CONVERSA_LIMIAR = 2;        // pontos mínimos para aceitar uma intenção
const CONVERSA_MARGEM = 1;        // vantagem mínima sobre a segunda colocada

/*
OS GATILHOS PASSAM PELA MESMA NORMALIZAÇÃO QUE A FALA — e isso foi um defeito.

Eu normalizava a ENTRADA e deixava os gatilhos como escritos. Resultado: o
gatilho 'pra onde a gente vai' nunca casava, porque a entrada já tinha virado
'para onde a gente vai'. Escrever "pra" no gatilho, que parecia esperto, era
justamente o que o desligava.

Normalizados os dois lados, quem escreve gatilho pode escrever como falar —
"tá", "pra", "tô" — que a comparação acontece num dialeto só. E o pré-cálculo
acontece uma vez, na carga do módulo, não a cada pergunta.
*/
const INTENCOES_PRONTAS = INTENCOES.map(i => ({
  chave: i.chave,
  gatilhos: i.gatilhos.map(normalizar).filter(Boolean),
  exemplos: i.exemplos
}));

function reconhecerIntencao(texto) {
  const t = normalizar(texto);
  if (!t) return { chave: null, motivo: 'vazio' };

  const notas = INTENCOES_PRONTAS.map(i => {
    let pontos = 0, casados = [];
    for (const g of i.gatilhos) {
      if (!t.includes(g)) continue;
      pontos += g.split(' ').length;
      /* CASAMENTO EXATO VALE MAIS. Quando a frase INTEIRA é o gatilho não há
         contexto que desvie o sentido: "repete" sozinho é uma palavra só, mas
         é inequívoca — e sem este bônus ficaria abaixo do limiar de dois, e a
         Iara responderia "não entendi" a um pedido perfeitamente claro. Foi o
         que o corpus mostrou. */
      if (t === g) pontos += 2;
      casados.push(g);
    }
    return { chave: i.chave, pontos, casados };
  }).filter(n => n.pontos > 0).sort((a, b) => b.pontos - a.pontos);

  if (!notas.length || notas[0].pontos < CONVERSA_LIMIAR) {
    return { chave: null, motivo: 'nao-entendi', candidatos: notas.slice(0, 2) };
  }
  /* EMPATE É PERGUNTA, NÃO SORTEIO. Se duas intenções ficam a um ponto de
     distância, responder a mais bem colocada é chutar com cara de certeza —
     e é exatamente o defeito que esta gramática existe para não ter. */
  if (notas.length > 1 && notas[0].pontos - notas[1].pontos < CONVERSA_MARGEM) {
    return { chave: null, motivo: 'ambiguo', candidatos: notas.slice(0, 2) };
  }
  return { chave: notas[0].chave, pontos: notas[0].pontos, casados: notas[0].casados };
}

// ═══════════════════════════════════════════════════════════════════════
// AS RESPOSTAS — montadas do estado real, nunca de texto guardado
// ═══════════════════════════════════════════════════════════════════════

/* Auxiliar: o estado da navegação, o mesmo que alimenta o relatório horário.
   Reaproveitar garante que a resposta e o relatório nunca se contradigam. */
function _estado() {
  try { return (typeof estadoAtualParaRelatorio === 'function') ? estadoAtualParaRelatorio() : {}; }
  catch (e) { return {}; }
}

/* Quando o dado não existe, diz-se isso — e diz-se POR QUÊ. "Não sei" sem
   motivo faz o comandante achar que o aplicativo quebrou. */
function _semDado(oQue) {
  return `Ainda não tenho ${oQue} aqui.`;
}

function responder(intencao, estado) {
  const e = estado || _estado();
  const wp = e.proxWp;

  switch (intencao) {
    case 'falta': {
      if (!wp || !isFinite(wp.distNM)) return _semDado('uma rota planejada');
      let r = `Faltam ${falarNum(wp.distNM)} milhas para ${wp.nome}`;
      if (wp.eta instanceof Date && !isNaN(wp.eta)) r += `, chegando ${falarHora(wp.eta)}`;
      return r + '.';
    }
    case 'proximo-wp': {
      if (!wp || !wp.nome) return _semDado('rota planejada');
      return `Próximo waypoint ${wp.nome}, marcação ${falarRumo(wp.brg)}, ` +
             `${falarNum(wp.distNM)} milhas.`;
    }
    case 'posicao': {
      if (!isFinite(e.lat)) return _semDado('posição do GPS');
      let r = `Posição ${falarCoord(e.lat, e.lng)}`;
      if (e.referencia) r += `. ${e.referencia}`;
      return r + '.';
    }
    case 'referencia':
      return e.referencia ? `${e.referencia}.` : _semDado('referência de terra por perto');
    case 'rumo-certo': {
      if (!isFinite(e.xteNM)) return _semDado('perna de rota para medir desvio');
      const x = deveDizerXte(e.xteNM);
      if (!x.dizer) return `Você está no rumo — o desvio é de ${falarNum(Math.abs(e.xteNM), 2)} milhas, ` +
                           `dentro do ruído do GPS.`;
      return `${falarNum(Math.abs(e.xteNM), 2)} milhas fora de rumo, pra ${e.xteLado}.`;
    }
    case 'tempo': {
      if (!e.tempo) return _semDado('dados do tempo');
      const b = falarTempo(e.tempo);
      return b.texto || 'Sem nada digno de nota no tempo agora.';
    }
    case 'vento': {
      const ar = e.tempo && e.tempo.ar;
      if (!ar || !isFinite(ar.wind_speed_10m)) return _semDado('dados de vento');
      const bf = beaufort(ar.wind_speed_10m);
      let r = `Vento de ${rumoCardeal(ar.wind_direction_10m)}, ${falarNos(Math.round(ar.wind_speed_10m))}`;
      if (bf) r += `, ${bf.nome.replace(/^vento /, '')}, força ${bf.f}`;
      const raj = Number(ar.wind_gusts_10m);
      if (isFinite(raj)) r += `, com rajadas de ${Math.round(raj)}`;
      return r + '.';
    }
    case 'mar': {
      /* Duas fontes: o que o modelo prevê e o que o navio SENTE. Dizer as
         duas é mais honesto que escolher uma, e a diferença entre elas é
         informação por si. */
      const med = e.mar && e.mar.pronto ? e.mar : null;
      const prev = e.tempo && e.tempo.mar;
      if (!med && !(prev && isFinite(prev.wave_height))) return _semDado('dados de mar');
      let r = '';
      if (prev && isFinite(prev.wave_height)) {
        r += `O modelo dá ${falarNum(prev.wave_height)} metros de ${rumoCardeal(prev.wave_direction)}. `;
      }
      if (med) {
        r += `O barco está sentindo ${falarNum(med.Hs)} metros, período de ${Math.round(med.Tp)} segundos`;
        if (med.confiabilidade && med.confiabilidade.nivel === 'ruim') {
          r += ' — mas a onda está curta pra este casco, então essa medida subestima';
        }
        r += '.';
      } else if (e.mar && !e.mar.pronto && e.mar.faltamS > 0) {
        r += `Ainda estou medindo o mar pelos sensores; faltam ${Math.ceil(e.mar.faltamS / 60)} minutos.`;
      }
      return r.trim();
    }
    case 'corrente': {
      const c = e.tempo && e.tempo.correnteEfeito;
      if (!c) return _semDado('dados de corrente');
      const sentido = c.ganhoNos > 0 ? `ajudando ${falarNos(c.ganhoNos)}`
                                     : `tirando ${falarNos(-c.ganhoNos)} do seu avanço`;
      return `Corrente de ${falarNos(c.driftNos)} para ${rumoCardeal(c.setGraus)}, ${sentido}.`;
    }
    case 'consumo': {
      const c = e.combustivel;
      if (!c) return _semDado('dados de combustível');
      let r = `Consumidos ${Math.round(c.usadoL)} litros`;
      if (isFinite(c.restanteL)) r += `, restam ${Math.round(c.restanteL)}`;
      r += '.';
      if (c.insuficiente) r += ' O saldo não fecha a rota que falta — vale conferir.';
      return r;
    }
    case 'rotacao': {
      const f = e.rotacao && e.rotacao.faixa;
      if (!f) return _semDado('a rotação informada — coloque no painel e eu calculo');
      if (f.pisoQueManda === 'maxima') return 'Nem na rotação máxima dá pra chegar no horário previsto.';
      if (f.recomendacao === 'aumentar') {
        return `Nessa rotação você não fecha o horário. ${f.rpmSugerido} fecham.`;
      }
      if (f.recomendacao === 'reduzir') {
        let r = `Dá pra fazer o horário com ${f.rpmSugerido} rotações, economizando ${Math.round(f.economiaL)} litros`;
        r += f.atrasoMin > 1 ? `, chegando ${falarDuracao(f.atrasoMin / 60)} mais tarde.` : '.';
        return r;
      }
      return `A rotação que está posta já está na faixa econômica para este horário.`;
    }
    case 'carga-motor': {
      const d = e.rotacao && e.rotacao.carga;
      if (!d) return _semDado('a carga do motor — informe no painel e eu comparo com a curva');
      if (d.texto) return d.texto + '.';
      return `Carga de ${Math.round(d.lidaPct)} por cento, que é o que a curva espera nessa rotação.`;
    }
    case 'farol': {
      const f = e.farol;
      if (!f) return _semDado('nenhum farol na base por perto');
      const car = falarCaracteristica(f.caracteristica);
      let r = `O mais próximo é o ${f.nome}, a ${falarNum(f.distNM)} milhas`;
      if (car) r += `, ${car}`;
      r += deveDizerFarol(f) ? '. Está dentro do alcance daqui.' : '. Ainda fora do alcance daqui.';
      return r;
    }
    case 'balanco': {
      const m = e.mar;
      if (!m || !m.pronto || !m.balanco) return _semDado('medida de balanço');
      return `O barco está jogando ${Math.round(m.balanco.amplitudeGraus)} graus, ` +
             `com período de ${m.balanco.periodoS.toFixed(1).replace('.', ',')} segundos.`;
    }
    case 'estabilidade': {
      const m = e.mar;
      if (!m || !m.pronto) return _semDado('medida de estabilidade');
      if (!m.gm) {
        return `Não tenho medida confiável agora: ${(m.qualidadeBalanco && m.qualidadeBalanco.motivo) || 'sem sinal de balanço'}.`;
      }
      let r = `O período de balanço está em ${m.gm.periodoS.toFixed(1).replace('.', ',')} segundos, ` +
              `o que dá um GM estimado de ${falarNum(m.gm.gm)} metros. ` +
              `É estimativa de tendência, não cálculo de estabilidade — a prancha continua mandando.`;
      if (m.tendenciaGm && m.tendenciaGm.caindo) r += ` Atenção: ${m.tendenciaGm.texto}.`;
      return r;
    }
    case 'velocidade': {
      if (!isFinite(e.sog)) return _semDado('velocidade do GPS');
      return `${falarNos(e.sog)} no fundo, rumo ${falarRumo(e.cog)}.`;
    }
    case 'hora':
      return `${falarHora(e.quando || new Date())}.`;
    case 'repetir': {
      const ult = (typeof relUltimoTexto !== 'undefined') ? relUltimoTexto : '';
      return ult || 'Ainda não fiz nenhum relatório nesta viagem.';
    }
    case 'relatorio':
      return montarRelatorioHora(e).texto;
    case 'ajuda':
      return textoDeAjuda();
    default:
      return null;
  }
}

/*
O QUE ELA SABE, DITO EM VOZ ALTA.

Um assistente que só diz "não entendi" ensina a parar de perguntar. Este
devolve o cardápio — e o cardápio é curto de propósito, porque recitar vinte
intenções seria pior que não responder. As seis mais perguntadas bastam para
o comandante descobrir o resto por analogia.
*/
function textoDeAjuda() {
  return 'Pode me perguntar quanto falta, onde a gente está, como está o tempo, ' +
         'o vento, o mar, o consumo, a rotação econômica, que farol é aquele, ' +
         'como está o balanço e o GM. Também repito o último relatório se você pedir.';
}

/*
NÃO ENTENDI — e a diferença entre as três formas de não entender.

  vazio       não veio texto nenhum: o microfone abriu e fechou sem nada;
  ambiguo     duas intenções empataram: perguntar é mais honesto que chutar;
  nao-entendi nenhuma intenção pontuou: devolve o cardápio.

Tratar as três como uma só seria perder informação que o comandante tem como
usar — "não te ouvi" e "não sei responder isso" pedem reações diferentes.
*/
function respostaDeFalha(rec) {
  const m = rec && rec.motivo;
  if (m === 'vazio') return 'Não consegui ouvir nada. Tenta de novo?';
  if (m === 'ambiguo') {
    const c = (rec.candidatos || []).map(x => _nomeAmigavel(x.chave)).filter(Boolean);
    return c.length === 2
      ? `Não sei se você quer saber ${c[0]} ou ${c[1]}. Pode repetir?`
      : 'Não tenho certeza do que você quer saber. Pode repetir?';
  }
  return 'Essa eu não sei responder. ' + textoDeAjuda();
}

const CONVERSA_NOMES = {
  falta: 'quanto falta', 'proximo-wp': 'o próximo waypoint', posicao: 'a posição',
  referencia: 'a referência de terra', 'rumo-certo': 'o desvio de rumo', tempo: 'o tempo',
  vento: 'o vento', mar: 'o mar', corrente: 'a corrente', consumo: 'o consumo',
  rotacao: 'a rotação econômica', 'carga-motor': 'a carga do motor', farol: 'o farol',
  balanco: 'o balanço', estabilidade: 'a estabilidade', velocidade: 'a velocidade',
  hora: 'a hora', repetir: 'repetir o relatório', relatorio: 'o relatório', ajuda: 'ajuda'
};
function _nomeAmigavel(chave) { return CONVERSA_NOMES[chave] || null; }

/*
O PONTO DE ENTRADA — substitui o placeholder do Sprint 0.

Toda resposta sai com prioridade 'resposta', que a fila põe na frente do
relatório de rotina: o comandante acabou de perguntar, e ouvir um relatório
de waypoint no lugar da resposta faria ele concluir, com razão, que a Iara
não o escutou.
*/
function conversar(transcricao) {
  const rec = reconhecerIntencao(transcricao);
  let texto;
  if (!rec.chave) texto = respostaDeFalha(rec);
  else {
    texto = responder(rec.chave);
    if (!texto) texto = respostaDeFalha({ motivo: 'nao-entendi' });
  }
  if (typeof iaraDizer === 'function') iaraDizer(texto, 'resposta');
  return { intencao: rec.chave, texto, reconhecimento: rec };
}
