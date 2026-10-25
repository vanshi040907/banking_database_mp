# banking_database_mp

# Bank Database Project (DBIS Minor Project)

Banking system with a MySQL database, a Node.js + Express backend (Prisma ORM)
and React frontends.

```
banking_db/
├── database/   SQL scripts: schema.sql, procedures.sql, views.sql, seed.sql
├── backend/    Node.js + Express + Prisma API
├── shared/     Design system shared by both portals (theme, components, illustrations)
├── user/       React customer portal   (Vite + Tailwind, port 5173)
├── admin/      React employee portal   (Vite + Tailwind, port 5174)
├── design/     Source artwork for the ballpoint-pen illustrations
└── scripts/    dev-db.sh: project-local MySQL (optional)
```

## 1. Install these first

| Tool | Version | Check with |
|---|---|---|
| Node.js | 22 LTS recommended (18+ works) | `node -v` |
| MySQL Server + Workbench | 8.0.16 or newer | open Workbench and connect |
| Git | any | `git --version` |

## 2. Clone

```
git clone <REPO_URL>
cd banking_db
```

## 3. Set up the database (your own local copy)

The database itself is NOT stored in Git. Everyone builds their own local copy
from the SQL scripts, so the scripts are the single source of truth.

Open **MySQL Workbench**, connect to your local server, and run these
files **in this exact order** (File → Open SQL Script → press the ⚡ button):

1. `database/schema.sql`
2. `database/procedure.sql`
3. `database/views.sql`
4. `database/seed.sql`
5. `database/demo_extras.sql` (optional: adds cards, fixed deposits and a loan so those screens have data)

> Warning: `schema.sql` drops and recreates `bank_db`. Never run it on data you want to keep.

Check it worked:
```sql
USE bank_db;
SHOW TABLES;                          -- 24 tables
SELECT acc_no, balance FROM account;  -- 5 accounts
```

`schema.sql` also creates the MySQL user `bank_app` (password `ChangeMe_App_1`)
that the backend uses. This is a local development password only.

## 4. Set up the backend

```
cd backend
npm install
```

Create your `.env` file by copying the example:
```
copy .env.example .env
```
Then generate your own JWT secret and paste it into `.env` as `JWT_SECRET`:
```
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Generate the Prisma client (reads `prisma/schema.prisma`, no database needed):
```
npx prisma generate
```

Give the seed users a real, known password (`Test@1234`):
```
node scripts/set-test-passwords.js
```

Start the server:
```
npm run dev
```
Open http://localhost:5001/health. (Port 5001, because macOS uses 5000 for AirPlay.) You should see JSON with two branches.


### Optional: run MySQL inside the project folder

If you would rather not install or run MySQL as a system service, this script keeps the whole
database (data, socket, logs, temp files) in `./.local` and listens on port **3307**:

```
scripts/dev-db.sh init     # first time: creates it, loads every SQL file, sets test passwords
scripts/dev-db.sh start    # later sessions
scripts/dev-db.sh stop
scripts/dev-db.sh reset    # wipe bank_db and reload the SQL files
```
Then use `DATABASE_URL="mysql://bank_app:ChangeMe_App_1@localhost:3307/bank_db"` in `backend/.env`.
It needs the `mysqld` binary (for example `brew install mysql`) but never starts the system service.

## 4b. Run the portals

From the project root (one install covers both portals, they share `shared/`):
```
npm install
npm run user      # customer portal  http://localhost:5173
npm run admin     # employee portal  http://localhost:5174
```
The backend must be running too (`cd backend && npm run dev`). Both portals proxy `/api` to port 5001.
In development the one-time code is also shown on the sign-in screen
(`DEV_SHOW_OTP=true` in `backend/.env`); remove that line to only get it from the terminal.

## 5. Test logins (after step 4)

Every seed user has the password `Test@1234`. During development the OTP is
**printed in the backend terminal** (look for `[DEV ONLY] OTP ...`).

| Who | Log in with (employees use their ID, 1 to 8) |
|---|---|
| Customer Vanshika | account no. `1000000001` (has cards, deposits and a loan after `demo_extras.sql`) |
| Customer Sushmita | account no. `1000000002` |
| Customer Adi | account no. `1000000003` |
| Customer Vishruth | account no. `1000000004` |
| Employee 1 | Manager (Indore) |
| Employee 2 | Account Officer (Indore) |
| Employee 3 | Cashier (Indore) |
| Employee 4 | Analyst |
| Employee 5 | Customer Service |
| Employee 6 | Manager (Bhopal) |
| Employee 7 | Account Officer (Bhopal) |
| Employee 8 | Admin |

## 6. Team rules

- **Never commit** `.env`, `node_modules`, or any password or secret. Only `.env.example` goes in Git.
- **Pull before you start work:** `git pull`.
- **Work on your own branch**, then open a pull request into `main`:
  ```
  git checkout -b feature/short-name
  git add .
  git commit -m "what you changed"
  git push -u origin feature/short-name
  ```
- **Changing the database?** Edit the `.sql` files in `database/`, never click-edit tables in Workbench only. Then:
  1. Re-run the SQL files in order.
  2. In `backend/` run `npx prisma db pull` then `npx prisma generate`.
  3. Commit the SQL files AND the updated `backend/prisma/schema.prisma`.
  4. Tell the team to pull, re-run the SQL files and run `npx prisma generate`.
- Prisma is pinned to **version 6**. Do not upgrade it, and do not commit a `prisma.config.ts` file.

## 7. Troubleshooting

| Problem | Fix |
|---|---|
| `Access denied for user 'bank_app'` | You skipped `schema.sql`, or the user/password in `.env` is wrong |
| `Can't reach database server` | MySQL service is not running (Windows → Services) |
| `Environment variable not found: DATABASE_URL` | `.env` is missing, or not inside `backend/` |
| `the URL must start with mysql://` | `DATABASE_URL` in `.env` is wrong, or an old Windows variable named DATABASE_URL overrides it |
| `@prisma/client did not initialize yet` | Run `npx prisma generate` |
| Login says `Invalid credentials` for every user | Run `node scripts/set-test-passwords.js` |
| `db pull` warnings about check constraints | Harmless. MySQL still enforces them |