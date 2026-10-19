const DEFAULT_GALLERY = [
  { id: 1, src: "https://images.unsplash.com/photo-1594787318286-3d835c1d207f?auto=format&fit=crop&w=900&q=80", caption: "Weekend test run" },
  { id: 2, src: "https://images.unsplash.com/photo-1503736334956-4c8f8e92946d?auto=format&fit=crop&w=900&q=80", caption: "Chassis study" },
  { id: 3, src: "https://images.unsplash.com/photo-1486262715619-67b85e0b08d3?auto=format&fit=crop&w=900&q=80", caption: "Back in the workshop" }
];
const ROLE_DESCRIPTIONS = {
  Admin: "Full crew and role management.",
  Moderator: "Team tools, editing, and photo uploads.",
  "Team Member": "Crew profile and full site access.",
  Visitor: "Standard site access."
};

function readStore(key, fallback) {
  const saved = localStorage.getItem(key);
  if (!saved) return fallback;
  try {
    return JSON.parse(saved);
  } catch (error) {
    console.error(`Could not read saved site data for "${key}".`, error);
    return fallback;
  }
}

let usersDB = readStore("nexus_users_db", []).filter(user => user.username !== "Admin");
let currentUser = readStore("nexus_session_user", null);
let siteContent = readStore("nexus_site_content", {});
let galleryDB = readStore("nexus_gallery_db", DEFAULT_GALLERY);
let editModeActive = false;
let currentAuthMode = "login";

if (/secure, connected performance ecosystems|classified operations platform/i.test(siteContent["home-hero-desc"] || "")) {
  delete siteContent["home-hero-desc"];
}
if (/classified operations platform/i.test(siteContent["home-about-copy"] || "")) {
  delete siteContent["home-about-copy"];
}

function saveUsers() {
  localStorage.setItem("nexus_users_db", JSON.stringify(usersDB));
}

function switchAuthTab(mode) {
  currentAuthMode = mode;
  document.getElementById("tab-login").classList.toggle("active", mode === "login");
  document.getElementById("tab-register").classList.toggle("active", mode === "register");
  document.getElementById("auth-title").textContent = mode === "register" ? "Join the crew." : "Welcome back.";
  document.getElementById("auth-submit-text").textContent = mode === "register" ? "Create account" : "Log in";
  const hasAdmin = usersDB.some(user => user.role === "Admin");
  setAuthMessage(mode === "register" ? (hasAdmin ? "Choose a call sign and password." : "The first account on this browser gets admin tools.") : "Sign in to continue.", "var(--muted)");
}

function setAuthMessage(message, color) {
  const status = document.getElementById("auth-status-text");
  if (!status) return;
  status.textContent = message;
  status.style.color = color;
}

function handleAuth(event) {
  event.preventDefault();
  const username = document.getElementById("username").value.trim();
  const password = document.getElementById("password").value;
  if (!username) {
    setAuthMessage("Please enter a call sign.", "#ff9b82");
    return;
  }
  if (password.length < 8) {
    setAuthMessage("Password must be at least 8 characters.", "#ff9b82");
    return;
  }

  if (currentAuthMode === "register") {
    if (usersDB.some(user => user.username.toLowerCase() === username.toLowerCase())) {
      setAuthMessage("That call sign is already in use.", "#ff9b82");
      return;
    }
    const newUser = { username, pass: password, role: usersDB.some(user => user.role === "Admin") ? "Visitor" : "Admin" };
    usersDB.push(newUser);
    saveUsers();
    loginSession(newUser);
    return;
  }

  const user = usersDB.find(item => item.username.toLowerCase() === username.toLowerCase() && item.pass === password);
  if (!user) {
    setAuthMessage("Call sign or password not recognized.", "#ff9b82");
    return;
  }
  loginSession(user);
}

function loginSession(user) {
  currentUser = user;
  localStorage.setItem("nexus_session_user", JSON.stringify(user));
  document.getElementById("auth-form").reset();
  closeModal("auth-modal");
  syncUIWithRole();
  allowProtectedPage();
}

function logoutUser() {
  currentUser = null;
  localStorage.removeItem("nexus_session_user");
  editModeActive = false;
  closeModal("settings-modal");
  syncUIWithRole();
  if (document.body.dataset.page !== "home") {
    window.location.href = "index.html";
  }
}

function isStaff() {
  return currentUser && (currentUser.role === "Admin" || currentUser.role === "Moderator");
}

