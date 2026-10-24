# Cortex

Sistema do Centro Médico Judithe Ferreira (antes chamado "painel") — https://cortex.levsoul.com.br

- Nome visível: Cortex. Nomes internos do código e do banco (`painel.css`, classe `.painel`, `prof_secretaria_painel` etc.) ficam como estão de propósito.
- Em construção: o design novo é aplicado aqui, tela por tela.
- O painel antigo (`centromedicojuditheferreira/Sistema`, painel.html) foi tirado do ar em 23/10/2026: o endereço antigo dá 404 de propósito. Links novos (notinha, conferência, convite) saem daqui.
- Bancos: Firebase da lojinha e Supabase.
- Financeiro → Extrato (`js/financeiro.js`): por enquanto só o administrador. Lê o Feegow pela função `fin_cortex_extrato` (FIN v1.3), que confere a senha de administração no servidor; as tabelas `fin_*` continuam fechadas ao painel. A conveniência é lida do Firebase até a lojinha ir para o Supabase.
