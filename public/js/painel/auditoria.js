// Administração: auditoria (quem fez o quê e quando) e recriação da demonstração.
P.iniciar(async () => {
  const { api, esc, tabela } = P;
  const op = await P.opcoes();
  P.app.innerHTML = `
    <form class="barra-filtros" id="filtros">
      <label>De<input type="date" name="de" value="${P.somaDias(op.hoje, -6)}" max="${op.hoje}"></label>
      <label>Até<input type="date" name="ate" value="${op.hoje}" max="${op.hoje}"></label>
      <label>Buscar<input type="search" name="busca" placeholder="Usuário, ação ou objeto"></label>
      <span class="empurra"></span>
      <button class="botao botao-secundario" type="button" id="recriar">Recriar demonstração</button>
    </form>
    <div id="resultado">${P.estado('carregando', 'Carregando...')}</div>`;
  const filtros = P.filtros(document.getElementById('filtros'), () => carregar());

  document.getElementById('recriar').addEventListener('click', () => P.dialogo({
    titulo: 'Recriar demonstração', botao: 'Recriar agora',
    corpo: `<p>Apaga tudo o que foi cadastrado ou registrado e volta ao estado inicial: relógio às 10:30, 6 dias de histórico e o cenário do dia.</p>
      <p class="aviso aviso-perigo">Use antes de uma apresentação. Todas as sessões são encerradas e é preciso entrar de novo.</p>`,
    aoEnviar: async () => { await api('/api/admin/demonstracao/recriar', { method: 'POST' }); location.href = '/entrar'; },
  }));

  async function carregar() {
    try {
      const d = await api('/api/admin/auditoria' + P.qs(filtros()));
      document.getElementById('resultado').innerHTML = `<section class="bloco"><h2>Ações registradas <small>${d.linhas.length}</small></h2>
        <p class="bloco-nota">Toda alteração relevante fica registrada com o usuário responsável. Este histórico não pode ser editado pelas telas.</p>${tabela([
        { titulo: 'Quando', html: (l) => l.quando },
        { titulo: 'Usuário', html: (l) => esc(l.usuario_nome.replace(' (fictício)', '')) },
        { titulo: 'Ação', html: (l) => `<strong>${esc(l.acao)}</strong>` },
        { titulo: 'Sobre', html: (l) => esc(l.objeto || '') },
        { titulo: 'Detalhe', html: (l) => `<small>${esc(l.detalhe || '')}</small>` },
      ], d.linhas, 'Nenhuma ação no período.')}</section>`;
    } catch (e) { document.getElementById('resultado').innerHTML = P.estado('erro', e.message); }
  }
  await carregar();
});
