// Área restrita (provisória): mostra quem está logado e o que vem a seguir para cada perfil.
(() => {
  const { api, esc } = window.SIGPO;
  const PERFIS = {
    admin: ['Administração', ['Cadastro de postos, guarda-vidas e pulseiras', 'Escalas do dia com versões', 'Relatórios e auditoria']],
    supervisor: ['Supervisão', ['Painel em tempo real da região', 'Terminal simulado de pulseiras', 'Alertas, registros manuais, correções e movimentações']],
    guarda_vidas: ['Guarda-vidas', ['Minha escala de hoje', 'Meus registros', 'Pedido de revisão de registro']],
  };

  api('/api/auth/eu').then((u) => {
    const [nome, itens] = PERFIS[u.perfil];
    document.getElementById('ola').textContent = 'Olá, ' + u.nome.replace(' (fictício)', '');
    document.getElementById('perfil').textContent = `Perfil: ${nome}${u.regiao ? ', região ' + u.regiao : ''}.`;
    document.getElementById('proximas').innerHTML = itens.map((i) => `<li>${esc(i)}</li>`).join('');
    if (u.perfil === 'admin') document.getElementById('atalhos').innerHTML = '<a class="botao" href="/painel/posicoes">Conferir a posição dos postos no mapa</a>';
  }).catch(() => { location.href = '/entrar'; });

  document.getElementById('sair').addEventListener('click', async () => {
    await api('/api/auth/sair', { method: 'POST' });
    location.href = '/';
  });
})();
