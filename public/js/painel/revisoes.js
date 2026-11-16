// Pedidos de revisão feitos pelos guarda-vidas: análise e resposta (administração e supervisão).
P.iniciar(async () => {
  const { api, esc, selo, seloDe, nome } = P;
  P.app.innerHTML = `
    <form class="barra-filtros" id="filtros">
      <label>Situação<select name="situacao"><option value="aberto">Aguardando análise</option><option value="aceito">Aceitos</option><option value="recusado">Recusados</option><option value="todos">Todos</option></select></label>
    </form>
    <div id="resultado">${P.estado('carregando', 'Carregando pedidos...')}</div>`;
  const filtros = P.filtros(document.getElementById('filtros'), () => carregar());
  let dados = null;

  function cartao(p) {
    return `<section class="bloco pedido">
      <div class="bloco-topo"><h2>Pedido nº ${p.id} <small>${p.criado}</small></h2>${seloDe('revisao', p.situacao)}</div>
      <dl class="detalhe-lista">
        <dt>Guarda-vidas</dt><dd><strong>${esc(p.gv_codigo)}</strong> ${esc(p.gv_nome)}</dd>
        <dt>Posto</dt><dd>${esc(p.praia)}, ${esc(p.posto)}</dd>
        <dt>Motivo</dt><dd>${esc(p.motivo_texto)}</dd>
        <dt>Registro</dt><dd>${p.registro_id ? `${esc(nome('tipo', p.registro_tipo))} às ${p.registro_hora} de ${P.data(p.data_referencia)} ${p.registro_situacao !== 'valido' ? selo(nome('situacaoRegistro', p.registro_situacao), 'neutro') : ''}` : `Nenhum (registro ausente em ${P.data(p.data_referencia)})`}</dd>
        ${p.hora_informada ? `<dt>Horário informado</dt><dd><strong>${p.hora_informada}</strong></dd>` : ''}
        <dt>Justificativa</dt><dd>${esc(p.texto)}</dd>
        ${p.resposta ? `<dt>Resposta</dt><dd>${esc(p.resposta)}<small> (${p.respondido}, ${esc((p.respondido_por || '').replace(' (fictício)', ''))})</small></dd>` : ''}
      </dl>
      ${p.situacao === 'aberto' ? `<button class="botao" data-responder="${p.id}">Analisar e responder</button>` : ''}
    </section>`;
  }

  function desenhar() {
    document.getElementById('resultado').innerHTML = dados.pedidos.length ? dados.pedidos.map(cartao).join('') : P.estado('vazio', 'Nenhum pedido nesta situação.');
  }

  P.app.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-responder]'); if (!b) return;
    const p = dados.pedidos.find((x) => String(x.id) === b.dataset.responder);
    P.dialogo({
      titulo: `Responder pedido nº ${p.id}`, botao: 'Enviar resposta',
      corpo: `<p><strong>${esc(p.gv_codigo)} ${esc(p.gv_nome)}</strong>: ${esc(p.motivo_texto)}. ${esc(p.texto)}</p>
        <div class="campos">
          <label class="marcar"><input type="radio" name="decisao" value="aceito" checked> Aceitar e corrigir o registro</label>
          <label class="marcar"><input type="radio" name="decisao" value="recusado"> Recusar</label>
          <label>Horário correto<input type="time" name="hora" value="${p.hora_informada || p.registro_hora || ''}"></label>
          <label>Tipo correto<select name="tipo"><option value="">${p.registro_tipo ? 'Manter ' + nome('tipo', p.registro_tipo) : 'Apresentação'}</option>${['apresentacao', 'intervalo', 'retorno', 'saida'].map((t) => `<option value="${t}">${nome('tipo', t)}</option>`).join('')}</select></label>
          <label class="inteiro">Resposta ao guarda-vidas<textarea name="resposta" required minlength="10" placeholder="Ex.: o chefe do posto confirmou a chegada às 07:52."></textarea></label>
        </div>
        <p class="aviso aviso-info">Ao aceitar, o sistema cria um registro de correção e mantém o original no histórico.</p>`,
      aoEnviar: async (v) => { const r = await api(`/api/painel/revisoes/${p.id}/resposta`, { method: 'POST', body: v }); await carregar(); return r.mensagem; },
    });
  });

  async function carregar() {
    try { dados = await api('/api/painel/revisoes' + P.qs(filtros())); desenhar(); }
    catch (e) { document.getElementById('resultado').innerHTML = P.estado('erro', e.message); }
  }
  await carregar();
});
