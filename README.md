# Website Project Tracker — Chelo
**Artchelo Design · Internal Tool**

A clean, role-based project management dashboard hosted free on GitHub Pages with a Supabase backend. Admin users get full CRUD; client users get read-only access.

---

## Files in This Project

| File | Purpose |
|---|---|
| `index.html` | Full app UI — login screen, dashboard, modals |
| `app.js` | All JavaScript logic — auth, CRUD, badges, filters |
| `style.css` | Custom styles on top of Tailwind CDN |
| `supabase-setup.sql` | Run once in Supabase to create tables, policies, and triggers |

---

## Part 1 — Supabase Setup (your free database)

### 1.1 Create a Supabase project

1. Go to [supabase.com](https://supabase.com) and sign up for a free account.
2. Click **New Project**.
3. Give it a name (e.g. `chelo-tracker`), set a strong database password, and choose the region closest to you.
4. Wait about 60 seconds for the project to provision.

### 1.2 Get your API credentials

1. In your Supabase project, go to **Settings** (gear icon in the left sidebar) → **API**.
2. Copy two values:
   - **Project URL** — looks like `https://abcdefghijkl.supabase.co`
   - **anon public** key — a long string starting with `eyJ…`

> **Security note:** The `anon` key is safe to commit to a public GitHub repo. Your Row Level Security (RLS) policies enforce all access control at the database level. Never commit the `service_role` key.

### 1.3 Run the SQL setup script

1. In your Supabase project, click **SQL Editor** in the left sidebar.
2. Click **New query**.
3. Open `supabase-setup.sql` from this folder, copy the entire contents, and paste it into the editor.
4. Click **Run** (or press `Ctrl+Enter` / `Cmd+Enter`).
5. You should see "Success. No rows returned." — this means the tables, policies, and trigger were created.

### 1.4 Create your users

1. In Supabase, go to **Authentication** → **Users**.
2. Click **Add user** → **Create new user**.
3. Create your **admin** user (e.g. `admin@artchelo.com`) with a strong password.
4. Create your **client** user (e.g. `client@artchelo.com`) with a separate password.
5. Both users are automatically given the `client` role by the trigger.

### 1.5 Promote the admin user

1. Go back to **SQL Editor** and run this query (replace the email with your actual admin email):

```sql
UPDATE public.profiles
SET role = 'admin'
WHERE email = 'admin@artchelo.com';
```

2. Verify it worked:

```sql
SELECT email, role FROM public.profiles;
```

You should see one row with `admin` and one with `client`.

---

## Part 2 — Connect Your App to Supabase

1. Open `app.js` in any text editor.
2. Find the configuration block at the very top of the file:

```js
const SUPABASE_URL      = 'https://YOUR_PROJECT_ID.supabase.co';
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_PUBLIC_KEY';
```

3. Replace both placeholder values with the URL and anon key you copied in Step 1.2.
4. Save the file.

---

## Part 3 — Deploy to GitHub Pages

### 3.1 Create a GitHub repository

1. Go to [github.com](https://github.com) and sign in (or create a free account).
2. Click the **+** icon → **New repository**.
3. Name it something like `chelo-tracker`.
4. Set visibility to **Private** (recommended for internal tools) or Public.
5. Do **not** initialise with a README — leave it empty.
6. Click **Create repository**.

### 3.2 Push your files

Open Terminal and run the following commands from the folder containing your four project files:

```bash
git init
git add .
git commit -m "Initial commit: Chelo Project Tracker"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/chelo-tracker.git
git push -u origin main
```

Replace `YOUR_USERNAME` with your actual GitHub username.

### 3.3 Enable GitHub Pages

1. In your GitHub repository, click **Settings** (top tabs).
2. Scroll down to the **Pages** section in the left sidebar.
3. Under **Source**, select **Deploy from a branch**.
4. Set branch to `main` and folder to `/ (root)`.
5. Click **Save**.

GitHub will build and deploy your site. After about 30–60 seconds, your live URL will appear:

```
https://YOUR_USERNAME.github.io/chelo-tracker/
```

---

## Part 4 — Using the Tracker

| User | Access |
|---|---|
| Admin | Login → full dashboard, Add/Edit/Delete buttons visible |
| Client | Login → full dashboard, read-only (no action buttons) |

### Updating content after go-live

Any time you edit `app.js`, `style.css`, or `index.html`:

```bash
git add .
git commit -m "Update: describe your change"
git push
```

GitHub Pages will redeploy automatically within ~30 seconds.

---

## Troubleshooting

**"Could not load your user profile"** on login
→ The trigger may not have run when users were created via the Supabase dashboard (a known edge case). Fix: go to SQL Editor and run:
```sql
INSERT INTO public.profiles (id, email, role)
SELECT id, email, 'client'
FROM auth.users
ON CONFLICT (id) DO NOTHING;
```
Then re-promote your admin as in Step 1.5.

**Blank page on GitHub Pages**
→ Make sure `index.html` is in the root of the repo (not inside a subfolder) and the branch is set to `main`.

**"permission denied" on insert/update/delete**
→ The logged-in user's role is `client`, not `admin`. Double-check the `profiles` table using the verification query in Step 1.5.

**Changes not appearing after push**
→ Hard-refresh the browser (`Ctrl+Shift+R` / `Cmd+Shift+R`) or wait a minute for the CDN cache to clear.
