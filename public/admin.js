const loginCard = document.querySelector("#loginCard");
const dashboard = document.querySelector("#dashboard");
const loginForm = document.querySelector("#loginForm");
const adminForm = document.querySelector("#adminForm");
const userForm = document.querySelector("#userForm");
const logoutButton = document.querySelector("#logoutButton");
const adminCard = document.querySelector("#adminCard");
const adminRows = document.querySelector("#adminRows");
const userRows = document.querySelector("#userRows");
const adminInfo = document.querySelector("#adminInfo");

let currentAdmin = null;

async function api(path, options = {}) {
  const response = await fetch(`/api${path}`, {
    credentials: "include",
    headers: { "content-type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "操作失敗");
  return data;
}

function setMessage(id, text) {
  document.querySelector(id).textContent = text || "";
}

function formatDate(value) {
  if (!value) return "永久";
  return new Date(value).toLocaleString("zh-TW", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

async function loadMe() {
  try {
    const data = await api("/admin/me");
    currentAdmin = data.admin;
    loginCard.classList.add("hidden");
    dashboard.classList.remove("hidden");
    adminInfo.textContent = `${currentAdmin.username}｜${currentAdmin.role === "superadmin" ? "SUPERADMIN" : "管理員"}`;
    adminCard.classList.toggle("hidden", currentAdmin.role !== "superadmin");
    await Promise.all([loadUsers(), loadAdmins()]);
  } catch {
    loginCard.classList.remove("hidden");
    dashboard.classList.add("hidden");
  }
}

async function loadAdmins() {
  if (!currentAdmin || currentAdmin.role !== "superadmin") return;
  const data = await api("/admin/admins");
  adminRows.innerHTML = data.admins.map((admin) => `
    <tr>
      <td>${admin.username}</td>
      <td>${admin.role === "superadmin" ? "SUPERADMIN" : "管理員"}</td>
      <td><span class="status ${admin.enabled ? "on" : "off"}">${admin.enabled ? "啟用" : "停用"}</span></td>
    </tr>
  `).join("");
}

async function loadUsers() {
  const data = await api("/admin/users");
  userRows.innerHTML = data.users.map((user) => `
    <tr>
      <td>
        <strong>${user.name}</strong>
        <div class="muted">${user.id}</div>
      </td>
      <td><span class="status ${user.enabled ? "on" : "off"}">${user.enabled ? "啟用" : "停用"}</span></td>
      <td>
        ${formatDate(user.expiresAt)}
        <div class="muted">${user.days || 0} 天</div>
      </td>
      <td>
        <input value="${user.shortcutUrl}" readonly />
      </td>
      <td>
        <div class="actions">
          <button data-copy="${user.shortcutUrl}" type="button">複製連結</button>
          <button data-toggle="${user.id}" data-enabled="${!user.enabled}" type="button" class="${user.enabled ? "danger" : ""}">${user.enabled ? "停用" : "啟用"}</button>
          <button data-days="${user.id}" type="button" class="secondary">改天數</button>
          <button data-reset="${user.id}" type="button" class="secondary">重產連結</button>
        </div>
      </td>
    </tr>
  `).join("");
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(loginForm);
  try {
    await api("/admin/login", {
      method: "POST",
      body: JSON.stringify({
        username: form.get("username"),
        password: form.get("password"),
      }),
    });
    setMessage("#loginMessage", "");
    await loadMe();
  } catch (error) {
    setMessage("#loginMessage", error.message);
  }
});

logoutButton.addEventListener("click", async () => {
  await api("/admin/logout", { method: "POST", body: "{}" });
  currentAdmin = null;
  loginCard.classList.remove("hidden");
  dashboard.classList.add("hidden");
});

adminForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(adminForm);
  try {
    await api("/admin/admins", {
      method: "POST",
      body: JSON.stringify({
        username: form.get("username"),
        password: form.get("password"),
      }),
    });
    adminForm.reset();
    setMessage("#adminMessage", "管理員已新增。");
    await loadAdmins();
  } catch (error) {
    setMessage("#adminMessage", error.message);
  }
});

userForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(userForm);
  try {
    const data = await api("/admin/users", {
      method: "POST",
      body: JSON.stringify({
        name: form.get("name"),
        days: form.get("days"),
      }),
    });
    userForm.reset();
    userForm.days.value = 7;
    setMessage("#userMessage", `使用者已新增，專屬連結：${data.user.shortcutUrl}`);
    await loadUsers();
  } catch (error) {
    setMessage("#userMessage", error.message);
  }
});

userRows.addEventListener("click", async (event) => {
  const target = event.target.closest("button");
  if (!target) return;

  if (target.dataset.copy) {
    await navigator.clipboard.writeText(target.dataset.copy);
    target.textContent = "已複製";
    return;
  }

  if (target.dataset.toggle) {
    await api(`/admin/users/${target.dataset.toggle}`, {
      method: "PATCH",
      body: JSON.stringify({ enabled: target.dataset.enabled === "true" }),
    });
    await loadUsers();
    return;
  }

  if (target.dataset.days) {
    const days = prompt("請輸入新的可使用天數", "7");
    if (!days) return;
    await api(`/admin/users/${target.dataset.days}`, {
      method: "PATCH",
      body: JSON.stringify({ days: Number(days) }),
    });
    await loadUsers();
    return;
  }

  if (target.dataset.reset) {
    if (!confirm("確定要重產專屬連結？舊連結會失效。")) return;
    await api(`/admin/users/${target.dataset.reset}`, {
      method: "PATCH",
      body: JSON.stringify({ resetToken: true }),
    });
    await loadUsers();
  }
});

loadMe();
