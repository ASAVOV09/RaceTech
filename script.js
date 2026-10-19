const MASTER_ADMIN = Object.freeze({
  username: "asavov09",
  password: "DolphinEater47Main!"
});
const PASSWORD_ITERATIONS = 210000;
const VALID_ROLES = ["User", "Team Member", "Moderator", "Admin"];
const DEFAULT_GALLERY = [
  { id: 1, src: "https://images.unsplash.com/photo-1594787318286-3d835c1d207f?auto=format&fit=crop&w=900&q=80", caption: "Weekend test run" },
  { id: 2, src: "https://images.unsplash.com/photo-1503736334956-4c8f8e92946d?auto=format&fit=crop&w=900&q=80", caption: "Chassis study" },
  { id: 3, src: "https://images.unsplash.com/photo-1486262715619-67b85e0b08d3?auto=format&fit=crop&w=900&q=80", caption: "Back in the workshop" }
];
const ROLE_DESCRIPTIONS = {
  Admin: "All site and crew management permissions.",
  Moderator: "Admin page viewing, gallery uploads, and text editing.",
  "Team Member": "Special crew badge and gallery photo uploads.",
  User: "View all public pages. No editing or upload permissions."
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

function normalizeUsername(username) {
  return typeof username === "string" ? username.trim().toLocaleLowerCase("en-US") : "";
}

function isMasterAdmin(username) {
  return normalizeUsername(username) === normalizeUsername(MASTER_ADMIN.username);
}

let usersDB = [];
let currentUser = null;
let siteContent = readStore("nexus_site_content", {});
let galleryDB = readStore("nexus_gallery_db", DEFAULT_GALLERY);
let editModeActive = false;
let currentAuthMode = "login";
let usersReady = false;

if (/secure, connected performance ecosystems|classified operations platform/i.test(siteContent["home-hero-desc"] || "")) {
  delete siteContent["home-hero-desc"];
}
if (/classified operations platform/i.test(siteContent["home-about-copy"] || "")) {
  delete siteContent["home-about-copy"];
}

function saveUsers() {
  localStorage.setItem("nexus_users_db", JSON.stringify(usersDB));
}

function bytesToHex(bytes) {
  return Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
}

async function createPasswordRecord(password) {
  if (!window.crypto || !window.crypto.subtle) {
    throw new Error("Secure password storage is unavailable in this browser. Open the site in a supported browser context.");
  }
  const salt = window.crypto.getRandomValues(new Uint8Array(16));
  const key = await window.crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await window.crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: PASSWORD_ITERATIONS, hash: "SHA-256" },
    key,
    256
  );
  return {
    passwordSalt: bytesToHex(salt),
    passwordHash: bytesToHex(new Uint8Array(bits)),
    passwordIterations: PASSWORD_ITERATIONS
  };
}

function hexToBytes(hex) {
  if (typeof hex !== "string" || !/^(?:[0-9a-f]{2})+$/i.test(hex)) return null;
  return new Uint8Array(hex.match(/.{2}/g).map(byte => Number.parseInt(byte, 16)));
}

async function verifyPassword(user, password) {
  if (user.passwordSalt && user.passwordHash && Number.isInteger(user.passwordIterations)) {
    const salt = hexToBytes(user.passwordSalt);
    const expected = hexToBytes(user.passwordHash);
    if (!salt || !expected || user.passwordIterations < 1 || user.passwordIterations > 1000000) return false;
    const key = await window.crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
    const bits = await window.crypto.subtle.deriveBits(
      { name: "PBKDF2", salt, iterations: user.passwordIterations, hash: "SHA-256" },
      key,
      expected.length * 8
    );
    const actual = new Uint8Array(bits);
    return actual.length === expected.length && actual.every((byte, index) => byte === expected[index]);
  }

  // Migrate accounts created by the previous version, which stored passwords directly.
  if (typeof user.pass === "string" && user.pass === password) {
    Object.assign(user, await createPasswordRecord(password));
    delete user.pass;
    saveUsers();
    return true;
  }
  return false;
}

