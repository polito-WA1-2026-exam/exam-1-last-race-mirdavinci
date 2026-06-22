# Exam 1: "WA1_exam1_LastRace"

## Student: S358509 MIRDAR HARIJANI MOHSEN 

## React Client Application Routes

*(Note: This application utilizes state-based conditional rendering via the `view` state within a single page, rather than using `react-router-dom`)*

- **Route `/`**: Main application container. Dynamically renders the following views based on user state:
  - `Instructions View`: Displays game rules and the static reference map of the Tehran Metro network.
  - `Rankings View`: Fetches and displays the global high-score leaderboard.
  - `Game Console View`: Manages the interactive gameplay loop (Memorization Timer, Route Planning, Simulation Execution, and Result Summary).

## API Server

- **POST `/api/login`**
  - **Request body content:** JSON object containing `{ "username": "...", "password": "..." }`
  - **Response body content:** JSON user object `{ "id": 1, "username": "mohsen" }` on success, or `401 Unauthorized` on failure.
- **POST `/api/logout`**
  - **Request parameters:** None (uses session cookie)
  - **Response body content:** JSON success message `{ "message": "Logged out successfully" }`.
- **GET `/api/session`**
  - **Request parameters:** None (uses session cookie)
  - **Response body content:** JSON user object of the currently authenticated user.
- **GET `/api/network`**
  - **Request parameters:** None
  - **Response body content:** JSON object mapping the metro lines and their respective ordered station arrays (e.g., `{ "lines": { "Red Line": ["Tajrish", ...], ... } }`).
- **GET `/api/game/start`**
  - **Request parameters:** None (Requires active session)
  - **Response body content:** JSON object containing the mission parameters: `{ "startStation": "...", "destStation": "...", "segments": [...] }` (segments are completely shuffled).
- **POST `/api/game/submit`**
  - **Request body content:** JSON object containing `{ "selectedRoute": ["A", "B", "C"], "startStation": "A", "destStation": "C" }`
  - **Response body content:** JSON object containing the gameplay outcome: `{ "valid": true/false, "finalScore": 20, "actionsLog": [...] }`.
- **GET `/api/rankings`**
  - **Request parameters:** None
  - **Response body content:** JSON array of objects representing the leaderboard `{ "username": "...", "best_score": 24 }`.

## Database Tables

- **Table `users`** - contains `id` (PK), `username` (UNIQUE), and `password_hash`.
- **Table `events`** - contains `id` (PK), `description`, `effect_coins` (integer), and `is_bad_event` (boolean integer).
- **Table `stations`** - contains `id` (PK) and `name` (UNIQUE).
- **Table `lines`** - contains `id` (PK), `name` (UNIQUE), and `color`.
- **Table `line_stations`** - Junction table representing the graph structure. Contains `line_id` (FK), `station_id` (FK), and `stop_sequence`.
- **Table `game_history`** - contains `id` (PK), `user_id` (FK), `start_station`, `destination_station`, `score`, and `played_at` timestamp.

## Main React Components

- `App` (in `App.jsx`): The core unified component that manages the entire application state. It handles authentication (`user`), navigation (`view`), and the complex gameplay engine (`gameState`, `timers`, and `simulation logs`). It dynamically renders the Navigation Bar, Instructions Panel, Leaderboard Table, and the interactive Route Editor.

## Screenshot

![Screenshot](./img/screenshot.jpg)

## Users Credentials

- `mohsen`, `password123` 
- `Sara`, `password123` 
- `Ali`, `password123` 

## Use of AI Tools
I used Google Gemini as an educational debugging assistant while working on this project. Specifically, I used it to help resolve cross-origin resource sharing (CORS) and express-session cookie preservation issues between Vite and my backend. I also used it to format and debug strict SQLite table generation syntax for my `schema.sql` file, and to help structure the React `setInterval` hooks for the 10-second memorization timer. All AI-suggested code was thoroughly reviewed, manually tested, and adapted to ensure it strictly met the project rubric, particularly the Breadth-First Search (BFS) distance algorithm and the progressive luck/probability system.
