/* 22/11: via (Venda, Pedido, Orçamento) pode ser feita com o cliente só com o NOME; ao salvar, avisa o que falta no cadastro.
 * CadastroIncompleto.faltando(c) → ['celular', 'CPF', ...]   CadastroIncompleto.avisar(c, 'Venda lançada.') → toast depois do "salvo". */
(function(){
  function dig(s){ return String(s == null ? '' : s).replace(/\D/g, ''); }
  function faltando(c){
    c = c || {}; var f = [];
    var tel = dig(c.telefone); if(tel.length === 13 && tel.slice(0, 2) === '55') tel = tel.slice(2);
    if(!(tel.length === 11 && tel.charAt(2) === '9')) f.push('celular com DDD');
    var doc = dig(c.tipoPessoa === 'PJ' ? (c.cnpj || c.cpf) : c.cpf);
    if(!(doc.length === 11 || doc.length === 14)) f.push(c.tipoPessoa === 'PJ' ? 'CNPJ' : 'CPF');
    if(!c.dataNascimento && c.tipoPessoa !== 'PJ') f.push('data de nascimento');
    if(!(String(c.endereco || '').trim() && String(c.numero || '').trim() && String(c.bairro || '').trim() && String(c.cidade || '').trim())) f.push('endereço');
    return f;
  }
  function avisar(c, prefixo){
    var f = faltando(c); if(!f.length || typeof showToast !== 'function') return f;
    var nome = String((c && (c.nome || c.cliente)) || 'do cliente').trim();
    var msg = (prefixo ? prefixo + ' ' : '') + 'Atenção: o cadastro de ' + nome + ' está INCOMPLETO (falta: ' + f.join(', ') + '). Complete quando puder (Configurações › Cadastro › Clientes).';
    setTimeout(function(){ try{ showToast(msg, 9000); }catch(e){} }, 1800);
    return f;
  }
  window.CadastroIncompleto = { faltando: faltando, avisar: avisar };
})();
