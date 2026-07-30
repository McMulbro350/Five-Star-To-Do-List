# What I Learned

This version of 5 Star To-Do moved from saving data in the browser (`localStorage`) to saving it in the cloud with Firebase, so tasks now sync across every device I'm signed into. Here's what I learned building it, in simple terms.

## 1. How Firebase Authentication and Firestore store data

**Authentication** is what lets the app know *who* is using it. Instead of writing my own login system, I used Firebase Auth, which handles passwords, accounts, and sessions for me. Signing someone up is just one function call:

```javascript
await createUserWithEmailAndPassword(auth, email, password);
```

Once someone is signed in, Firebase gives me a `user` object with a unique ID (`user.uid`) that never changes for that account. I use that ID to know *whose* data to load.

**Firestore** is the actual database where the lists and tasks live — think of it like `localStorage`, but stored on Google's servers instead of the browser, so it follows the user around. Each person gets exactly one "document" in a collection called `todoData`, named after their own user ID:

```javascript
const userDocRef = doc(db, "todoData", user.uid);
await setDoc(userDocRef, appData); // saves the whole lists/tasks object
```

This is important: `localStorage` only exists on one browser, on one device. Firestore data exists in the cloud, so logging in from a phone, a laptop, or a friend's computer all show the exact same lists.

One thing I had to think about carefully: since the config values (`apiKey`, `projectId`, etc.) are visible in the browser's JavaScript, *anyone* could technically see them. That's actually normal for Firebase — real security comes from **Firestore Security Rules**, a separate set of rules I write in the Firebase console that say "only let a user read or write their own document":

```
match /todoData/{userId} {
  allow read, write: if request.auth != null && request.auth.uid == userId;
}
```

## 2. How tasks are sorted by completion and star rating

This part didn't change from the `localStorage` version! Sorting is just a JavaScript rule that runs on whatever data is currently in memory, no matter where that data came from. I still use `.sort()` with a comparison function:

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

Because JavaScript's sort is stable, tasks with the same completion status and the same star rating naturally keep the order they were added in — I don't have to write any extra code for that rule.

## 3. How JavaScript updates the page after the data changes

With `localStorage`, my code was in charge of *both* saving data and re-drawing the screen every time something changed. With Firestore, there's a new piece: `onSnapshot`, which *listens* for changes and calls my code automatically — even if the change came from a totally different device.

```javascript
onSnapshot(userDocRef, (snapshot) => {
  appData = snapshot.data(); // the latest data, from anywhere
  renderApp();                // redraw the screen to match it
});
```

This means my rendering code barely changed — I still clear out the old HTML and rebuild it from `appData`, exactly like before. The difference is *what triggers* that rebuild. Before, only my own button clicks caused a re-render. Now, a re-render can also be triggered by Firestore telling me "hey, the data changed somewhere else" — which is what makes the multi-device syncing actually feel real-time.

I did have to be careful about one thing: I split "saving" and "rendering" into two separate steps, instead of doing both together like I did with `localStorage`. That's because now there are two different reasons the screen might need to update — the user did something locally, *or* the cloud told me something changed — and I didn't want those two paths to get tangled up or accidentally trigger a save loop.