async function initializeUsers() {
  const savedUsers = readStore("nexus_users_db", []);
  const seenUsernames = new Set();
  usersDB = [];

  if (Array.isArray(savedUsers)) {
    for (const savedUser of savedUsers) {
      if (!savedUser || typeof savedUser.username !== "string") continue;
      const username = savedUser.username.trim();
      const normalized = normalizeUsername(username);
      if (!normalized || seenUsernames.has(normalized)) continue;
      seenUsernames.add(normalized);
      usersDB.push({
        ...savedUser,
        username,
        role: normalized === "admin" || savedUser.role === "Visitor"
          ? "User"
          : VALID_ROLES.includes(savedUser.role) ? savedUser.role : "User"
      });
    }
  }

  let master = usersDB.find(user => isMasterAdmin(user.username));
  if (!master) {
    master = { username: MASTER_ADMIN.username, role: "Admin" };
    usersDB.push(master);
  }
  master.username = MASTER_ADMIN.username;
  master.role = "Admin";

  let masterPasswordIsCurrent = false;
  try {
    masterPasswordIsCurrent = await verifyPassword(master, MASTER_ADMIN.password);
  } catch (error) {
    console.error("Could not verify the saved master admin credential.", error);
  }
  if (!masterPasswordIsCurrent) {
    Object.assign(master, await createPasswordRecord(MASTER_ADMIN.password));
    delete master.pass;
  }

  for (const user of usersDB) {
    if (user === master) continue;
    if (typeof user.pass !== "string") {
      delete user.pass;
      continue;
    }
    Object.assign(user, await createPasswordRecord(user.pass));
    delete user.pass;
  }
  saveUsers();
}

function mergeStoredUsers() {
  const latestUsers = readStore("nexus_users_db", []);
  const merged = new Map();
  if (Array.isArray(latestUsers)) {
    for (const user of latestUsers) {
      if (!user || typeof user.username !== "string") continue;
      const key = normalizeUsername(user.username);
      if (key && !merged.has(key)) merged.set(key, user);
    }
  }
  for (const user of usersDB) {
    const key = normalizeUsername(user.username);
    if (key && !merged.has(key)) merged.set(key, user);
  }
  usersDB = Array.from(merged.values());
}

function switchAuthTab(mode) {
  currentAuthMode = mode;
  document.getElementById("tab-login").classList.toggle("active", mode === "login");
  document.getElementById("tab-register").classList.toggle("active", mode === "register");
  document.getElementById("auth-title").textContent = mode === "register" ? "Join the crew." : "Welcome back.";
  document.getElementById("auth-submit-text").textContent = mode === "register" ? "Create account" : "Log in";
  setAuthMessage(mode === "register" ? "Choose a unique call sign and password." : "Sign in to continue.", "var(--muted)");
}

function setAuthMessage(message, color) {
  const status = document.getElementById("auth-status-text");
  if (!status) return;
  status.textContent = message;
  status.style.color = color;
}

async function handleAuth(event) {
  event.preventDefault();
  if (!usersReady) {
    setAuthMessage("Account setup is still loading. Please try again in a moment.", "#ff9b82");
    return;
  }
  const username = document.getElementById("username").value.trim();
  const password = document.getElementById("password").value;
  const normalizedUsername = normalizeUsername(username);
  if (!normalizedUsername || username.length > 100) {
    setAuthMessage("Enter a valid call sign.", "#ff9b82");
    return;
  }
  if (password.length < 8) {
    setAuthMessage("Password must be at least 8 characters.", "#ff9b82");
    return;
  }

  try {
    if (currentAuthMode === "register") {
      if (!/^[\p{L}\p{N}_-]{3,24}$/u.test(username)) {
        setAuthMessage("Use 3–24 letters, numbers, underscores, or hyphens for your call sign.", "#ff9b82");
        return;
      }
      if (usersDB.some(user => normalizeUsername(user.username) === normalizedUsername)) {
        setAuthMessage("That call sign is already in use. Usernames are case-insensitive.", "#ff9b82");
        return;
      }
      const newUser = {
        username,
        role: "User",
        ...(await createPasswordRecord(password))
      };
      const register = () => {
        mergeStoredUsers();
        if (usersDB.some(user => normalizeUsername(user.username) === normalizedUsername)) return false;
        usersDB.push(newUser);
        saveUsers();
        return true;
      };
      const registered = navigator.locks
        ? await navigator.locks.request("racetech-user-registration", register)
        : register();
      if (!registered) {
        setAuthMessage("That call sign was just claimed. Usernames are case-insensitive.", "#ff9b82");
        return;
      }
      loginSession(newUser);
      return;
    }

    const user = usersDB.find(item => normalizeUsername(item.username) === normalizedUsername);
    if (!user || !(await verifyPassword(user, password))) {
      setAuthMessage("Call sign or password not recognized.", "#ff9b82");
      return;
    }
    loginSession(user);
  } catch (error) {
    console.error("Authentication could not be completed.", error);
    setAuthMessage("Secure sign-in is unavailable. Try a supported browser.", "#ff9b82");
  }
}

