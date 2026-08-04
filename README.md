# 5 Star To-Do 2.0

A simple, clean multi-list to-do app built with plain HTML, CSS, and JavaScript — no frameworks. Your lists and tasks are stored in **Firebase** (Google's cloud platform), so you can sign in and see the exact same data on your phone, laptop, or any other device.

## What's new in 2.0

- **Light blue design** with bolder, more legible text throughout
- **Better mobile experience** — bigger tap targets, improved spacing, no more accidental iOS zoom on the inputs
- **Faster loading** — Firestore now uses a persistent, multi-tab local cache, so repeat visits show your data sooner instead of waiting on a network round-trip every time
- **A "Sync Now" button** — forces an immediate, fresh fetch straight from the server if you ever want to double-check everything's up to date
- **A satisfying check-off effect** — a click sound plus a confetti burst when you complete a task
- **Every bug found in 1.0 fixed**: specific, self-diagnosing error messages instead of "something went wrong," a loading state that prevents stale data from a previous account flashing on screen, a forced account picker for Google sign-in, and — the big one — saves now go through Firestore transactions instead of blind overwrites, so two devices editing around the same time no longer erase each other's changes

## Features

- **Sign in with email/password or Google** — your data follows you, not your browser
- **Real-time sync** — make a change on one device, see it appear on another automatically, or hit **Sync Now** to force an immediate refresh
- **Add, complete, and delete tasks** in any list (the input stays focused after adding, so you can add several tasks quickly in a row)
- **Star ratings (1–5)** for each task's importance, with automatic sorting:
  1. Unfinished tasks appear before completed ones
  2. 5-star tasks appear first, then 4-star, 3-star, and so on
  3. Completed tasks always sink to the bottom
  4. Tasks with the same rating keep the order they were added in
- **Multiple to-do lists** — create as many as you like, name them, switch between them, and delete the ones you no longer need
- **A default "My Tasks" list** is created automatically the first time you sign in
- **Confirmation prompt** before deleting a whole list, so you don't lose tasks by accident
- **Validation** to stop you from adding empty tasks or empty list names
- **Responsive design** — a sidebar on desktop, a slide-out menu with large touch targets on mobile
- Clean, modern look with a white background and a light blue color palette, with gold stars for contrast

## File structure

```text
index.html            # page structure (login screen + app screen)
style.css             # styling and layout
script.js             # app logic (auth, Firestore sync, sorting, rendering)
firebase-config.js    # your Firebase project's connection settings
firestore.rules       # security rules to paste into the Firebase console
WHAT_I_LEARNED.md     # notes on how the app works
README.md             # this file
```

## Step 1: Create your Firebase project

You need your own free Firebase project before the app will work — this is what stores your data and handles sign-in.

1. Go to [console.firebase.google.com](https://console.firebase.google.com) and sign in with any Google account.
2. Click **"Add project"**, give it a name (e.g. "5-star-todo"), and finish the setup wizard (you can turn off Google Analytics — it's not needed).
3. Once the project is created, click the **web icon (`</>`)** on the project overview page to register a new web app. Give it a nickname and click **"Register app"**.
4. Firebase will show you a code snippet with a `firebaseConfig` object, something like:
   ```javascript
   const firebaseConfig = {
     apiKey: "AIza...",
     authDomain: "5-star-todo-12345.firebaseapp.com",
     projectId: "5-star-todo-12345",
     storageBucket: "5-star-todo-12345.appspot.com",
     messagingSenderId: "123456789",
     appId: "1:123456789:web:abc123"
   };
   ```
   Copy these values into **`firebase-config.js`** in this project, replacing the placeholder text.

## Step 2: Turn on Authentication

1. In the Firebase console sidebar, click **Build → Authentication → Get started**.
2. Under the **Sign-in method** tab, enable:
   - **Email/Password** (click it, toggle "Enable", save)
   - **Google** (click it, toggle "Enable", pick a support email, save)

## Step 3: Turn on Firestore (the database)

1. In the sidebar, click **Build → Firestore Database → Create database**.
2. Choose **"Start in production mode"** (safer default) and pick any location close to you.
3. Once it's created, go to the **Rules** tab, delete everything there, and paste in the contents of **`firestore.rules`** from this project. Click **Publish**.
   - These rules make sure every user can only read and write their *own* tasks — nobody else's.

That's it — your project is ready. Everything below runs against your own Firebase project.

## Running it locally

Because the app uses `<script type="module">` to import Firebase, most browsers require it to be served over `http://` rather than opened directly as a `file://` — so use a quick local server:

```bash
# from inside the project folder
python3 -m http.server 8000
```

Then open `http://localhost:8000` in your browser. You should see the sign-in screen — create an account with any email/password to try it out.

If you have Node.js installed instead, you can use:

```bash
npx serve .
```

## Deploying to Vercel

No build tools are needed — Vercel can host these static files as-is.

### Option 1: Deploy from GitHub (recommended)

1. **Create a GitHub repository** and push this project to it (see "Uploading to GitHub" below). Make sure `firebase-config.js` has your real project values filled in before pushing (this file is safe to make public — see the note in that file for why).
2. Go to [vercel.com](https://vercel.com) and sign in (you can use your GitHub account).
3. Click **"Add New..." → "Project"**, select your repository, and click **"Import"**.
4. Leave all settings as default (no build command needed) and click **"Deploy"**.
5. Vercel gives you a live URL like `https://5-star-todo.vercel.app`.

### Option 2: Deploy with the Vercel CLI

```bash
npm install -g vercel
vercel
```

Follow the prompts (log in, confirm settings, keep defaults) and Vercel will give you a live URL.

### One more Firebase step after deploying

Firebase only allows sign-in requests from domains you've approved:

1. In the Firebase console, go to **Authentication → Settings → Authorized domains**.
2. Click **"Add domain"** and add your Vercel URL (e.g. `5-star-todo.vercel.app`).

Without this step, sign-in will fail on your live site even though it works on `localhost`.

## Uploading to GitHub

If you haven't pushed this project to GitHub yet:

1. Create a new, empty repository on [github.com](https://github.com) (don't add a README, .gitignore, or license — this project already has its own files).
2. Open a terminal in this project folder and run:
   ```bash
   git init
   git add .
   git commit -m "Initial commit: 5 Star To-Do app"
   git branch -M main
   git remote add origin https://github.com/YOUR-USERNAME/YOUR-REPO-NAME.git
   git push -u origin main
   ```
3. Refresh your GitHub repository page — your files should now be there.
4. Continue with the Vercel steps above to deploy it.

## Notes

- Your `firebase-config.js` values are **not secret** — they're meant to be visible in client-side code. What actually protects your data is the Firestore Security Rules from Step 3, which only let you touch your own document.
- If you ever see "Synced ✓" turn into an error message in the sidebar, it usually means either your internet connection dropped or the Firestore rules weren't published — the message will include a specific reason, no browser devtools needed.
- If two devices ever look out of sync, check the **Account ID** shown under your email in the sidebar on each one — if they're identical, you're genuinely on the same account and it's just a timing thing (try **Sync Now**); if they differ, you're signed into two different accounts.
- The **Sync Now** button forces a fresh read straight from Firestore's server, skipping the local cache — useful if you want to double-check everything's current, though the app also syncs automatically in real time on its own.
- Free Firebase usage ("Spark plan") comfortably covers personal use of an app like this.
