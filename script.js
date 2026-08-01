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
  runTransaction,
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

// If we got this far, script.js and the Firebase SDK loaded successfully --
// hide the "still loading" fallback banner from index.html.
const scriptLoadWarning = document.getElementById("scriptLoadWarning");
if (scriptLoadWarning) scriptLoadWarning.remove();

// ---- Set up Firebase ----
const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);

// The Firestore collection where every user's data is stored.
// Each user gets exactly one document, named after their own unique user ID.
const DATA_COLLECTION = "todoData";

/* ==========================================================================
   0. Self-check: is firebase-config.js still full of placeholder values?
      This is the #1 cause of "everything fails" bug reports, so we check
      for it directly and show an unmissable message -- no devtools needed.
   ========================================================================== */
function configLooksUnfinished() {
  return Object.values(firebaseConfig).some(
    (value) => typeof value === "string" && value.startsWith("YOUR_")
  );
}

function showConfigWarningBanner() {
  const banner = document.createElement("div");
  banner.className = "config-warning-banner";
  banner.innerHTML =
    "⚠️ <strong>Firebase isn't set up yet.</strong> " +
    "<code>firebase-config.js</code> still has placeholder values " +
    "(like <code>YOUR_API_KEY</code>). Sign-in and sign-up will fail until " +
    "you paste in your real project's config — see the \"Step 1\" " +
    "instructions in README.md.";
  document.body.prepend(banner);
}

if (configLooksUnfinished()) {
  showConfigWarningBanner();
}

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
const loadingState = document.getElementById("loadingState");
const emptyState = document.getElementById("emptyState");
const errorMessage = document.getElementById("errorMessage");
const menuToggle = document.getElementById("menuToggle");
const menuToggleLabel = document.getElementById("menuToggleLabel");
const sidebar = document.getElementById("sidebar");
const sidebarOverlay = document.getElementById("sidebarOverlay");
const syncStatus = document.getElementById("syncStatus");
const accountEmail = document.getElementById("accountEmail");
const accountUid = document.getElementById("accountUid");
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
        // Brand-new account — show a fresh default list right away for
        // instant feedback. If another device happens to be creating the
        // SAME account's first list at the same moment, the transaction
        // below only writes a default if the server truly still has
        // nothing yet, so the two devices can't stomp on each other --
        // whichever one's transaction commits first "wins", and this
        // device's onSnapshot listener will self-correct automatically
        // when that final result comes back.
        appData = createDefaultData();
        saveWithTransaction((serverData) => serverData);
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

