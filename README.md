# FeeFlow – School Management System

Your original FeeFlow pages, now connected to a real backend: login with roles, a database,
fee payments with auto-numbered receipts, attendance, PDF reports, and student/parent portals.

**Stack:** Node.js + Express, SQLite database (a single file, no database server to install), plain HTML/CSS/JS frontend.

---

## 1. Run it on your computer

1. Install **Node.js 20 or newer** (LTS) from https://nodejs.org
2. Open a terminal in this folder and run:

```bash
npm install
npm start
```

3. Open **http://localhost:3000**

On the first start the database is created automatically and filled with your 10 demo students.

### Demo logins (first start only – change these!)

| Role    | Username / email                      | Password         | Sees                                   |
|---------|---------------------------------------|------------------|----------------------------------------|
| Admin   | `admin` or `admin@feeflow.edu`        | `Admin@12345`    | Everything                             |
| Student | `STU001` (Brian Mwangi)               | `Student@12345`  | Own fees, receipts, attendance only    |
| Parent  | `parent1` or `parent1@feeflow.edu`    | `Parent@12345`   | Linked children only                   |

Use **Change password** (bottom-left of the sidebar) after logging in.

---

## 2. What each page does now

| Page | What changed |
|------|--------------|
| **Login** | Real login (passwords are hashed). Sends you to the right page for your role. |
| **Dashboard** | Totals, attendance rate and recent payments are calculated from the database. |
| **Students Fees & Payments** | **+ Record Payment** (auto receipt number, blocks overpayment) and **+ Add Student** (creates the student's login, and the parent's if you enter an email). Search box added. |
| **Receipts** | Full list; **Print Receipt** opens a clean printable receipt. |
| **Attendance** | Pick any date, click a status to toggle, **Save Attendance**. |
| **Reports** | Real totals and working **Download PDF** buttons (Fee Collection, Fee Balances, Attendance). |
| **Student / Parent portal** | Show the logged-in person's own data only. Parents can download a fee statement PDF. Admins can preview either portal for any student. |

### Things I fixed from the original static pages
The old pages had numbers typed in by hand, and some didn't add up. The backend now **calculates** everything:

- Brian Mwangi showed balance 69,000 and "Cleared" – correct is **66,400** and **Pending** (a student is "Cleared" only when balance is 0).
- The receipts table had a "Year" value sitting in the "Amount" column, receipts 083 and 084 appeared twice, and 087 was a receipt for KSh 0. Fixed (no receipt is created for a zero payment).
- Dashboard said 1,248 students / 8.4M collected; the data only has 10 students. The dashboard now shows the real figures.
- Reports totals didn't match the table (expected 1,085,600, not 1,104,100; collected 456,500, not 461,500).

Money is stored as whole shillings (no cents).

---

## 3. Project layout

```
server/            backend code
  index.js           starts the server
  app.js             Express setup + security headers
  db.js              database tables, demo data, fee calculations
  middleware.js      login checks and role checks
  pdf.js             PDF report generator
  routes/            auth, students, payments (+receipts), attendance, reports, portal, dashboard
public/            the website (HTML, CSS, js/)
scripts/           create-admin.js
test/              automated tests
```

Run the automated tests any time with `npm test`.

---

## 4. Put it on GitHub

1. Create a free account at https://github.com and click **New repository**. Name it (e.g. `feeflow`), leave
   "Add a README" **unticked**, and click **Create repository**.
2. Install Git from https://git-scm.com if you don't have it.
3. In a terminal inside this project folder:

```bash
git init
git add .
git commit -m "FeeFlow: frontend + backend"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/YOUR-REPO.git
git push -u origin main
```

(GitHub will ask you to sign in the first time – use a browser login or a Personal Access Token as the password.)

The included `.gitignore` keeps your **database (`data/`), `.env` secrets and `node_modules/` out of GitHub** – that is
important, because the database contains real student information.

> **Important:** GitHub *stores* your code, but it does **not run** a Node backend. (GitHub Pages only serves static
> files, so the login and database would not work there.) To put the site online, use section 5.

---

## 5. Put it online (so others can use it)

Any host that runs Node.js works. Render, Railway and Fly.io are common choices. The steps are similar:

1. Connect the host to your GitHub repository.
2. **Build command:** `npm install` **Start command:** `npm start`
3. Set these environment variables on the host:
   - `NODE_ENV` = `production`
   - `JWT_SECRET` = a long random string (generate: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`)
   - `DB_PATH` = a path on a **persistent disk/volume** (e.g. `/var/data/feeflow.db`). Without a persistent disk the
     database is wiped on every redeploy.
   - `SEED_DEMO_DATA` = `false`
4. Create your real admin from the host's shell: `npm run create-admin -- yourname@school.ac.ke "A-strong-password"`
5. Serve it over **HTTPS** (hosts do this automatically). Login cookies are only sent over HTTPS in production mode.

---

## 6. Security notes

- Passwords are hashed (bcrypt); login cookie is HttpOnly + SameSite=Strict; login attempts are rate-limited (10 per 15 min).
- Every API call checks the user's role. Students and parents can only open their own records.
- New student/parent accounts get a random temporary password, shown **once** to the admin, and the user must change it at first login.
- Change the demo passwords or set `SEED_DEMO_DATA=false` before going live.
- Back up `data/feeflow.db` regularly (copy the file).

## 7. Ideas for next steps
M-Pesa (Daraja) payment integration, SMS/email fee reminders, editing/deleting students, terms/semesters with separate fee structures, CSV import of students.
