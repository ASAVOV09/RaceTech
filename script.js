function setupPagesMenu() {
  const button = document.getElementById("pages-toggle");
  const menu = document.getElementById("pages-menu");
  if (!button || !menu) return;

  const closeMenu = () => {
    button.setAttribute("aria-expanded", "false");
    menu.hidden = true;
  };

  button.addEventListener("click", () => {
    const isOpen = button.getAttribute("aria-expanded") === "true";
    button.setAttribute("aria-expanded", String(!isOpen));
    menu.hidden = isOpen;
  });

  document.addEventListener("click", event => {
    if (!event.target.closest(".pages-dropdown")) closeMenu();
  });

  document.addEventListener("keydown", event => {
    if (event.key === "Escape") closeMenu();
  });
}

function openModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.style.display = "flex";
}

function closeModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.style.display = "none";
}

function toggleSetting(type) {
  if (type === "grid") {
    document.body.classList.toggle("grid-hidden", !document.getElementById("toggle-grid").checked);
  }
  if (type === "glow") {
    document.body.classList.toggle("glow-hidden", !document.getElementById("toggle-glow").checked);
  }
}

document.addEventListener("click", event => {
  if (event.target.classList.contains("modal-overlay")) event.target.style.display = "none";
});

document.addEventListener("keydown", event => {
  if (event.key === "Escape") {
    document.querySelectorAll(".modal-overlay").forEach(modal => { modal.style.display = "none"; });
  }
});

document.addEventListener("mousemove", event => {
  document.documentElement.style.setProperty("--pointer-x", `${event.clientX}px`);
  document.documentElement.style.setProperty("--pointer-y", `${event.clientY}px`);
});

window.addEventListener("DOMContentLoaded", () => {
  setupPagesMenu();
});