// Writes to Firestore using a TRANSACTION instead of a blind overwrite.
// Why this matters: if two devices are both signed in and one of them saves
// a change right after the other, a plain "overwrite the whole document"
// write can silently erase the other device's change (whichever save
// happens last just wins, full stop). A transaction instead reads whatever
// is ACTUALLY on the server at the moment it commits, and applies just this
// one change on top of that -- so two devices editing around the same time
// merge correctly instead of clobbering each other. Firestore automatically
// retries the transaction if it detects a conflicting write mid-flight.
//
// `applyChange` is a function that takes the latest server data and returns
// the updated data -- e.g. "push this new task into this list".
async function saveWithTransaction(applyChange) {
  if (!currentUser) return;
  try {
    syncStatus.textContent = "Saving...";
    const userDocRef = doc(db, DATA_COLLECTION, currentUser.uid);

    await runTransaction(db, async (transaction) => {
      const snapshot = await transaction.get(userDocRef);
      const latestServerData = snapshot.exists()
        ? snapshot.data()
        : createDefaultData();
      const updatedData = applyChange(latestServerData);
      transaction.set(userDocRef, updatedData);
    });

    syncStatus.textContent = "Synced ✓";
  } catch (err) {
    console.error("Failed to save to Firestore:", err);
    const code = err && err.code ? err.code : "unknown-error";
    if (code === "permission-denied") {
      syncStatus.textContent =
        "Not saved: check your Firestore security rules (see README)";
    } else {
      syncStatus.textContent = `Not saved (error: ${code})`;
    }
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
    checkBtn.addEventListener("click", () => {
      // Grab the button's on-screen position BEFORE anything re-renders --
      // once renderApp() rebuilds the list, this exact button element gets
      // thrown away, so its position has to be captured right now.
      const originRect = checkBtn.getBoundingClientRect();
      toggleTaskComplete(task.id, originRect);
    });

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

// Grab the "Add" submit buttons so we can disable them while data is loading
const addTaskBtn = newTaskForm.querySelector("button");
const addListBtn = newListForm.querySelector("button");

// Shown the moment a user signs in, BEFORE their real data has arrived from
// Firestore. Clears out anything left on screen from a previous account and
// disables the add-task/add-list controls so nothing can be submitted into
// a half-loaded (or wrong) list.
function showLoadingUI() {
  listNav.innerHTML = "";
  taskListEl.innerHTML = "";
  currentListName.textContent = "";
  menuToggleLabel.textContent = "";
  emptyState.hidden = true;
  loadingState.hidden = false;
  syncStatus.textContent = "Loading...";

  newTaskInput.disabled = true;
  addTaskBtn.disabled = true;
  newListInput.disabled = true;
  addListBtn.disabled = true;
  deleteListBtn.disabled = true;
}

// Re-draws the sidebar and task list from the current appData.
// Does NOT save — saving only happens when the user actually changes something.
function renderApp() {
  loadingState.hidden = true;
  newTaskInput.disabled = false;
  addTaskBtn.disabled = false;
  newListInput.disabled = false;
  addListBtn.disabled = false;
  deleteListBtn.disabled = false;

  renderListNav();
  renderTasks();
}

/* ==========================================================================
   6. List actions
   Each action does two things:
   1. Updates our own local copy right away and re-renders (feels instant)
   2. Sends the SAME logical change to Firestore via a transaction, which
      applies it to whatever is ACTUALLY on the server at that moment --
      so a second device saving around the same time merges in correctly
      instead of one save silently erasing the other's change.
   ========================================================================== */
function selectList(listId) {
  if (!appData) return;
  appData.selectedListId = listId;
  closeSidebarOnMobile();
  renderApp();

  saveWithTransaction((serverData) => {
    if (serverData.lists[listId]) {
      serverData.selectedListId = listId;
    }
    return serverData;
  });
}

function addList(name) {
  if (!appData) return;
  const trimmedName = name.trim();

  if (trimmedName === "") {
    showError("Please enter a list name.");
    return;
  }

  const id = generateId();
  const newList = { id, name: trimmedName, tasks: [] };

  appData.lists[id] = newList;
  appData.selectedListId = id;
  renderApp();

  saveWithTransaction((serverData) => {
    serverData.lists[id] = { id, name: trimmedName, tasks: [] };
    serverData.selectedListId = id;
    return serverData;
  });
}

function deleteCurrentList() {
  if (!appData) return;
  const listIds = Object.keys(appData.lists);

  // Never allow deleting the very last remaining list
  if (listIds.length <= 1) {
    showError("You can't delete your only remaining list.");
    return;
  }

  const list = appData.lists[appData.selectedListId];
  const listIdToDelete = list.id;
  const confirmed = confirm(
    `Delete the list "${list.name}" and all its tasks? This cannot be undone.`
  );
  if (!confirmed) return;

  delete appData.lists[listIdToDelete];
  appData.selectedListId = Object.keys(appData.lists)[0];
  renderApp();

  saveWithTransaction((serverData) => {
    const serverListIds = Object.keys(serverData.lists);
    // Re-check against the SERVER's current lists too -- never delete the
    // last one, even if another device deleted others in the meantime
    if (serverListIds.length > 1 && serverData.lists[listIdToDelete]) {
      delete serverData.lists[listIdToDelete];
      if (serverData.selectedListId === listIdToDelete) {
        serverData.selectedListId = Object.keys(serverData.lists)[0];
      }
    }
    return serverData;
  });
}

/* ==========================================================================
   7. Task actions
   ========================================================================== */
function addTask(text) {
  if (!appData) return;
  const trimmedText = text.trim();

  if (trimmedText === "") {
    showError("Please enter a task before adding it.");
    return;
  }

  const listId = appData.selectedListId;
  const newTask = {
    id: generateId(),
    text: trimmedText,
    completed: false,
    stars: 1, // default importance
    createdAt: Date.now(),
  };

  appData.lists[listId].tasks.push(newTask);
  renderApp();

  saveWithTransaction((serverData) => {
    if (serverData.lists[listId]) {
      serverData.lists[listId].tasks.push({ ...newTask });
    }
    return serverData;
  });
}

function toggleTaskComplete(taskId, originRect) {
  if (!appData) return;
  const listId = appData.selectedListId;
  const task = appData.lists[listId].tasks.find((t) => t.id === taskId);
  if (!task) return;

  task.completed = !task.completed;
  const newCompletedValue = task.completed; // the exact value the click intended

  // Only celebrate when CHECKING a task off, not when un-checking one
  if (newCompletedValue && originRect) {
    playCompleteSound();
    triggerConfettiBurst(originRect);
  }

  renderApp();

  saveWithTransaction((serverData) => {
    const serverList = serverData.lists[listId];
    const serverTask = serverList && serverList.tasks.find((t) => t.id === taskId);
    if (serverTask) {
      serverTask.completed = newCompletedValue;
    }
    return serverData;
  });
}

function setTaskStars(taskId, stars) {
  if (!appData) return;
  const listId = appData.selectedListId;
  const task = appData.lists[listId].tasks.find((t) => t.id === taskId);
  if (!task) return;

  task.stars = stars;
  renderApp();

  saveWithTransaction((serverData) => {
    const serverList = serverData.lists[listId];
    const serverTask = serverList && serverList.tasks.find((t) => t.id === taskId);
    if (serverTask) {
      serverTask.stars = stars;
    }
    return serverData;
  });
}

function deleteTask(taskId) {
  if (!appData) return;
  const listId = appData.selectedListId;
  appData.lists[listId].tasks = appData.lists[listId].tasks.filter(
    (t) => t.id !== taskId
  );
  renderApp();

  saveWithTransaction((serverData) => {
    const serverList = serverData.lists[listId];
    if (serverList) {
      serverList.tasks = serverList.tasks.filter((t) => t.id !== taskId);
    }
    return serverData;
  });
}

/* ==========================================================================
   8. Celebration effects: a click sound + confetti burst when a task is
      checked off. The sound is synthesized with the Web Audio API (no audio
      file to load), and the confetti is plain DOM elements animated with
      CSS -- no libraries needed for either.
   ========================================================================== */

// Colors pulled from the app's own mint/lime palette so the confetti still
// feels like part of the same design instead of a generic effect.
const CONFETTI_COLORS = ["#58c896", "#9fe8cb", "#a4d65e", "#82b83f", "#f5c451"];

// Reused across clicks -- browsers only allow creating a limited number of
// AudioContexts, and reusing one also avoids a tiny delay on every click.
let sharedAudioContext = null;

function getAudioContext() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return null; // very old / unsupported browser

  if (!sharedAudioContext) {
    sharedAudioContext = new AudioContextClass();
  }
  // Browsers suspend audio until a real user gesture happens; since this is
  // only ever called from inside a click handler, it's safe to resume here.
  if (sharedAudioContext.state === "suspended") {
    sharedAudioContext.resume();
  }
  return sharedAudioContext;
}

// A short, punchy "click" -- a quick downward pitch sweep with a fast
// attack and decay, similar to a satisfying button/toggle sound.
function playCompleteSound() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.connect(gain);
    gain.connect(ctx.destination);

    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(720, now);
    oscillator.frequency.exponentialRampToValueAtTime(280, now + 0.09);

    // Quick fade in, then fade out -- avoids any harsh click/pop from
    // starting or stopping a tone abruptly at full volume
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.22, now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.15);

    oscillator.start(now);
    oscillator.stop(now + 0.16);
  } catch (err) {
    // The sound effect is a nice-to-have, never worth breaking the app over
    console.warn("Couldn't play the completion sound:", err);
  }
}

