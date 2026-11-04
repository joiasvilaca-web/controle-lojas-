/* ──────────────────────────────────────────────────────────────────────────
   VILAÇA APP — de qual banco cada endereço fala.
   Carregado por TODAS as telas, antes de qualquer outro script.

   vilaca.app ............ banco REAL (as lojas)
   teste.vilaca.app ...... banco de TESTE (aprovar mudança antes de publicar)
   treino.vilaca.app ..... banco de TESTE (treinamento de funcionária nova)

   Enquanto o banco de teste não existir, TESTE fica em branco e todo mundo
   usa o real — nada muda. Para ligar, é só preencher url e chave do TESTE.
   ────────────────────────────────────────────────────────────────────────── */
(function () {
  var REAL = {
    url: "https://wxiokmqnjtgbejgoepch.supabase.co",
    key: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind4aW9rbXFuanRnYmVqZ29lcGNoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIyMTE2NDgsImV4cCI6MjA4Nzc4NzY0OH0.F38uxHayhbNHGQC9-W0R1IonfJ-VtbK2ZJfS8vZshTc"
  };
  var TESTE = { url: "", key: "" };   // preencher quando o projeto de teste existir

  var host = String(location.hostname || "").toLowerCase();
  var ehTeste = /^(teste|treino)\./.test(host) || /-teste\./.test(host);
  var usar = (ehTeste && TESTE.url) ? TESTE : REAL;

  window.SUPABASE_URL = usar.url;
  window.SUPABASE_ANON_KEY = usar.key;
  window.AMBIENTE = (usar === TESTE) ? (/^treino\./.test(host) ? "treino" : "teste") : "producao";

  /* Faixa de aviso: impossível confundir o treino com o sistema de verdade. */
  if (window.AMBIENTE !== "producao") {
    var pintar = function () {
      if (!document.body || document.getElementById("faixaAmbiente")) return;
      var treino = window.AMBIENTE === "treino";
      var f = document.createElement("div");
      f.id = "faixaAmbiente";
      f.textContent = treino ? "TREINAMENTO — nada aqui vale para as lojas" : "TESTE — nada aqui vale para as lojas";
      f.style.cssText = "position:fixed;left:0;right:0;bottom:0;z-index:2147483647;background:" +
        (treino ? "#0B6B3A" : "#8A4B00") + ";color:#fff;text-align:center;font:700 12px/1.9 system-ui,sans-serif;" +
        "letter-spacing:.06em;pointer-events:none;";
      document.body.appendChild(f);
      document.documentElement.style.setProperty("--faixa-ambiente", "23px");
    };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", pintar);
    else pintar();
  }
})();
