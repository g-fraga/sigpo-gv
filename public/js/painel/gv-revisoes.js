// Guarda-vidas: pedir revisão de um registro e acompanhar as respostas.
P.iniciar(async () => {
  const { api, esc, selo, seloDe, nome } = P;
  const { relogio } = P.usuario;
  const escolhido = new URLSearchParams(location.search).get('registro') || '';

  P.app.innerHTML = `<div class="grade-painel">
      <section class="bloco"><h2>Novo pedido de revisão</h2>
        <form id="form" class="campos" novalidate>
          <label class="inteiro">Motivo<select name="motivo" id="motivo"><option value="">Escolha o motivo</option></select></label>
          <label class="inteiro" id="campo-registro">Registro<select name="registro_id" id="registro"><option value="">Carregando...</option></select></label>
          <label id="campo-data" hidden>Data<input type="date" name="data" max="${relogio.data}" min="${P.somaDias(relogio.data, -30)}" value="${relogio.data}"></label>
          <label id="campo-hora" hidden>Horário correto<input type="time" name="hora"></label>
          <label class="inteiro">Justificativa<textarea name="justificativa" required minlength="15" placeholder="Conte o que aconteceu e quem pode confirmar."></textarea><small>Pelo menos 15 caracteres.</small></label>
          <p class="janela-erro inteiro" id="erro" role="alert"></p>
          <div class="inteiro"><button class="botao" type="submit">Enviar pedido</button></div>
        </form>
      </section>
      <section class="bloco"><h2>Meus pedidos</h2><div id="pedidos">${P.estado('carregando', 'Carregando...')}</div></section>
    </div>`;

  const form = document.getElementById('form');
  const [rev, regs] = await Promise.all([api('/api/gv/revisoes'), api('/api/gv/registros' + P.qs({ de: P.somaDias(relogio.data, -30), ate: relogio.data }))]);
  document.getElementById('motivo').innerHTML += Object.entries(rev.motivos).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('');
  const validos = regs.registros.filter((r) => r.situacao === 'valido' && !r.em_revisao);
  document.getElementById('registro').innerHTML = `<option value="">Escolha o registro</option>` + validos.map((r) =>
    `<option value="${r.id}" ${String(r.id) === escolhido ? 'selected' : ''}>${P.data(r.data)} ${r.hora}: ${esc(nome('tipo', r.tipo))} em ${esc(r.praia)}, ${esc(r.posto)}</option>`).join('');

  // "Registro ausente" não tem registro para escolher: pede a data e o horário.
  function ajustarCampos() {
    const m = form.motivo.value;
    document.getElementById('campo-registro').hidden = m === 'ausente';
    document.getElementById('campo-data').hidden = m !== 'ausente';
    document.getElementById('campo-hora').hidden = !['ausente', 'horario'].includes(m);
  }
  form.motivo.addEventListener('change', ajustarCampos);

  function desenharPedidos(pedidos) {
    document.getElementById('pedidos').innerHTML = pedidos.length ? `<ol class="historico">${pedidos.map((p) => `<li>
      <strong>Pedido nº ${p.id}</strong> ${seloDe('revisao', p.situacao)}
      <small>${p.criado}: ${esc(p.motivo_texto)}${p.registro_tipo ? `, ${esc(nome('tipo', p.registro_tipo))} das ${p.registro_hora}` : ''} em ${p.data_referencia}${p.hora_informada ? `, horário informado ${p.hora_informada}` : ''}</small>
      <small>${esc(p.texto)}</small>
      ${p.resposta ? `<p class="aviso ${p.situacao === 'aceito' ? 'aviso-info' : 'aviso-perigo'}"><strong>Resposta (${p.respondido}):</strong> ${esc(p.resposta)}</p>` : ''}</li>`).join('')}</ol>`
      : P.estado('vazio', 'Você ainda não fez pedidos de revisão.');
  }
  desenharPedidos(rev.pedidos);

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const erro = document.getElementById('erro'); erro.textContent = '';
    const v = P.valores(form);
    if (!v.motivo) return (erro.textContent = 'Escolha o motivo.');
    if (v.motivo !== 'ausente' && !v.registro_id) return (erro.textContent = 'Escolha o registro.');
    if (['ausente', 'horario'].includes(v.motivo) && !v.hora) return (erro.textContent = 'Informe o horário correto.');
    if (v.justificativa.length < 15) return (erro.textContent = 'Justificativa: escreva pelo menos 15 caracteres.');
    const botao = form.querySelector('button[type=submit]'); botao.disabled = true;
    try {
      const r = await api('/api/gv/revisoes', { method: 'POST', body: v });
      P.mensagem('sucesso', r.mensagem);
      form.reset(); ajustarCampos();
      desenharPedidos((await api('/api/gv/revisoes')).pedidos);
    } catch (e) { erro.textContent = e.message; } finally { botao.disabled = false; }
  });
});
