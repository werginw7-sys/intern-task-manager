const stages = ["Todo", "In Progress", "Done"];
const API_BASE_URL = (window.APP_CONFIG?.API_BASE_URL || localStorage.getItem("task-manager-api-url") || "").replace(/\/$/, "");
const state = {
  token: localStorage.getItem("task-manager-token") || "",
  user: null,
  tasks: [],
  mode: "login"
};

const authPanel = document.querySelector("#authPanel");
const appPanel = document.querySelector("#appPanel");
const authForm = document.querySelector("#authForm");
const authMessage = document.querySelector("#authMessage");
const loginTab = document.querySelector("#loginTab");
const registerTab = document.querySelector("#registerTab");
const nameField = document.querySelector("#nameField");
const nameInput = document.querySelector("#nameInput");
const emailInput = document.querySelector("#emailInput");
const passwordInput = document.querySelector("#passwordInput");
const authSubmit = document.querySelector("#authSubmit");
const userBadge = document.querySelector("#userBadge");
const logoutButton = document.querySelector("#logoutButton");
const taskForm = document.querySelector("#taskForm");
const taskId = document.querySelector("#taskId");
const taskTitle = document.querySelector("#taskTitle");
const taskDescription = document.querySelector("#taskDescription");
const taskStage = document.querySelector("#taskStage");
const taskSubmit = document.querySelector("#taskSubmit");
const taskMessage = document.querySelector("#taskMessage");
const cancelEdit = document.querySelector("#cancelEdit");
const refreshButton = document.querySelector("#refreshButton");
const statusLine = document.querySelector("#statusLine");
const board = document.querySelector("#board");
const columnTemplate = document.querySelector("#columnTemplate");
const taskTemplate = document.querySelector("#taskTemplate");

async function api(path, options = {}) {
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {})
  };

  if (state.token) headers.Authorization = `Bearer ${state.token}`;

  const response = await fetch(`${API_BASE_URL}${path}`, { ...options, headers });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload.error || "Request failed. Please try again.");
  }

  return payload;
}

function setAuthMode(mode) {
  state.mode = mode;
  const isRegister = mode === "register";
  registerTab.classList.toggle("active", isRegister);
  loginTab.classList.toggle("active", !isRegister);
  nameField.classList.toggle("hidden", !isRegister);
  nameInput.required = isRegister;
  authSubmit.textContent = isRegister ? "Create account" : "Login";
  authMessage.textContent = "";
}

function showApp() {
  authPanel.classList.add("hidden");
  appPanel.classList.remove("hidden");
  userBadge.textContent = state.user ? `${state.user.name} (${state.user.email})` : "";
}

function showAuth() {
  appPanel.classList.add("hidden");
  authPanel.classList.remove("hidden");
}

function setBusy(button, busy, label) {
  button.disabled = busy;
  button.textContent = busy ? "Please wait..." : label;
}

function resetTaskForm() {
  taskId.value = "";
  taskTitle.value = "";
  taskDescription.value = "";
  taskStage.value = "Todo";
  taskSubmit.textContent = "Create task";
  cancelEdit.classList.add("hidden");
  taskMessage.textContent = "";
}

function renderBoard() {
  board.innerHTML = "";
  statusLine.textContent = state.tasks.length ? `${state.tasks.length} task${state.tasks.length === 1 ? "" : "s"} found` : "No tasks yet";

  stages.forEach((stage) => {
    const column = columnTemplate.content.firstElementChild.cloneNode(true);
    const tasks = state.tasks.filter((task) => task.stage === stage);
    column.querySelector("h3").textContent = stage;
    column.querySelector(".count").textContent = tasks.length;

    const list = column.querySelector(".task-list");
    if (!tasks.length) {
      const empty = document.createElement("div");
      empty.className = "empty";
      empty.textContent = "Nothing here";
      list.append(empty);
    }

    tasks.forEach((task) => {
      const card = taskTemplate.content.firstElementChild.cloneNode(true);
      card.dataset.stage = task.stage;
      card.querySelector("h4").textContent = task.title;
      card.querySelector("p").textContent = task.description || "No description added.";
      card.querySelector(".task-meta").textContent = `Updated ${new Date(task.updatedAt).toLocaleString()}`;
      card.querySelector(".edit-button").addEventListener("click", () => startEdit(task));
      card.querySelector(".delete-button").addEventListener("click", () => deleteTask(task.id));
      list.append(card);
    });

    board.append(column);
  });
}

