# Cortex

Sistema do Centro Médico Judithe Ferreira (antes chamado "painel") — https://cortex.levsoul.com.br

- Nome visível: Cortex. Nomes internos do código e do banco (`painel.css`, classe `.painel`, `prof_secretaria_painel` etc.) ficam como estão de propósito.
- Em construção: o design novo é aplicado aqui, tela por tela.
- O painel antigo (`centromedicojuditheferreira/Sistema`, painel.html) foi tirado do ar em 23/10/2026: o endereço antigo dá 404 de propósito. Links novos (notinha, conferência, convite) saem daqui.
- Banco: Supabase (a lojinha e o login saíram do Firebase na LOJA v1.0; o Firebase fica só como cópia de segurança).
- Lojinha e login (LOJA v1.0): tabelas `loja_*` fechadas ao painel; tudo passa pelas funções `loja_*` do Supabase (`js/loja_api.js`), que conferem a sessão e fazem as contas no servidor (preço, taxa do cartão, saldo da notinha, estoque). PIN com bcrypt, 5 erros travam por 15 minutos, sessão cai após 12 h sem uso; PIN definido pelo administrador é provisório (troca no primeiro acesso, `js/loja_login.js`). Nada é apagado: lançamento errado fica marcado com quem marcou e quando.
- Migração do Firebase: enquanto não for concluída, a entrada mostra a tela de migração (senha de administração → lê o Firebase → grava no Supabase → PIN provisório de cada pessoa). Concluída, não aparece mais.
- Financeiro → Extrato (`js/financeiro.js`): por enquanto só o administrador. Lê o Feegow e a conveniência pela função `fin_cortex_extrato` (FIN v1.4), que confere a senha de administração no servidor; as tabelas `fin_*` e `loja_*` continuam fechadas ao painel.
