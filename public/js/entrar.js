// Formulário de login.
(() => {
  const { api } = window.SIGPO;
  const form = document.getElementById('form-entrar');
  const erro = document.getElementById('erro');

  document.querySelectorAll('[data-email]').forEach((b) => b.addEventListener('click', () => {
    form.email.value = b.dataset.email;
    form.senha.value = 'demo1234';
    form.querySelector('button[type=submit]').focus();
  }));

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    erro.textContent = '';
    if (!form.email.value || !form.senha.value) { erro.textContent = 'Informe e-mail e senha.'; return; }
    const botao = form.querySelector('button[type=submit]');
    botao.disabled = true; botao.textContent = 'Entrando...';
    try {
      await api('/api/auth/entrar', { method: 'POST', body: { email: form.email.value, senha: form.senha.value } });
      location.href = '/painel';
    } catch (e) {
      erro.textContent = e.message;
      botao.disabled = false; botao.textContent = 'Entrar';
    }
  });
})();
