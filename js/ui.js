function toggleMobileSidebar() {
  document.body.classList.toggle("sidebar-open");
}

function closeMobileSidebar() {
  document.body.classList.remove("sidebar-open");
}

function setVersion() {
  const av = document.getElementById("appVersionBadge");
  if (av && typeof APP_VERSION !== "undefined") {
    av.textContent = APP_VERSION;
  }
}
