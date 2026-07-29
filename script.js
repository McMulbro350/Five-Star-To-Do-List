/* ==========================================================================
   5 Star To-Do — script.js
   Handles: saving/loading data, multiple lists, tasks, star ratings,
   sorting, and updating the page whenever something changes.
   ========================================================================== */

// The key we use to store everything in localStorage
const STORAGE_KEY = "fiveStarTodoData";

// This holds all our app data while the page is open.
// Shape:
// {
//   lists: {
//     "<listId>": { id, name, tasks: [ { id, text, completed, stars, createdAt } ] }
//   },
//   selectedListId: "<listId>"
// }
let appData = null;

// Grab all the elements we'll need to update
const listNav = document.getElementById("listNav");
const newListForm = document.getElementById("newListForm");
const newListInput = document.getElementById("newListInput");
const currentListName = document.getElementById("currentListName");
const deleteListBtn = document.getElementById("deleteListBtn");
const newTaskForm = document.getElementById("newTaskForm");
const newTaskInput = document.getElementById("newTaskInput");
const taskListEl = document.getElementById("taskList");
const emptyState = document.getElementById("emptyState");
const errorMessage = document.getElementById("errorMessage");
const menuToggle = document.getElementById("menuToggle");
const menuToggleLabel = document.getElementById("menuToggleLabel");
const sidebar = document.getElementById("sidebar");
const sidebarOverlay = document.getElementById("sidebarOverlay");

/* ==========================================================================
   1. Helper: generate a unique ID (avoids duplicate IDs)
   ========================================================================== */
function generateId() {
  // crypto.randomUUID is supported in all modern browsers
  if (window.crypto && window.crypto.randomUUID) {
    return window.crypto.randomUUID();
  }
  // Fallback for older browsers: timestamp + random number
  return "id-" + Date.now() + "-" + Math.floor(Math.random() * 100000);
}

/* ==========================================================================
   2. localStorage: load and save
   ========================================================================== */
function loadData() {
  const raw = localStorage.getItem(STORAGE_KEY);

  if (raw) {
    try {
      return JSON.parse(raw);
    } catch (err) {
      console.warn("Saved data was corrupted, starting fresh.", err);
    }
  }

  // No saved data yet — create the default "My Tasks" list
  const defaultId = generateId();
  return {
    lists: {
      [defaultId]: { id: defaultId, name: "My Tasks", tasks: [] },
    },
    selectedListId: defaultId,
  };
}

function saveData() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(appData));
}

/* ==========================================================================
   3. Sorting rule for tasks
      1. Incomplete tasks before completed tasks
      2. Higher star rating first
      3. Same rating -> keep the order they were added (stable sort)
      4. Completed tasks always at the bottom
   ========================================================================== */
function getSortedTasks(tasks) {
  // Array.prototype.sort is stable in modern browsers, so tasks with an
  // equal sort "score" keep their original (added) order automatically.
  return [...tasks].sort((a, b) => {
    if (a.completed !== b.completed) {
      return a.completed ? 1 : -1; // incomplete (false) comes first
    }
    return b.stars - a.stars; // higher stars first
  });
}

/* ==========================================================================
   4. Rendering: sidebar list of lists
   ========================================================================== */
function renderListNav() {
  listNav.innerHTML = "";

  Object.values(appData.lists).forEach((list) => {
    const button = document.createElement("button");
    button.className = "list-nav-item";
    if (list.id === appData.selectedListId) {
      button.classList.add("active");
    }
    button.type = "button";

    const nameSpan = document.createElement("span");
    nameSpan.textContent = list.name;

    const countSpan = document.createElement("span");
    countSpan.className = "task-count";
    countSpan.textContent = list.tasks.length;

    button.appendChild(nameSpan);
    button.appendChild(countSpan);

    button.addEventListener("click", () => selectList(list.id));

    listNav.appendChild(button);
  });
}

/* ==========================================================================
   5. Rendering: tasks for the currently selected list
   ========================================================================== */
