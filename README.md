# Intern Assignment: Task Manager App

A small full-stack Task Manager where users can register, log in, and manage tasks across three stages: Todo, In Progress, and Done.

## Features

- Register and login flow
- Session-based API access using bearer tokens
- Create, update, and delete tasks
- Task stages: Todo, In Progress, Done
- Responsive board layout
- Loading, empty, and error states
- JSON-file persistence for a lightweight deployable backend

## Tech Stack

- Frontend: HTML, CSS, vanilla JavaScript
- Backend: Node.js built-in HTTP server
- Storage: Local JSON file in `data/store.json`

No external npm dependencies are required.

## Run Locally

```bash
npm start
```

If PowerShell blocks `npm`, run:

```bash
node server.js
```

Open:

```text
http://localhost:3000
```

## API Summary

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/me`
- `GET /api/tasks`
- `POST /api/tasks`
- `PATCH /api/tasks/:id`
- `DELETE /api/tasks/:id`

## Assumptions and Tradeoffs

- Because AI-assisted tooling was used, the assignment note makes backend development mandatory. This project includes a real backend API rather than a frontend-only implementation.
- JSON-file storage is used to keep the project small and easy to review within the expected 3-4 hour scope.
- Passwords are hashed with Node's `crypto.scryptSync`; plain text passwords are not stored.
- Bearer tokens are stored in `localStorage` for simplicity. In a production app, HTTP-only cookies and CSRF protection would be preferable.
- There is no email verification or password reset flow because the assessment asks for a small complete implementation.

## Deployment

Deploy the full app as a Node service on a free platform such as Render, Railway, or Fly.io.

Recommended Render setup:

- Build command: leave empty or use `npm install`
- Start command: `node server.js`
- Environment: Node
- Port: the app uses `process.env.PORT`, so Render can assign the port automatically

Submit the deployed URL as both frontend and backend live link because this single Node service serves the frontend and API together.
