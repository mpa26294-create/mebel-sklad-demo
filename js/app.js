// FurniCore app entry file.
// Основной код пока остаётся в index.html; сюда постепенно переносим модули.

const FURNICORE_BUILD_VERSION = "v6.33 - No Flash UI";

function applyBuildVersion() {
  const badge = document.getElementById("appVersionBadge");
  if (badge) badge.textContent = FURNICORE_BUILD_VERSION;
  document.querySelectorAll('.product-footer b,.version-badge').forEach(el=>{
    if(el.textContent!==FURNICORE_BUILD_VERSION)el.textContent=FURNICORE_BUILD_VERSION;
  });
}

function loadRollMaterialUxImmediately() {
  if (document.querySelector('script[data-module="roll-material-v633"]')) return;
  const script = document.createElement('script');
  script.src = 'js/eco-leather-wizard.js?v=6.33';
  script.dataset.module = 'roll-material-v633';
  script.async = false;
  document.head.appendChild(script);
}

applyBuildVersion();
loadRollMaterialUxImmediately();

document.addEventListener('DOMContentLoaded', applyBuildVersion);
window.addEventListener('load', applyBuildVersion);

// Старые модули могут кратко записать своё значение версии. Возвращаем актуальное
// значение сразу, без заметного мигания в интерфейсе.
try {
  new MutationObserver(applyBuildVersion).observe(document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true
  });
} catch (e) {}

console.log("app.js loaded", FURNICORE_BUILD_VERSION);