// Bursts a handful of small colored particles outward from wherever the
// person just clicked, then cleans them up once their animation finishes.
function triggerConfettiBurst(originRect) {
  const originX = originRect.left + originRect.width / 2;
  const originY = originRect.top + originRect.height / 2;
  const particleCount = 14;

  for (let i = 0; i < particleCount; i++) {
    const particle = document.createElement("span");
    particle.className = "confetti-particle";

    // Spread particles outward in every direction, then let a slight
    // downward drift pull them like real confetti falling
    const angle = Math.random() * Math.PI * 2;
    const distance = 36 + Math.random() * 46;
    const tx = Math.cos(angle) * distance;
    const ty = Math.sin(angle) * distance + 24; // extra downward drift

    particle.style.setProperty("--tx", `${tx}px`);
    particle.style.setProperty("--ty", `${ty}px`);
    particle.style.setProperty("--rot", `${Math.random() * 420 - 210}deg`);
    particle.style.left = `${originX}px`;
    particle.style.top = `${originY}px`;
    particle.style.background =
      CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)];
    if (Math.random() > 0.5) {
      particle.style.borderRadius = "50%";
    }

    document.body.appendChild(particle);
    particle.addEventListener("animationend", () => particle.remove());
    // Safety net in case animationend doesn't fire for some reason
    setTimeout(() => particle.remove(), 900);
  }
}

