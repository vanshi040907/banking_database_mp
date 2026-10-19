# banking_database_mp

# Bank Database Project (DBIS Minor Project)

Banking system with a MySQL database, a Node.js + Express backend (Prisma ORM)
and React frontends.

```
banking_db/
├── database/   SQL scripts: schema.sql, procedures.sql, views.sql, seed.sql
├── backend/    Node.js + Express + Prisma API
├── user/       React customer portal   (coming soon)
└── admin/      React employee portal   (coming soon)
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

Open **MySQL Workbench**, connect to your local server, and run these four
files **in this exact order** (File → Open SQL Script → press the ⚡ button):

1. `database/schema.sql`
2. `database/procedures.sql`
3. `database/views.sql`
4. `database/seed.sql`

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
Open http://localhost:5000/health. You should see JSON with two branches.

## 5. Test logins (after step 4)

Every seed user has the password `Test@1234`. During development the OTP is
**printed in the backend terminal** (look for `[DEV ONLY] OTP ...`).

| Who | Log in with |
|---|---|
| Customer Vanshika | account no. `1000000001` |
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