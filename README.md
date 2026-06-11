# Mini CRM Lead Management System

A secure, beginner-friendly Client Lead Management System for tracking website contact form leads from first enquiry to converted client.

## Features

- User accounts with salted password hashes and signed HTTP-only session cookies
- Professional dark neon admin dashboard
- Lead listing with name, email, source, company, priority, follow-up date, status, and timestamps
- Status workflow: `new`, `contacted`, `converted`
- Lead editing for contact details, message, priority, and next follow-up date
- Follow-up notes for each lead
- Search, source filtering, priority filtering, and status filtering
- Dashboard analytics for total leads, due follow-ups, high-priority leads, and conversion rate
- Pipeline health visualization and recent activity feed
- Delete leads from the secure admin panel
- Public lead capture API that mirrors a website contact form
- Persistent file-based JSON database in `data/crm.json`

## Tech Stack

- Frontend: HTML, CSS, JavaScript
- Backend: Node.js HTTP server
- Database: Local JSON data store

This project intentionally avoids external packages, so it can run immediately after cloning with only Node.js installed.

## Setup

1. Install Node.js from https://nodejs.org/
2. Open this project folder in a terminal.
3. Start the CRM:

```bash
npm start
```

4. Visit:

```text
http://localhost:3000
```

## Login

Create an account from the login screen, then sign in with that username and password. Users are stored in `data/crm.json`, and passwords are saved as salted hashes instead of plain text.

Optionally, you can seed one first user with environment variables before the first server start:

```bash
INITIAL_USER=owner INITIAL_PASSWORD=change-this SESSION_SECRET=long-random-secret npm start
```

On Windows PowerShell:

```powershell
$env:INITIAL_USER="owner"
$env:INITIAL_PASSWORD="change-this"
$env:SESSION_SECRET="long-random-secret"
npm start
```

## Public Lead API

Website contact forms can create leads by sending JSON to:

```text
POST /api/public/leads
```

Example body:

```json
{
  "name": "Priya Kapoor",
  "email": "priya@example.com",
  "phone": "+91 90000 00000",
  "company": "Kapoor Events",
  "source": "Website Contact Form",
  "priority": "high",
  "nextFollowUp": "2026-06-15",
  "message": "I need a landing page and lead capture setup."
}
```

New leads automatically start with `new` status and appear in the admin dashboard.

## Admin API Summary

Authenticated admins can use:

```text
GET /api/leads
GET /api/analytics
PATCH /api/leads/:id
POST /api/leads/:id/notes
DELETE /api/leads/:id
```

## Project Structure

```text
.
├── data/
│   └── .gitkeep
├── backend/
│   └── server.js
├── public/
│   ├── app.js
│   ├── index.html
│   └── styles.css
├── .gitignore
├── package.json
└── README.md
```

## Notes

The database file `data/crm.json` is generated automatically the first time the server runs. It is ignored by Git so demo or real lead data is not accidentally committed.