function syncUIWithRole() {
  if (currentUser) {
    const freshUser = usersDB.find(user => user.username.toLowerCase() === currentUser.username.toLowerCase());
    if (freshUser) {
      currentUser = freshUser;
      localStorage.setItem("nexus_session_user", JSON.stringify(currentUser));
    }
  }

  const loginButton = document.getElementById("user-display");
  if (loginButton) loginButton.textContent = currentUser ? currentUser.username : "Team login";
  const badgeContainer = document.getElementById("role-badge-container");
  if (badgeContainer) {
    badgeContainer.innerHTML = currentUser ? `<span class="role-pill ${currentUser.role === "Admin" ? "badge-admin" : currentUser.role === "Moderator" ? "badge-mod" : "badge-team"}">${escapeHTML(currentUser.role)}</span>` : "";
  }
  const adminLink = document.getElementById("nav-admin-link");
  if (adminLink) adminLink.hidden = !(currentUser && (currentUser.role === "Admin" || currentUser.role === "Moderator"));
  const toolbar = document.getElementById("cms-toolbar");
  if (toolbar) toolbar.hidden = !isStaff();
  const logoutButton = document.getElementById("logout-button");
  if (logoutButton) logoutButton.hidden = !currentUser;

  renderTeamRoster();
  renderGallery();
  if (document.body.dataset.page === "admin") renderAdminTable();
}

function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

function renderTeamRoster() {
  const grid = document.getElementById("team-roster-grid");
  if (!grid) return;
  const crew = usersDB.filter(user => ["Admin", "Moderator", "Team Member"].includes(user.role));
  if (!crew.length) {
    grid.innerHTML = '<div class="empty-state">Crew profiles will show up here as the team grows.</div>';
    return;
  }
  grid.replaceChildren(...crew.map((member, index) => {
    const card = document.createElement("article");
    card.className = "team-card";
    const icon = document.createElement("div");
    icon.className = "team-card-icon";
    icon.textContent = String(index + 1).padStart(2, "0");
    const name = document.createElement("h3");
    name.textContent = member.username;
    const role = document.createElement("p");
    role.textContent = `${member.role} · On the RaceTech crew`;
    card.append(icon, name, role);
    return card;
  }));
}

function renderAdminTable() {
  const tableBody = document.getElementById("admin-user-table");
  const notice = document.getElementById("admin-mode-notice");
  if (!tableBody || !notice) return;
  if (!currentUser || !["Admin", "Moderator"].includes(currentUser.role)) {
    notice.textContent = "Crew access is required to view this page.";
    tableBody.replaceChildren();
    return;
  }
  notice.innerHTML = currentUser.role === "Admin"
    ? "<strong>Admin access:</strong> You can manage crew roles."
    : "<strong>Moderator access:</strong> You can view the crew list. Only admins can change roles.";
  tableBody.replaceChildren(...usersDB.map(member => {
    const row = document.createElement("tr");
    const name = document.createElement("td");
    name.textContent = member.username;
    const roleCell = document.createElement("td");
    const badge = document.createElement("span");
    badge.className = `role-pill ${member.role === "Admin" ? "badge-admin" : member.role === "Moderator" ? "badge-mod" : "badge-team"}`;
    badge.textContent = member.role;
    roleCell.append(badge);
    const access = document.createElement("td");
    access.textContent = ROLE_DESCRIPTIONS[member.role] || "";
    const controlCell = document.createElement("td");
    const select = document.createElement("select");
    select.className = "role-select";
    select.setAttribute("aria-label", `Change role for ${member.username}`);
    select.disabled = currentUser.role !== "Admin" || member.username.toLowerCase() === "asavov09";
    ["Visitor", "Team Member", "Moderator", "Admin"].forEach(role => {
      const option = document.createElement("option");
      option.value = role;
      option.textContent = role;
      option.selected = member.role === role;
      select.append(option);
    });
    select.addEventListener("change", () => updateUserRole(member.username, select.value));
    controlCell.append(select);
    row.append(name, roleCell, access, controlCell);
    return row;
  }));
}

function updateUserRole(username, newRole) {
  if (!currentUser || currentUser.role !== "Admin") return;
  if (!["Visitor", "Team Member", "Moderator", "Admin"].includes(newRole)) return;
  if (username.toLowerCase() === "asavov09") return;
  const user = usersDB.find(member => member.username === username);
  if (!user) return;
  user.role = newRole;
  saveUsers();
  syncUIWithRole();
  renderAdminTable();
}

function renderGallery() {
  const grid = document.getElementById("gallery-grid");
  if (!grid) return;
  const staff = isStaff();
  grid.replaceChildren(...galleryDB.map(item => {
    const card = document.createElement("article");
    card.className = "gallery-card";
    const image = document.createElement("img");
    image.className = "gallery-img";
    image.src = item.src;
    image.alt = item.caption;
    image.loading = "lazy";
    const footer = document.createElement("div");
    footer.className = "gallery-caption";
    const caption = document.createElement("div");
    const marker = document.createElement("p");
    marker.className = "eyebrow";
    marker.textContent = "RACETECH / BUILD LOG";
    const title = document.createElement("div");
    title.textContent = item.caption;
    caption.append(marker, title);
    footer.append(caption);
    if (staff) {
      const remove = document.createElement("button");
      remove.className = "tech-btn delete-photo";
      remove.type = "button";
      remove.textContent = "Remove";
      remove.setAttribute("aria-label", `Remove ${item.caption}`);
      remove.addEventListener("click", () => deleteGalleryImage(item.id));
      footer.append(remove);
    }
    card.append(image, footer);
    return card;
  }));
  if (!galleryDB.length) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "No garage photos yet. Check back after the next test run.";
    grid.append(empty);
  }
}

