// FurniCore app entry file.
// Основной код пока остаётся в index.html; сюда постепенно переносим модули.

const FURNICORE_BUILD_VERSION = "v5.93.1 - History Core";

function applyBuildVersion() {
  const badge = document.getElementById("appVersionBadge");
  if (badge) badge.textContent = FURNICORE_BUILD_VERSION;
}

applyBuildVersion();
console.log("app.js loaded", FURNICORE_BUILD_VERSION);