function loginSession(user) {
  currentUser = user;
  localStorage.setItem("nexus_session_user", JSON.stringify({ username: user.username }));
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

function canEditText() {
  return Boolean(currentUser && ["Admin", "Moderator"].includes(currentUser.role));
}

function canUploadGallery() {
  return Boolean(currentUser && ["Admin", "Moderator", "Team Member"].includes(currentUser.role));
}

function canViewAdmin() {
  return Boolean(currentUser && ["Admin", "Moderator"].includes(currentUser.role));
}

function syncUIWithRole() {
  if (currentUser) {
    const freshUser = usersDB.find(user => normalizeUsername(user.username) === normalizeUsername(currentUser.username));
    if (freshUser) {
      currentUser = freshUser;
      localStorage.setItem("nexus_session_user", JSON.stringify({ username: freshUser.username }));
    } else {
      currentUser = null;
      localStorage.removeItem("nexus_session_user");
    }
  }

  const loginButton = document.getElementById("user-display");
  if (loginButton) loginButton.textContent = currentUser ? currentUser.username : "Team login";
  const badgeContainer = document.getElementById("role-badge-container");
  if (badgeContainer) {
    badgeContainer.innerHTML = currentUser ? `<span class="role-pill ${currentUser.role === "Admin" ? "badge-admin" : currentUser.role === "Moderator" ? "badge-mod" : currentUser.role === "Team Member" ? "badge-team" : "badge-user"}">${escapeHTML(currentUser.role)}</span>` : "";
  }
  const adminLink = document.getElementById("nav-admin-link");
  if (adminLink) adminLink.hidden = !canViewAdmin();
  const toolbar = document.getElementById("cms-toolbar");
  if (toolbar) toolbar.hidden = !(canEditText() || (document.body.dataset.page === "gallery" && canUploadGallery()) || (document.body.dataset.page === "home" && currentUser?.role === "Admin"));
  const editButton = document.getElementById("toggle-edit-mode");
  if (editButton) editButton.hidden = !canEditText();
  const editState = document.getElementById("edit-state");
  if (editState) editState.hidden = !canEditText();
  const homeUpload = document.getElementById("home-upload-control");
  if (homeUpload) homeUpload.hidden = !currentUser || currentUser.role !== "Admin";
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
    role.textContent = "On the RaceTech crew";
    const roleBadge = document.createElement("span");
    roleBadge.className = `role-pill ${member.role === "Admin" ? "badge-admin" : member.role === "Moderator" ? "badge-mod" : "badge-team"} team-profile-badge`;
    roleBadge.textContent = member.role;
    role.append(" ", roleBadge);
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
    ? "<strong>Admin access:</strong> You can manage crew roles. The master admin role is protected."
    : "<strong>Moderator access:</strong> You can view the crew list. Only admins can change roles.";
  tableBody.replaceChildren(...usersDB.map(member => {
    const row = document.createElement("tr");
    const name = document.createElement("td");
    name.textContent = `${member.username}${isMasterAdmin(member.username) ? " (Master Admin)" : ""}`;
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
    select.disabled = currentUser.role !== "Admin" || isMasterAdmin(member.username);
    for (const role of VALID_ROLES) {
      const option = document.createElement("option");
      option.value = role;
      option.textContent = role;
      option.selected = member.role === role;
      select.append(option);
    }
    select.addEventListener("change", () => updateUserRole(member.username, select.value));
    controlCell.append(select);
    row.append(name, roleCell, access, controlCell);
    return row;
  }));
}

function updateUserRole(username, newRole) {
  if (!currentUser || currentUser.role !== "Admin") return;
  if (!VALID_ROLES.includes(newRole) || isMasterAdmin(username)) return;
  const target = usersDB.find(member => normalizeUsername(member.username) === normalizeUsername(username));
  if (!target) return;
  target.role = newRole;
  saveUsers();
  syncUIWithRole();
  renderAdminTable();
  allowProtectedPage();
}

function renderGallery() {
  const grid = document.getElementById("gallery-grid");
  if (!grid) return;
  const canDelete = Boolean(currentUser && currentUser.role === "Admin");
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
    if (canDelete) {
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
  if (!currentUser || currentUser.role !== "Admin") {
    alert("Only Admins can change the home feature photo.");
    event.target.value = "";
    return;
  }
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
  if (!canUploadGallery()) {
    alert("Gallery uploads are available to Admins, Mods, and Team Members.");
    event.target.value = "";
    return;
  }
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
  if (!currentUser || currentUser.role !== "Admin") return;
  galleryDB = galleryDB.filter(item => item.id !== id);
  localStorage.setItem("nexus_gallery_db", JSON.stringify(galleryDB));
  renderGallery();
}

function toggleEditMode() {
  if (!canEditText()) return;
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

function togglePasswordVisibility() {
  const password = document.getElementById("password");
  const toggle = document.getElementById("password-visibility-toggle");
  if (!password || !toggle) return;
  const showPassword = password.type === "password";
  password.type = showPassword ? "text" : "password";
  toggle.textContent = showPassword ? "Hide password" : "Show password";
  toggle.setAttribute("aria-pressed", String(showPassword));
}

function toggleSetting(type) {
  if (type === "grid") document.body.classList.toggle("grid-hidden", !document.getElementById("toggle-grid").checked);
  if (type === "glow") document.body.classList.toggle("glow-hidden", !document.getElementById("toggle-glow").checked);
}

function allowProtectedPage() {
  const page = document.body.dataset.page;
  if (page === "home") return;
  const main = document.querySelector("main");
  if ((page === "admin" && canViewAdmin()) || (page !== "admin" && currentUser)) {
    if (main) main.hidden = false;
    return;
  }
  if (main) main.hidden = true;
  if (currentUser) {
    window.location.replace("index.html");
    return;
  }
  openModal("auth-modal");
  setAuthMessage("Please sign in or create an account to continue.", "#ff9b82");
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

window.addEventListener("DOMContentLoaded", async () => {
  setupPagesMenu();
  loadSavedContent();
  try {
    await initializeUsers();
    usersReady = true;
    const savedSession = readStore("nexus_session_user", null);
    const savedUsername = typeof savedSession === "string" ? savedSession : savedSession?.username;
    currentUser = usersDB.find(user => normalizeUsername(user.username) === normalizeUsername(savedUsername)) || null;
    if (!currentUser) localStorage.removeItem("nexus_session_user");
    syncUIWithRole();
    allowProtectedPage();
  } catch (error) {
    console.error("Could not initialize account storage.", error);
    setAuthMessage("Secure account storage could not be initialized in this browser.", "#ff9b82");
    openModal("auth-modal");
  }
  const pageFiles = { home: "index.html", gallery: "gallery.html", team: "team.html", admin: "admin.html" };
  const currentLink = document.querySelector(`#pages-menu a[href="${pageFiles[document.body.dataset.page]}"]`);
  if (currentLink) currentLink.setAttribute("aria-current", "page");
});
