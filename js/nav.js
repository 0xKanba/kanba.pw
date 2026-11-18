(function () {
  var write = document.getElementById("view-write");
  var scan = document.getElementById("view-scan");
  var tabW = document.getElementById("tab-write");
  var tabS = document.getElementById("tab-scan");

  function savedTheme() {
    var s = localStorage.getItem("theme");
    if (s === "light" || s === "dark") return s;
    return matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
  }
  function paintTheme(choice) {
    document.body.classList.toggle("theme-light", choice === "light");
    document.body.classList.toggle("theme-dark", choice === "dark");
  }
  paintTheme(savedTheme());
  matchMedia("(prefers-color-scheme: light)").addEventListener("change", function () {
    if (!localStorage.getItem("theme")) paintTheme(savedTheme());
  });
  document.getElementById("theme").onclick = function () {
    var next = document.body.classList.contains("theme-light") ? "dark" : "light";
    localStorage.setItem("theme", next);
    paintTheme(next);
  };

  function show(name) {
    var isScan = name === "scan";
    write.hidden = isScan;
    scan.hidden = !isScan;
    tabW.classList.toggle("on", !isScan);
    tabS.classList.toggle("on", isScan);
    document.title = isScan ? "Scan · QR" : "Write · QR";
    if (location.hash !== "#" + name) history.replaceState(null, "", "#" + name);
  }

  tabW.onclick = function () { show("write"); };
  tabS.onclick = function () { show("scan"); };
  window.addEventListener("hashchange", function () {
    show(location.hash === "#scan" ? "scan" : "write");
  });
  show(location.hash === "#scan" ? "scan" : "write");
})();
