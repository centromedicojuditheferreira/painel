/* ═══════════════════════════════════════════════════════════════════
   FRASES v1.0 (06/11/2026) — a frase do dia da Marinalva e a orquídea
   Lista aprovada pelo dono em 05/11/2026 (originais, sem versículo copiado — alusão, não citação).
   · FRASES.doDia(data)  → a frase de hoje: muda todo dia, na ordem da lista, e repete só depois de
     passar por todas; segunda, sexta e sábado têm frases próprias, que entram numa semana sim e duas não,
     para não cansar. A mesma frase vale na entrada e no Início do dia.
   · FRASES.emDia(data)  → a frase de quando não há pendência nenhuma (só no Início).
   · ORQUIDEA.svg(opcoes) → a orquídea desenhada em SVG (entrada animada e marca d'água do Início dela).
   Não guarda nada nem fala com banco nenhum.
   ═══════════════════════════════════════════════════════════════════ */
var FRASES = (function () {
  'use strict';

  var DIA = [
    'Bom dia! Café na mão, fé no coração e boleto em dia — nessa ordem, de preferência.',
    'Deus fez o mundo em seis dias e descansou no sétimo. A gente só precisa chegar até sexta.',
    'A fé move montanhas. Pendência de secretária, só o Cortex avisando mesmo.',
    'Agenda cheia é bênção. Agenda vazia é só sexta-feira à tarde.',
    'Jó teve paciência com tudo. A gente só precisa ter com a maquininha.',
    'Deus escreve certo por linhas tortas. O Feegow, nem sempre — por isso existe o Cortex.',
    'Quem planta orquídea colhe paciência. Quem paga conta em dia colhe paz.',
    'O Senhor cuida dos pardais — e os pardais nem têm Unimed. Respira.',
    'Davi venceu Golias com uma pedra. A senhora vence o mês com um PIN.',
    'Noé aguentou quarenta dias de chuva. A gente aguenta uma manhã de boletos.',
    'Mais vale um boleto pago na mão do que dois vencendo no bolso.',
    'A graça é de graça. O estoque da conveniência, esse a gente repõe.',
    'Fé do tamanho de um grão de mostarda já basta. Café, só do tamanho da caneca mesmo.',
    'Josué deu sete voltas em Jericó. A senhora só precisa dar uma no Financeiro.',
    'Deus é fiel todos os dias. A internet da clínica, só na maioria deles.',
    'O amor é paciente, o amor é bondoso. O amor também confere o caixa.',
    'Deus proverá. A planilha só ajuda a mostrar por onde.',
    'Hoje é dia de agradecer: pelo café, pela saúde e por nenhum boleto atrasado.',
    'A alegria do Senhor é a nossa força. O café é só o reforço.',
    'Que a senhora tenha a calma de Maria, a coragem de Débora e o café de Marta.',
    'Salomão era o mais sábio de todos e nem precisou conferir estoque.',
    'Moisés levou quarenta anos no deserto porque não tinha Cortex para avisar o caminho.',
    'Ore, trabalhe e, se der tempo, dê uma passada na conveniência.',
    'Lâmpada para os pés, luz para o caminho — e sinal de Wi-Fi para a Unimed não cair.'
  ];
  var EM_DIA = [
    'Hoje o Cortex acordou louvando: não tem pendência nenhuma. Confere aí, de qualquer jeito.',
    'Nenhuma pendência. Ou as meninas estão inspiradas, ou é milagre. Aceitamos os dois.',
    'Tudo em dia. Pode tomar o café sentada — Deus também descansou.'
  ];
  var SEMANA = {   /* getDay(): 1 = segunda, 5 = sexta, 6 = sábado */
    1: ['Segunda-feira. Deus criou a luz no primeiro dia justamente para a gente achar a cafeteira.'],
    5: ['Sexta-feira: até os anjos cantam um pouquinho mais alto.',
        'Sexta-feira. Semana vencida, graças a Deus — e às meninas, que resolveram as pendências.'],
    6: ['Sábado na clínica: meio expediente, bênção inteira.']
  };

  function diaN(d) { return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 864e5); }
  function data(d) { return d instanceof Date ? d : new Date(); }

  /* a frase de hoje: na ordem da lista, uma por dia; a do dia da semana entra numa semana sim e duas não */
  function doDia(d) {
    d = data(d);
    var n = diaN(d), semana = Math.floor(n / 7), esp = SEMANA[d.getDay()];
    if (esp && esp.length && semana % 3 === 0) return esp[Math.floor(semana / 3) % esp.length];
    return DIA[((n % DIA.length) + DIA.length) % DIA.length];
  }
  function emDia(d) { var n = diaN(data(d)); return EM_DIA[((n % EM_DIA.length) + EM_DIA.length) % EM_DIA.length]; }

  return { doDia: doDia, emDia: emDia, todas: function () { return { dia: DIA.slice(), emDia: EM_DIA.slice(), semana: SEMANA }; } };
})();