function renderTasks() {
  const list = appData.lists[appData.selectedListId];
  currentListName.textContent = list.name;
  menuToggleLabel.textContent = list.name;

  const sortedTasks = getSortedTasks(list.tasks);

  taskListEl.innerHTML = "";

  if (sortedTasks.length === 0) {
    emptyState.hidden = false;
  } else {
    emptyState.hidden = true;
  }

  sortedTasks.forEach((task) => {
    const li = document.createElement("li");
    li.className = "task-item" + (task.completed ? " completed" : "");
    li.dataset.id = task.id;

    // Completion toggle button
    const checkBtn = document.createElement("button");
    checkBtn.className = "task-check";
    checkBtn.type = "button";
    checkBtn.setAttribute("aria-label", "Mark task complete");
    checkBtn.textContent = "✓";
    checkBtn.addEventListener("click", () => toggleTaskComplete(task.id));

    // Task text
    const textSpan = document.createElement("span");
    textSpan.className = "task-text";
    textSpan.textContent = task.text;

    // Star rating buttons (1 to 5)
    const starsWrap = document.createElement("div");
    starsWrap.className = "stars";
    for (let i = 1; i <= 5; i++) {
      const starBtn = document.createElement("button");
      starBtn.type = "button";
      starBtn.className = "star-btn" + (i <= task.stars ? " filled" : "");
      starBtn.textContent = "★";
      starBtn.setAttribute("aria-label", i + " star" + (i > 1 ? "s" : ""));
      starBtn.addEventListener("click", () => setTaskStars(task.id, i));
      starsWrap.appendChild(starBtn);
    }

    // Delete button
    const deleteBtn = document.createElement("button");
    deleteBtn.className = "task-delete";
    deleteBtn.type = "button";
    deleteBtn.setAttribute("aria-label", "Delete task");
    deleteBtn.textContent = "🗑";
    deleteBtn.addEventListener("click", () => deleteTask(task.id));

    li.appendChild(checkBtn);
    li.appendChild(textSpan);
    li.appendChild(starsWrap);
    li.appendChild(deleteBtn);

    taskListEl.appendChild(li);
  });
}

// Runs both render functions and saves — call this after every change
function renderAll() {
  renderListNav();
  renderTasks();
  saveData();
}

/* ==========================================================================
   6. List actions
   ========================================================================== */
function selectList(listId) {
  appData.selectedListId = listId;
  closeSidebarOnMobile();
  renderAll();
}

function addList(name) {
  const trimmedName = name.trim();

  if (trimmedName === "") {
    showError("Please enter a list name.");
    return;
  }

  const id = generateId();
  appData.lists[id] = { id, name: trimmedName, tasks: [] };
  appData.selectedListId = id;
  renderAll();
}

function deleteCurrentList() {
  const listIds = Object.keys(appData.lists);

  // Never allow deleting the very last remaining list
  if (listIds.length <= 1) {
    showError("You can't delete your only remaining list.");
    return;
  }

  const list = appData.lists[appData.selectedListId];
  const confirmed = confirm(
    `Delete the list "${list.name}" and all its tasks? This cannot be undone.`
  );
  if (!confirmed) return;

  delete appData.lists[list.id];

  // Select the first list that's left
  appData.selectedListId = Object.keys(appData.lists)[0];
  renderAll();
}

/* ==========================================================================
   7. Task actions
   ========================================================================== */
function addTask(text) {
  const trimmedText = text.trim();

  if (trimmedText === "") {
    showError("Please enter a task before adding it.");
    return;
  }

  const list = appData.lists[appData.selectedListId];
  list.tasks.push({
    id: generateId(),
    text: trimmedText,
    completed: false,
    stars: 1, // default importance
    createdAt: Date.now(),
  });

  renderAll();
}

function toggleTaskComplete(taskId) {
  const list = appData.lists[appData.selectedListId];
  const task = list.tasks.find((t) => t.id === taskId);
  if (task) {
    task.completed = !task.completed;
    renderAll();
  }
}

function setTaskStars(taskId, stars) {
  const list = appData.lists[appData.selectedListId];
  const task = list.tasks.find((t) => t.id === taskId);
  if (task) {
    // Clicking the same star again resets to that value (no toggle-off needed
    // since 1 star is the minimum rating)
    task.stars = stars;
    renderAll();
  }
}

function deleteTask(taskId) {
  const list = appData.lists[appData.selectedListId];
  list.tasks = list.tasks.filter((t) => t.id !== taskId);
  renderAll();
}

/* ==========================================================================
   8. Small UI helpers
   ========================================================================== */
function showError(message) {
  errorMessage.textContent = message;
  errorMessage.hidden = false;
  setTimeout(() => {
    errorMessage.hidden = true;
  }, 2500);
}

function openSidebar() {
  sidebar.classList.add("open");
  sidebarOverlay.classList.add("open");
}

function closeSidebarOnMobile() {
  sidebar.classList.remove("open");
  sidebarOverlay.classList.remove("open");
}

/* ==========================================================================
   9. Event listeners
   ========================================================================== */
newListForm.addEventListener("submit", (e) => {
  e.preventDefault();
  addList(newListInput.value);
  newListInput.value = "";
});

newTaskForm.addEventListener("submit", (e) => {
  e.preventDefault();
  addTask(newTaskInput.value);
  newTaskInput.value = "";
});

deleteListBtn.addEventListener("click", deleteCurrentList);

menuToggle.addEventListener("click", openSidebar);
sidebarOverlay.addEventListener("click", closeSidebarOnMobile);

/* ==========================================================================
   10. Start the app
   ========================================================================== */
appData = loadData();

// Safety check: if the remembered selectedListId no longer exists
// (e.g. its list was deleted in a previous session), fall back to the first list
if (!appData.lists[appData.selectedListId]) {
  appData.selectedListId = Object.keys(appData.lists)[0];
}

renderAll();