function processImage(file, onComplete) {
  const reader = new FileReader();
  reader.onerror = () => {
    console.error("The selected image could not be read.", reader.error);
    alert("We couldn't read that image. Try another file.");
  };
  reader.onload = () => {
    const image = new Image();
    image.onerror = () => alert("That file doesn't appear to be a valid image.");
    image.onload = () => {
      const maxWidth = 1200;
      const scale = Math.min(1, maxWidth / image.width);
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(image.width * scale);
      canvas.height = Math.round(image.height * scale);
      const context = canvas.getContext("2d");
      if (!context) {
        alert("Your browser couldn't prepare that image.");
        return;
      }
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      onComplete(canvas.toDataURL("image/jpeg", 0.84));
    };
    image.src = reader.result;
  };
  reader.readAsDataURL(file);
}

function uploadHomeImage(event) {
  const file = event.target.files[0];
  if (!file) return;
  processImage(file, source => {
    const featured = document.getElementById("home-featured-img");
    if (featured) featured.src = source;
    siteContent["home-featured-img"] = source;
    localStorage.setItem("nexus_site_content", JSON.stringify(siteContent));
  });
  event.target.value = "";
}

function uploadGalleryImage(event) {
  const file = event.target.files[0];
  if (!file) return;
  const caption = prompt("Name this build or moment:", "Workshop snapshot");
  if (caption === null) {
    event.target.value = "";
    return;
  }
  processImage(file, source => {
    galleryDB.unshift({ id: Date.now(), src: source, caption: caption.trim() || "Workshop snapshot" });
    localStorage.setItem("nexus_gallery_db", JSON.stringify(galleryDB));
    renderGallery();
  });
  event.target.value = "";
}

function deleteGalleryImage(id) {
  galleryDB = galleryDB.filter(item => item.id !== id);
  localStorage.setItem("nexus_gallery_db", JSON.stringify(galleryDB));
  renderGallery();
}

function toggleEditMode() {
  if (!isStaff()) return;
  editModeActive = !editModeActive;
  const state = document.getElementById("edit-state");
  if (state) state.textContent = editModeActive ? "Edit mode is on — click text to change" : "Edit mode is off";
  document.querySelectorAll(".editable").forEach(element => {
    element.contentEditable = String(editModeActive);
    if (!editModeActive) {
      const key = element.dataset.key;
      if (key) siteContent[key] = element.innerHTML;
    }
  });
  if (!editModeActive) localStorage.setItem("nexus_site_content", JSON.stringify(siteContent));
}

function loadSavedContent() {
  const featured = document.getElementById("home-featured-img");
  if (featured && siteContent["home-featured-img"]) featured.src = siteContent["home-featured-img"];
  document.querySelectorAll(".editable").forEach(element => {
    const key = element.dataset.key;
    if (key && siteContent[key]) element.innerHTML = siteContent[key];
    element.addEventListener("blur", () => {
      if (!key) return;
      siteContent[key] = element.innerHTML;
      localStorage.setItem("nexus_site_content", JSON.stringify(siteContent));
    });
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
  if (type === "grid") document.body.classList.toggle("grid-hidden", !document.getElementById("toggle-grid").checked);
  if (type === "glow") document.body.classList.toggle("glow-hidden", !document.getElementById("toggle-glow").checked);
}

function allowProtectedPage() {
  const page = document.body.dataset.page;
  if (page === "home") return;
  const main = document.querySelector("main");
  if (currentUser && (page !== "admin" || ["Admin", "Moderator"].includes(currentUser.role))) {
    if (main) main.hidden = false;
    return;
  }
  if (main) main.hidden = true;
  openModal("auth-modal");
  setAuthMessage(page === "admin" && currentUser ? "Admin or moderator access is required." : "Please sign in or create an account to continue.", "#ff9b82");
}

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

document.addEventListener("click", event => {
  if (event.target.classList.contains("modal-overlay")) event.target.style.display = "none";
});
document.addEventListener("keydown", event => {
  if (event.key === "Escape") document.querySelectorAll(".modal-overlay").forEach(modal => { modal.style.display = "none"; });
});
document.addEventListener("mousemove", event => {
  document.documentElement.style.setProperty("--pointer-x", `${event.clientX}px`);
  document.documentElement.style.setProperty("--pointer-y", `${event.clientY}px`);
});

window.addEventListener("DOMContentLoaded", () => {
  setupPagesMenu();
  loadSavedContent();
  syncUIWithRole();
  allowProtectedPage();
  const currentLink = document.querySelector(`#pages-menu a[href="${document.body.dataset.page === "home" ? "index.html" : `${document.body.dataset.page === "gallery" ? "gallery.html" : `${document.body.dataset.page === "team" ? "team.html" : "admin.html"}`}`}"]`);
  if (currentLink) currentLink.setAttribute("aria-current", "page");
});
