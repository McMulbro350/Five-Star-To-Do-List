/* ==========================================================================
   5 Star To-Do — script.js (Firebase edition)
   Handles: signing in/up, syncing lists & tasks to Firestore in real time,
   star ratings, sorting, and updating the page whenever data changes.
   ========================================================================== */

// ---- Firebase SDK imports (loaded straight from Google's CDN, no install needed) ----
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  GoogleAuthProvider,
  signInWithPopup,
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";
import {
  getFirestore,
  doc,
  setDoc,
  onSnapshot,
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

// ---- Set up Firebase ----
const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);

// The Firestore collection where every user's data is stored.
// Each user gets exactly one document, named after their own unique user ID.
const DATA_COLLECTION = "todoData";

/* ==========================================================================
   App state (kept in memory while the page is open)
   ========================================================================== */

// Shape:
// {
//   lists: {
//     "<listId>": { id, name, tasks: [ { id, text, completed, stars, createdAt } ] }
//   },
//   selectedListId: "<listId>"
// }
let appData = null;

let currentUser = null; // the signed-in Firebase user object (or null)
let unsubscribeFromData = null; // stops listening to Firestore when signing out
let authMode = "login"; // "login" or "signup" — tracks which the auth form is doing

/* ==========================================================================
   Grab the elements we'll need
   ========================================================================== */

// Screens
const authScreen = document.getElementById("authScreen");
const appScreen = document.getElementById("appScreen");

// Auth screen elements
const authForm = document.getElementById("authForm");
const authEmailInput = document.getElementById("authEmailInput");
const authPasswordInput = document.getElementById("authPasswordInput");
const authSubmitBtn = document.getElementById("authSubmitBtn");
const googleSignInBtn = document.getElementById("googleSignInBtn");
const authError = document.getElementById("authError");
const authSwitchBtn = document.getElementById("authSwitchBtn");
const authSwitchPrompt = document.getElementById("authSwitchPrompt");

// App screen elements
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
const syncStatus = document.getElementById("syncStatus");
const accountEmail = document.getElementById("accountEmail");
const signOutBtn = document.getElementById("signOutBtn");

/* ==========================================================================
   1. Helper: generate a unique ID (avoids duplicate IDs)
   ========================================================================== */
function generateId() {
  if (window.crypto && window.crypto.randomUUID) {
    return window.crypto.randomUUID();
  }
  return "id-" + Date.now() + "-" + Math.floor(Math.random() * 100000);
}

// The default data a brand-new account starts with: one "My Tasks" list
function createDefaultData() {
  const defaultId = generateId();
  return {
    lists: {
      [defaultId]: { id: defaultId, name: "My Tasks", tasks: [] },
    },
    selectedListId: defaultId,
  };
}

/* ==========================================================================
   2. Firestore: real-time sync (replaces the old localStorage load/save)
   ========================================================================== */

// Starts listening to this user's document. Firestore pushes updates to us
// automatically — from this device AND from any other device signed into
// the same account — so onSnapshot fires every time the data changes.
function subscribeToUserData(uid) {
  const userDocRef = doc(db, DATA_COLLECTION, uid);

  unsubscribeFromData = onSnapshot(
    userDocRef,
    (snapshot) => {
      if (snapshot.exists()) {
        appData = snapshot.data();
        // Safety check: if the remembered selected list no longer exists
        // (e.g. it was deleted from another device), fall back to the first list
        if (!appData.lists[appData.selectedListId]) {
          appData.selectedListId = Object.keys(appData.lists)[0];
        }
      } else {
        // Brand-new account — nothing saved yet, so create the default list
        appData = createDefaultData();
        saveData();
      }
      syncStatus.textContent = "Synced ✓";
      renderApp();
    },
    (err) => {
      console.error("Firestore sync error:", err);
      syncStatus.textContent = "Offline — changes will sync later";
    }
  );
}

// Writes the current appData up to Firestore. Every device listening
// (including this one) will receive the update through onSnapshot above.
async function saveData() {
  if (!currentUser || !appData) return;
  try {
    syncStatus.textContent = "Saving...";
    const userDocRef = doc(db, DATA_COLLECTION, currentUser.uid);
    await setDoc(userDocRef, appData);
    syncStatus.textContent = "Synced ✓";
  } catch (err) {
    console.error("Failed to save to Firestore:", err);
    syncStatus.textContent = "Couldn't save — check your connection";
  }
}

/* ==========================================================================
   3. Sorting rule for tasks
      1. Incomplete tasks before completed tasks
      2. Higher star rating first
      3. Same rating -> keep the order they were added (stable sort)
      4. Completed tasks always at the bottom
   ========================================================================== */
