# 5 Star To-Do

A simple, clean multi-list to-do app built with plain HTML, CSS, and JavaScript — no frameworks, no database, no login. Everything is saved right in your browser using `localStorage`, so your lists and tasks are still there the next time you open the page.

## Features

- **Add, complete, and delete tasks** in any list
- **Star ratings (1–5)** for each task's importance, with automatic sorting:
  1. Unfinished tasks appear before completed ones
  2. 5-star tasks appear first, then 4-star, 3-star, and so on
  3. Completed tasks always sink to the bottom
  4. Tasks with the same rating keep the order they were added in
- **Multiple to-do lists** — create as many as you like, name them, switch between them, and delete the ones you no longer need
- **A default "My Tasks" list** is created automatically the first time you open the app
- **Everything is remembered**, including which list you last had open, using `localStorage` — no account or internet connection required
- **Confirmation prompt** before deleting a whole list, so you don't lose tasks by accident
- **Validation** to stop you from adding empty tasks or empty list names
- **Responsive design** — a sidebar on desktop, a slide-out menu on mobile
- Clean, modern look with white background and mint/lime-green accents

## File structure

```text
index.html          # page structure
style.css           # styling and layout
script.js           # app logic (data, sorting, rendering)
WHAT_I_LEARNED.md    # notes on how the app works
README.md            # this file
```

## Running it locally

You don't need to install anything. Pick whichever option is easiest for you:

**Option A — just open the file**
1. Double-click `index.html` (or right-click → Open With → your browser).
2. The app opens directly. That's it!

**Option B — use a local server (recommended)**
Some browsers restrict certain features when opening files directly, so a tiny local server is a good habit. If you have Python installed:

```bash
# from inside the project folder
python3 -m http.server 8000
```

Then open `http://localhost:8000` in your browser.

If you have Node.js installed instead, you can use:

```bash
npx serve .
```

## Deploying to Vercel

You don't need any build tools — Vercel can host these static files as-is.

### Option 1: Deploy from GitHub (recommended)

1. **Create a GitHub repository** and push this project to it (see the "Uploading to GitHub" steps below).
2. Go to [vercel.com](https://vercel.com) and sign in (you can sign in with your GitHub account).
3. Click **"Add New..." → "Project"**.
4. Select the GitHub repository you just created and click **"Import"**.
5. Vercel will detect it's a static site — you can leave all settings as default (no build command needed).
6. Click **"Deploy"**.
7. After a few seconds, Vercel gives you a live URL like `https://5-star-todo.vercel.app` — your app is now online!

Any time you push new changes to GitHub, Vercel automatically redeploys the site.

### Option 2: Deploy with the Vercel CLI

1. Install the CLI (requires [Node.js](https://nodejs.org)):
   ```bash
   npm install -g vercel
   ```
2. From inside the project folder, run:
   ```bash
   vercel
   ```
3. Follow the prompts (log in, confirm the project settings, keep defaults).
4. Vercel will give you a live URL once deployment finishes.

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

- No data is sent anywhere — all lists and tasks are stored only in your browser's `localStorage`, on your own device.
- Clearing your browser's site data/cache for this page will erase your saved lists, since there's no server-side backup.
