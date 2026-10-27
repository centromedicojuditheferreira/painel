/* ═══════════════════════════════════════════════════════════════════
   TUT v1.0 — o CONTEÚDO dos tutoriais do Cortex (27/10/2026)
   Para mudar um texto: edite aqui e SUBA a versao daquele tutorial — ele
   reabre uma vez para todas, marcado "Atualizado".
   Campos: titulo, secao, resumo (cartão da aba Tutoriais), versao,
   telas (destinos do menu onde o "?" abre e onde abre sozinho; vazio = Manual geral),
   ondeAbre (texto do "Não mostrar de novo ao abrir …"), adm (só a Administração vê),
   passos: [{ t: título, p: texto, e: quadro de destaque, img: arquivo em img/guia/ (larga:true = print de tela larga), vis: desenho }]
   O aviso "Achou algo errado…? Avise a Administração." entra sozinho no último passo.
   [CONFIRMAR] = rascunho à espera do Gabriel; sai do texto antes de ir para a recepção.
   ═══════════════════════════════════════════════════════════════════ */
var TUT_CONTEUDO = {

  geral: {
    titulo: 'Manual geral da recepção', secao: 'Comece por aqui', versao: 1, telas: [],
    resumo: 'Todas as obrigações da recepção no Cortex, na ordem do dia: chegar, atender, cobrar, fechar.',
    passos: [
      { vis: function(){ return TUT.icone('C'); }, t: 'O Cortex em um minuto',
        p: 'O Cortex mostra <b>tudo o que a recepção precisa resolver</b>: guias, cadastros, cortes, mensagens que não saíram, a conferência dos profissionais e a conveniência.',
        e: '<b>Quadrado vermelho = obrigação.</b> Os quadrados no alto da tela (Resolver agora) e os números vermelhos no menu são coisas que vocês precisam resolver.<br>Em cada tela, o botão <b>?</b> no canto de cima abre o tutorial daquela tela. Todos ficam também no menu, em <b>Ajuda → Tutoriais</b>.' },

      { vis: function(){ return TUT.linha([['Chegou', 'Gaveta', 'conte o dinheiro'], ['Saiu por último', 'Gaveta', 'conte de novo', 'quente']]); },
        t: 'Ao chegar: contar a gaveta',
        p: 'Na primeira entrada do dia, antes de abrir o Cortex, conte o dinheiro da gaveta, cédula por cédula e moeda por moeda, e toque em <b>Enviar contagem</b>.',
        e: 'Conte com calma: o número que você digita fica registrado com o seu nome e a hora.<br>Se o Cortex mostrar o quadrado <b>Gaveta: contar de novo</b>, conte outra vez. Se mostrar <b>Gaveta: diferença</b>, abra, confira o Feegow e a conveniência e escreva o que encontrou.' },

      { vis: function(){ return TUT.linha([['Abriu', 'Feegow', 'corrija lá'], ['Volte', 'Cortex', 'marque o que fez', 'quente'], ['Até 30 min', 'Some', 'o sistema confere', 'ok']]); },
        t: 'A regra de todas as telas',
        p: 'Quase tudo se corrige <b>no Feegow</b>. O Cortex só mostra o problema e confere se foi resolvido.<br><b>1.</b> Corrija no Feegow.<br><b>2.</b> Volte ao Cortex e marque <b>O que você fez?</b> (com uma anotação: protocolo, com quem falou).<br><b>3.</b> A linha some sozinha quando o sistema confirmar.',
        e: '<b>Marcar "Resolvido" sem resolver não adianta:</b> em 30 minutos a linha volta, e a Administração é avisada de que foi marcado e não foi feito.<br>Marcar o que fez também evita que duas pessoas corrijam a mesma coisa.' },

      { vis: function(){ return '<div class="gd-faq"><b style="color:var(--vermelho)">!</b></div>'; },
        t: 'Agenda: consulta sem guia',
        p: 'A tela inicial é a <b>Agenda</b>. Ela lista as consultas com problema de guia.<br><b>Hoje sem guia</b> vem sempre primeiro: <b>não atender</b> sem a guia. Avise o paciente agora. Se a guia não entrar antes do horário, desmarque no Feegow.',
        e: '<b>Sem guia</b> ou <b>Saldo esgotado</b>: solicitar a guia (ou a renovação) ou desmarcar.<br><b>Sem carteirinha</b>, <b>Procedimento errado</b>, <b>Guia de outra terapia</b>: corrigir no Feegow.<br><b>Renovação de validade Unimed</b> (botão no alto da Agenda): só para guia que teve a <b>data renovada</b>. Guia nova não entra ali: o sistema traz sozinho.' },

      { vis: function(){ return TUT.icone('F'); }, t: 'Cadastros',
        p: 'Uma linha por paciente com cadastro errado no Feegow: convênio trocado, procedimento errado, paciente duplicado, carteirinha repetida, guia sem ficha.',
        e: 'Carteirinha que começa com <b>0178</b> é <b>Unimed Local</b>. Qualquer outra é <b>Intercâmbio</b>.<br><b>Nunca junte</b> fichas com CPF de zeros ou carteirinha 0 ou 01: são pessoas diferentes.<br>O sistema confere de novo a cada 15 minutos.' },

      { vis: function(){ return '<div class="gd-faq"><b style="color:var(--vermelho)">✕</b></div>'; },
        t: 'Nunca "excluir todas" no Feegow',
        p: 'Ao apagar consultas de uma série no Feegow, use <b>somente este</b> ou <b>deste dia em diante</b>. <b>Nunca</b> use "excluir todas": isso apaga também as consultas que já passaram, e elas fazem falta no faturamento.',
        e: 'Se uma série for apagada inteira, ela aparece na tela <b>Exclusões</b>. Lá, responda <b>Quem apagou?</b> e <b>O que você fez?</b>: restaure no Feegow ou marque <b>Estava certo apagar</b>. Esse último passa pela aprovação da Administração.' },

      { vis: function(){ return TUT.linha([['Segunda a sexta', '21h', 'horário do corte', 'fim'], ['Sábado', '11h', 'horário do corte', 'fim'], ['Guia a caminho', '20h', 'aguardar, uma vez só', 'quente']]); },
        t: 'Corte: até as 21h',
        p: 'Paciente que perdeu a cobertura vai para o <b>Corte</b> no <b>dia útil seguinte à última consulta coberta</b> (nunca no dia dela). Abra o próximo agendamento no Feegow, apague <b>este e os próximos</b> (nunca os anteriores) e assine no Cortex em <b>Excluí no Feegow</b>.',
        e: '<b>Guia a caminho?</b> Use <b>Aguardar 20h</b> e escolha o motivo. Vale <b>uma vez só</b> por consulta: depois, é cortar.<br>Guia solicitada segura no máximo 2 dias.' },

      { vis: function(){ return TUT.linha([['Apareceu', 'Falhas', 'abra a mensagem'], ['Mande', 'WhatsApp Web', 'a mensagem pronta', 'quente'], ['Mandou', 'Mandei', 'some da lista', 'ok']]); },
        t: 'Falhas: mensagem que não saiu',
        p: 'Quando o robô não consegue mandar um WhatsApp (confirmação, lembrete, aviso de guia, aviso ao profissional), ele aparece em <b>Falhas</b>.<br>Abra, toque em <b>Abrir no WhatsApp</b>, mande a mensagem pronta e toque em <b>Mandei</b>.',
        e: '<b>Sem celular?</b> Primeiro cadastre o celular do paciente no Feegow, depois mande.<br><b>Ninguém fica sem aviso.</b> Mensagem parada há mais de 2 horas é cobrada no Telegram.' },

      { vis: function(){ return TUT.linha([['Segunda', '8h', 'abre a agenda'], ['Segunda', '22h', 'prazo do profissional', 'quente'], ['Terça', '22h', 'trava', 'fim']]); },
        t: 'Conferência dos profissionais',
        p: 'Toda semana os profissionais conferem a própria agenda no site deles. O papel de vocês: <b>tirar dúvidas, corrigir no Feegow o que eles pedirem e cobrar quem atrasar</b>.',
        e: 'Todo <b>dia 1º</b> abrem os últimos dias do mês anterior: é o que gera o recibo do repasse.<br>A tela <b>Conferência</b> tem o manual completo.' },

      { vis: function(){ return TUT.icone('R$'); }, t: 'Conveniência',
        p: 'Toda venda passa pelo botão <b>Nova venda</b>, no canto de baixo da tela. Profissional pode pagar na hora ou <b>lançar na notinha</b>.<br>Mercadoria que chegou: registre em <b>Estoque → Nova entrada</b>.',
        e: '<b>Lançou errado?</b> Abra o lançamento (no Histórico ou na notinha) e use <b>Marcar como erro</b>, com o motivo. O estoque e o saldo voltam sozinhos.<br>Pagamento de notinha: abra a notinha do profissional → <b>Pagamento</b>.' },

      { vis: function(){ return TUT.linha([['Até', '21h', 'corte feito (sábado 11h)', 'fim'], ['A partir de', '21h', 'aparece "Fechar a gaveta"'], ['Quem fecha', 'Conta', 'a gaveta antes de sair', 'quente']]); },
        t: 'Ao fechar a clínica',
        p: 'Quem fecha a clínica toca em <b>Fechar a gaveta</b> e conta o dinheiro antes de sair.',
        e: 'Antes de sair, confira também se não ficou nenhum quadrado vermelho do <b>Corte</b>: o corte é às 21h (sábado, 11h).' }
    ]
  },

  conferencia: {
    titulo: 'Manual da conferência dos profissionais', secao: 'Profissionais', versao: 1, telas: ['conferencia'], ondeAbre: 'a Conferência',
    resumo: 'Como os profissionais confirmam a agenda, os prazos, os avisos e o que fazer quando eles apontam um erro.',
    passos: [
    { img: '4-agenda.jpg?v=1', t: 'O que é a conferência',
      p: 'Cada profissional confere a <b>própria agenda</b> pelo celular, no site <b>profissionais.levsoul.com.br</b>, e confirma que está tudo certo.',
      e: 'É por essa agenda que a clínica fatura e calcula o repasse. O papel de vocês: <b>tirar dúvidas, corrigir no Feegow e cobrar quem atrasar</b>.' },
    { img: '1-entrar.jpg?v=1', t: 'Primeiro acesso',
      p: 'O profissional recebe pelo WhatsApp da clínica a <b>mensagem de acesso</b>. Ele entra com o <b>e-mail do cadastro no Feegow</b> e a senha <b>0000</b>.',
      e: 'Não entrou? Quase sempre é o e-mail: confira o do cadastro. O 0000 não vence, vale até ele entrar. Errou a senha 5 vezes seguidas: espera 15 minutos.' },
    { img: '2-senha.jpg?v=1', t: 'Ele cria a senha dele',
      p: 'Na primeira entrada, o site pede uma <b>senha nova</b>, de pelo menos 4 caracteres. Daí em diante ele entra com ela.',
      e: 'Esqueceu a senha? Quem gera um 0000 novo é a Administração.' },
    { img: '3-tutorial-dia.jpg?v=1', t: 'Ele recebe um passo a passo',
      p: 'Logo depois, aparece um <b>passo a passo</b> explicando tudo, inclusive o prazo.',
      e: 'Ele pode rever quando quiser em <b>Como funciona</b>, dentro do site.' },
    { img: '4-agenda.jpg?v=1', t: 'Ele confere consulta por consulta',
      p: 'Cada consulta aparece com horário, paciente, convênio e a situação: <b>Atendido</b> ou <b>Não compareceu</b>.',
      e: 'Viu algo errado? Ele avisa vocês pelo WhatsApp e <b>não confirma ainda</b>. Ele só confirma <b>depois que tudo estiver corrigido e aparecendo no site</b>.' },
    { img: '5-confirmar.jpg?v=1', t: 'Confirma com uma selfie',
      p: 'Só pelo <b>celular</b>: ele marca a declaração e tira uma <b>selfie na hora</b>. <b>A selfie é a assinatura dele.</b>',
      e: 'A câmera não abre? Ele precisa permitir a câmera para o site no navegador do celular. Pelo computador ele vê a agenda, mas não confirma.' },
    { img: '6-confirmada.jpg?v=1', t: 'Agenda confirmada',
      p: 'Depois de confirmada, a agenda <b>não muda mais</b> pelo site. Ele pode baixar o comprovante em PDF.',
      e: 'Aqui na Conferência, ele sai de <b>Ainda não</b> e vai para <b>Confirmou</b>, e vocês conseguem ver a selfie. Confirmou com erro? Fale com a Administração.' },
    { vis: function(){ return TUT.linha([['Segunda', '8h', 'abre a semana anterior'], ['Segunda', '22h', 'prazo do profissional', 'quente'],
                                         ['Terça', '22h', 'última chance; depois trava', 'fim']]); },
      t: 'As datas',
      p: 'Toda <b>segunda, às 8h</b>, abre a agenda da semana anterior. O prazo que o profissional vê é <b>segunda, 22h</b>. Até <b>terça, 22h</b> ainda dá para confirmar (fica marcado como atrasado). Depois disso <b>trava</b> e segue para o faturamento como está.',
      e: '<b>Todo dia 1º:</b> abrem os últimos dias do mês anterior. É essa confirmação que gera o recibo do repasse, então tem que ser <b>no mesmo dia, o quanto antes</b>.' },
    { vis: function(){ return TUT.linha([['Segunda', '18h', '1º aviso'], ['Terça', '9h', '2º aviso', 'quente'], ['Terça', '17h', 'último aviso', 'fim']]); },
      t: 'Os avisos',
      p: '<b>Mensagem de acesso:</b> sai quando o profissional começa ou quando ganha um 0000 novo, com o endereço, o e-mail e a senha.',
      e: '<b>Toda semana</b>, quem ainda não confirmou recebe um aviso de vocês na <b>segunda às 18h</b>, na <b>terça às 9h</b> e na <b>terça às 17h</b>. Os de terça deixam claro que <b>depois das 22h não dá mais para corrigir</b>.<br><b>Dia 1º:</b> avisos às <b>11h</b> e às <b>15h</b>.<br>Em breve o Cortex mostra um quadradinho vermelho na hora de cada aviso, com a mensagem pronta.' },
    { vis: function(){ return TUT.linha([['Passo 1', 'Feegow', 'corrija a consulta'], ['Passo 2', '15 min', 'espere o sistema ler'],
                                         ['Passo 3', 'Conferência', 'abra o profissional e confira', 'quente'], ['Passo 4', 'WhatsApp', 'avise o profissional', 'ok']]); },
      t: 'Quando ele avisa uma consulta errada',
      p: '<b>1.</b> Corrija no Feegow.<br><b>2.</b> Espere <b>15 minutos</b>.<br><b>3.</b> Aqui na Conferência, clique no profissional e veja, em <b>Consultas do período</b>, se a consulta já aparece certa.<br><b>4.</b> Apareceu certa? Avise o profissional que ele já pode conferir de novo e confirmar.',
      e: '<b>Não apareceu depois de 15 minutos?</b> Procure a Administração e conte o que foi corrigido (paciente, dia e horário).<br><b>Importante:</b> o profissional só confirma quando <b>tudo</b> estiver corrigido. Depois de confirmada, a agenda não muda mais.' },
    { vis: function(){ return TUT.icone('?'); },
      t: 'O que responder ao profissional',
      p: '<b>"Não consigo entrar."</b> Primeira vez: e-mail do cadastro + 0000. Depois: a senha que ele criou.<br><b>"Posso confirmar e corrigir depois?"</b> Não. Primeiro corrige, ele confere de novo, e só então confirma.',
      e: '<b>"Confirmei com erro."</b> Pelo site não muda mais: fale com a Administração.<br><b>"Perdi o prazo de segunda."</b> Ainda dá até terça, 22h. Depois, a agenda segue como está.' }
  ]
  }
};