function getSortedTasks(tasks) {
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
  emptyState.hidden = sortedTasks.length !== 0;

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

// Re-draws the sidebar and task list from the current appData.
// Does NOT save — saving only happens when the user actually changes something.
function renderApp() {
  renderListNav();
  renderTasks();
}

// Call this after any change the user makes: it updates the screen right away
// (so the app feels instant) and then sends the change to Firestore.
function commitChange() {
  renderApp();
  saveData();
}

/* ==========================================================================
   6. List actions
   ========================================================================== */
function selectList(listId) {
  appData.selectedListId = listId;
  closeSidebarOnMobile();
  commitChange();
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
  commitChange();
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
  appData.selectedListId = Object.keys(appData.lists)[0];
  commitChange();
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

  commitChange();
}

function toggleTaskComplete(taskId) {
  const list = appData.lists[appData.selectedListId];
  const task = list.tasks.find((t) => t.id === taskId);
  if (task) {
    task.completed = !task.completed;
    commitChange();
  }
}

function setTaskStars(taskId, stars) {
  const list = appData.lists[appData.selectedListId];
  const task = list.tasks.find((t) => t.id === taskId);
  if (task) {
    task.stars = stars;
    commitChange();
  }
}

function deleteTask(taskId) {
  const list = appData.lists[appData.selectedListId];
  list.tasks = list.tasks.filter((t) => t.id !== taskId);
  commitChange();
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

function showAuthError(message) {
  authError.textContent = message;
  authError.hidden = false;
}

function clearAuthError() {
  authError.hidden = true;
}

function openSidebar() {
  sidebar.classList.add("open");
  sidebarOverlay.classList.add("open");
}

function closeSidebarOnMobile() {
  sidebar.classList.remove("open");
  sidebarOverlay.classList.remove("open");
}

// Turns a Firebase Auth error code into a friendly, plain-language message
function friendlyAuthErrorMessage(error) {
  const code = error && error.code ? error.code : "";
  switch (code) {
    case "auth/email-already-in-use":
      return "That email already has an account — try logging in instead.";
    case "auth/invalid-email":
      return "That doesn't look like a valid email address.";
    case "auth/weak-password":
      return "Please use a password with at least 6 characters.";
    case "auth/user-not-found":
    case "auth/wrong-password":
    case "auth/invalid-credential":
      return "Incorrect email or password.";
    case "auth/popup-closed-by-user":
      return "Google sign-in was closed before finishing.";
    default:
      return "Something went wrong. Please try again.";
  }
}

/* ==========================================================================
   9. Auth screen: switching between "Log In" and "Sign Up" mode
   ========================================================================== */
function setAuthMode(mode) {
  authMode = mode;
  clearAuthError();

  if (mode === "signup") {
    authSubmitBtn.textContent = "Sign Up";
    authSwitchPrompt.textContent = "Already have an account?";
    authSwitchBtn.textContent = "Log In";
  } else {
    authSubmitBtn.textContent = "Log In";
    authSwitchPrompt.textContent = "Don't have an account?";
    authSwitchBtn.textContent = "Sign Up";
  }
}

/* ==========================================================================
   10. Event listeners
   ========================================================================== */

// --- Auth screen ---
authForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  clearAuthError();

  const email = authEmailInput.value.trim();
  const password = authPasswordInput.value;

  if (email === "" || password === "") {
    showAuthError("Please fill in both fields.");
    return;
  }

  authSubmitBtn.disabled = true;
  try {
    if (authMode === "signup") {
      await createUserWithEmailAndPassword(auth, email, password);
    } else {
      await signInWithEmailAndPassword(auth, email, password);
    }
    // onAuthStateChanged (below) takes care of showing the app screen
  } catch (err) {
    showAuthError(friendlyAuthErrorMessage(err));
  } finally {
    authSubmitBtn.disabled = false;
  }
});

googleSignInBtn.addEventListener("click", async () => {
  clearAuthError();
  try {
    const provider = new GoogleAuthProvider();
    await signInWithPopup(auth, provider);
  } catch (err) {
    showAuthError(friendlyAuthErrorMessage(err));
  }
});

authSwitchBtn.addEventListener("click", () => {
  setAuthMode(authMode === "login" ? "signup" : "login");
});

signOutBtn.addEventListener("click", () => {
  signOut(auth);
});

// --- App screen ---
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
   11. Start the app: watch for sign-in / sign-out
   ========================================================================== */
onAuthStateChanged(auth, (user) => {
  // Stop listening to the previous user's data, if any
  if (unsubscribeFromData) {
    unsubscribeFromData();
    unsubscribeFromData = null;
  }

  if (user) {
    // Signed in: show the app and start syncing this user's data
    currentUser = user;
    appData = null;
    authScreen.hidden = true;
    appScreen.hidden = false;
    accountEmail.textContent = user.email || "";
    subscribeToUserData(user.uid);
  } else {
    // Signed out: show the login screen
    currentUser = null;
    appData = null;
    appScreen.hidden = true;
    authScreen.hidden = false;
    authForm.reset();
    setAuthMode("login");
  }
});
