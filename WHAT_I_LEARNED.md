# What I Learned

Building 5 Star To-Do taught me three main things about front-end web development. Here's what I learned, in simple terms.

## 1. How `localStorage` saves lists and tasks

`localStorage` is a small storage space built into every browser. It only stores **strings** (text), so to save something more complex, like a list of objects, I first turn it into a JSON string with `JSON.stringify()`. To get it back later, I turn that string back into a real JavaScript object with `JSON.parse()`.

Everything in the app — every list and every task inside it — lives in one big object called `appData`. Every time something changes (a task is added, completed, deleted, etc.), I save the whole object back to `localStorage`:

```javascript
function saveData() {
  localStorage.setItem("fiveStarTodoData", JSON.stringify(appData));
}
```

When the page loads again, I check if any data was saved before. If it was, I parse it back into an object. If not (first visit), I create a default list called "My Tasks":

```javascript
function loadData() {
  const raw = localStorage.getItem("fiveStarTodoData");
  if (raw) {
    return JSON.parse(raw);
  }
  // no saved data yet, so start fresh with a default list
}
```

Because `appData` also remembers `selectedListId`, the app even remembers which list you had open last time you closed the page.

## 2. How tasks are sorted by completion and star rating

The app needs tasks to always appear in a specific order: unfinished tasks first (ranked by stars, highest first), then finished tasks at the bottom. I do this with JavaScript's built-in `.sort()` method, which lets me compare two tasks (`a` and `b`) at a time and decide which comes first.

```javascript
function getSortedTasks(tasks) {
  return [...tasks].sort((a, b) => {
    if (a.completed !== b.completed) {
      return a.completed ? 1 : -1; // unfinished tasks come first
    }
    return b.stars - a.stars; // higher star rating comes first
  });
}
```

An important detail: modern browsers use a **stable sort**, meaning if two tasks are tied (same completion status and same star rating), they keep the order they were originally added in. That's why I never had to write extra code for rule #5 ("tasks with the same rating remain in the order they were added") — I get it for free from the browser's sort behavior.

Notice I also used `[...tasks]` to make a copy of the array before sorting. This way, the sorting only affects *how tasks are displayed*, not the actual saved order in `appData`, which keeps things simpler to reason about.

## 3. How JavaScript updates the page after the data changes

The browser doesn't automatically know when my `appData` object changes — I have to manually tell it to redraw the page. I do this by clearing out the old HTML and rebuilding it from scratch every time something changes:

```javascript
function renderTasks() {
  taskListEl.innerHTML = ""; // clear the old list

  const sortedTasks = getSortedTasks(currentList.tasks);
  sortedTasks.forEach((task) => {
    const li = document.createElement("li");
    // ...build the task card here...
    taskListEl.appendChild(li);
  });
}
```

Every action in the app (adding a task, checking it off, changing its stars, deleting it) follows the same three-step pattern:

1. Update the `appData` object in memory.
2. Save `appData` to `localStorage`.
3. Re-render the page so it matches the new data.

I wrapped steps 2 and 3 into one helper function called `renderAll()`, so I only ever need to call one function after any change, and I can be confident the screen and the saved data always match.