/* ── a orquídea (desenho original, em SVG): cinco pétalas em volta do centro e o labelo embaixo.
   Cada pétala fica num <g> girado; a animação de desabrochar (CSS) mexe só no <path> de dentro, a partir do centro. ── */
var ORQUIDEA = (function () {
  'use strict';
  var seq = 0;
  /* pétala com a base no centro (100,100), apontando para cima */
  var PETALA = 'M100 100C85 91 72 62 86 38C94 25 106 25 114 38C128 62 115 91 100 100Z';
  var VEIA   = 'M100 96C98 80 96 62 100 40M100 96C104 80 106 62 100 40';
  /* labelo: três lobos embaixo e a coluna no meio */
  var LABELO = 'M100 100C92 104 84 112 86 122C88 130 96 132 100 126C104 132 112 130 114 122C116 112 108 104 100 100Z';
  var LOBO   = 'M100 100C96 100 88 103 86 107C84 112 90 115 94 112C97 110 99 105 100 103C101 105 103 110 106 112C110 115 116 112 114 107C112 103 104 100 100 100Z';

  /* opcoes: { classe } — as cores e a animação vêm do CSS da tela que usa */
  function svg(o) {
    o = o || {};
    var id = 'orq' + (++seq);
    var petalas = [
      { a: 0,    sx: 1,    sy: 1,    k: 'dorsal' },
      { a: -72,  sx: 1.35, sy: 1.02, k: 'lateral' },
      { a: 72,   sx: 1.35, sy: 1.02, k: 'lateral' },
      { a: -146, sx: .92,  sy: 1.08, k: 'sepala' },
      { a: 146,  sx: .92,  sy: 1.08, k: 'sepala' }
    ];
    var h = '<svg class="orq ' + (o.classe || '') + '" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">' +
      '<defs><radialGradient id="' + id + 'p" cx="50%" cy="78%" r="70%"><stop offset="0" class="orq-g1"/><stop offset=".55" class="orq-g2"/><stop offset="1" class="orq-g3"/></radialGradient>' +
      '<radialGradient id="' + id + 'l" cx="50%" cy="30%" r="80%"><stop offset="0" class="orq-l1"/><stop offset="1" class="orq-l2"/></radialGradient></defs>';
    petalas.forEach(function (p, i) {
      /* três camadas: o giro (orq-g), o formato (orq-s, só escala) e a que a animação mexe (orq-p, sem transform próprio) */
      h += '<g class="orq-g ' + p.k + '" transform="rotate(' + p.a + ' 100 100)">' +
        '<g class="orq-s" transform="translate(100 100) scale(' + p.sx + ' ' + p.sy + ') translate(-100 -100)">' +
        '<g class="orq-p" style="--i:' + i + '">' +
        '<path class="orq-pet" d="' + PETALA + '" fill="url(#' + id + 'p)"/>' +
        '<path class="orq-veia" d="' + VEIA + '" fill="none"/></g></g></g>';
    });
    h += '<g class="orq-p orq-lab" style="--i:5"><path class="orq-labelo" d="' + LABELO + '" fill="url(#' + id + 'l)"/>' +
      '<path class="orq-lobo" d="' + LOBO + '"/><circle class="orq-centro" cx="100" cy="99" r="4.2"/></g>';
    h += '</svg>';
    return h;
  }
  return { svg: svg };
})();