async function loadTasks() {
  statusLine.textContent = "Loading tasks...";
  try {
    const payload = await api("/api/tasks");
    state.tasks = payload.tasks;
    renderBoard();
  } catch (error) {
    statusLine.textContent = error.message;
  }
}

function startEdit(task) {
  taskId.value = task.id;
  taskTitle.value = task.title;
  taskDescription.value = task.description || "";
  taskStage.value = task.stage;
  taskSubmit.textContent = "Update task";
  cancelEdit.classList.remove("hidden");
  taskTitle.focus();
}

async function deleteTask(id) {
  const task = state.tasks.find((item) => item.id === id);
  if (!task || !confirm(`Delete "${task.title}"?`)) return;

  try {
    await api(`/api/tasks/${id}`, { method: "DELETE" });
    state.tasks = state.tasks.filter((item) => item.id !== id);
    renderBoard();
  } catch (error) {
    statusLine.textContent = error.message;
  }
}

async function bootstrap() {
  setAuthMode("login");
  if (!state.token) {
    showAuth();
    return;
  }

  try {
    const payload = await api("/api/me");
    state.user = payload.user;
    showApp();
    await loadTasks();
  } catch {
    localStorage.removeItem("task-manager-token");
    state.token = "";
    showAuth();
  }
}

loginTab.addEventListener("click", () => setAuthMode("login"));
registerTab.addEventListener("click", () => setAuthMode("register"));

authForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  authMessage.textContent = "";
  const isRegister = state.mode === "register";
  setBusy(authSubmit, true, isRegister ? "Create account" : "Login");

  try {
    const payload = await api(isRegister ? "/api/auth/register" : "/api/auth/login", {
      method: "POST",
      body: JSON.stringify({
        name: nameInput.value,
        email: emailInput.value,
        password: passwordInput.value
      })
    });
    state.token = payload.token;
    state.user = payload.user;
    localStorage.setItem("task-manager-token", state.token);
    authForm.reset();
    showApp();
    await loadTasks();
  } catch (error) {
    authMessage.textContent = error.message;
  } finally {
    setBusy(authSubmit, false, isRegister ? "Create account" : "Login");
  }
});

taskForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const editingId = taskId.value;
  taskMessage.textContent = "";
  setBusy(taskSubmit, true, editingId ? "Update task" : "Create task");

  try {
    const payload = await api(editingId ? `/api/tasks/${editingId}` : "/api/tasks", {
      method: editingId ? "PATCH" : "POST",
      body: JSON.stringify({
        title: taskTitle.value,
        description: taskDescription.value,
        stage: taskStage.value
      })
    });

    if (editingId) {
      state.tasks = state.tasks.map((task) => (task.id === payload.task.id ? payload.task : task));
    } else {
      state.tasks = [payload.task, ...state.tasks];
    }
    resetTaskForm();
    renderBoard();
  } catch (error) {
    taskMessage.textContent = error.message;
  } finally {
    setBusy(taskSubmit, false, editingId ? "Update task" : "Create task");
  }
});

cancelEdit.addEventListener("click", resetTaskForm);
refreshButton.addEventListener("click", loadTasks);

logoutButton.addEventListener("click", async () => {
  try {
    await api("/api/auth/logout", { method: "POST" });
  } catch {
    // Local logout should still succeed if the server session already expired.
  }
  state.token = "";
  state.user = null;
  state.tasks = [];
  localStorage.removeItem("task-manager-token");
  resetTaskForm();
  showAuth();
});

bootstrap();