/* ==========================================================================
   9. Small UI helpers
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

// Turns a Firebase Auth error code into a friendly, plain-language message.
// Always includes the raw error code too, so a problem can be diagnosed
// just by reading the screen -- no browser devtools required.
function friendlyAuthErrorMessage(error) {
  const code = error && error.code ? error.code : "unknown-error";

  const messages = {
    "auth/email-already-in-use":
      "That email already has an account — try logging in instead.",
    "auth/invalid-email": "That doesn't look like a valid email address.",
    "auth/weak-password": "Please use a password with at least 6 characters.",
    "auth/user-not-found": "Incorrect email or password.",
    "auth/wrong-password": "Incorrect email or password.",
    "auth/invalid-credential": "Incorrect email or password.",
    "auth/popup-closed-by-user":
      "Google sign-in was closed before finishing.",
    "auth/network-request-failed":
      "Network error — check your internet connection and try again.",
    "auth/too-many-requests":
      "Too many attempts. Please wait a bit and try again.",

    // --- Project setup / misconfiguration errors ---
    // These mean firebase-config.js or the Firebase console setup needs
    // attention, not that the person typed something wrong.
    "auth/invalid-api-key":
      "Setup problem: the API key in firebase-config.js looks invalid. Double-check it against the Firebase console.",
    "auth/api-key-not-valid.-please-pass-a-valid-api-key.":
      "Setup problem: the API key in firebase-config.js looks invalid. Double-check it against the Firebase console.",
    "auth/configuration-not-found":
      "Setup problem: this sign-in method isn't turned on yet. In the Firebase console, go to Authentication → Sign-in method and enable it.",
    "auth/operation-not-allowed":
      "Setup problem: this sign-in method isn't enabled yet. In the Firebase console, go to Authentication → Sign-in method and enable it.",
    "auth/unauthorized-domain":
      "Setup problem: this website's domain isn't approved yet. In the Firebase console, go to Authentication → Settings → Authorized domains and add it.",
    "auth/project-not-found":
      "Setup problem: the projectId in firebase-config.js doesn't match a real Firebase project.",
    "auth/account-exists-with-different-credential":
      "An account with this email already exists using a different sign-in method (e.g. Google instead of a password, or vice versa). Try the other sign-in option instead.",
  };

  const friendly = messages[code] || "Something went wrong.";
  return `${friendly} (error code: ${code})`;
}

/* ==========================================================================
   10. Auth screen: switching between "Log In" and "Sign Up" mode
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
   11. Event listeners
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
    // Always show the account picker, even if this browser already has a
    // Google account signed in -- otherwise Google can silently reuse
    // whatever account is already active, which is confusing when someone
    // means to pick a specific account (e.g. on a shared or work computer).
    provider.setCustomParameters({ prompt: "select_account" });
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
   12. Start the app: watch for sign-in / sign-out
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
    accountEmail.textContent = user.email ? `Signed in as: ${user.email}` : "";
    // Show the account's real unique ID too. Two browsers showing the same
    // email should ALSO show the exact same ID here -- if they don't match,
    // these are two genuinely different accounts, no matter how similar the
    // email looks, and that alone explains why the data isn't syncing.
    accountUid.textContent = `Account ID: ${user.uid}`;
    showLoadingUI(); // clear any previous account's leftover screen + disable inputs
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
