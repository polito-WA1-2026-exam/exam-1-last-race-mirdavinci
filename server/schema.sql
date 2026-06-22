DROP TABLE IF EXISTS game_history;
DROP TABLE IF EXISTS line_stations;
DROP TABLE IF EXISTS lines;
DROP TABLE IF EXISTS stations;
DROP TABLE IF EXISTS events;
DROP TABLE IF EXISTS users;


CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL
);


CREATE TABLE events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    description TEXT NOT NULL,
    effect_coins INTEGER NOT NULL,
    is_bad_event INTEGER NOT NULL DEFAULT 0
);


CREATE TABLE stations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE
);


CREATE TABLE lines (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    color TEXT NOT NULL
);


CREATE TABLE line_stations (
    line_id INTEGER,
    station_id INTEGER,
    stop_sequence INTEGER NOT NULL,
    PRIMARY KEY (line_id, station_id),
    FOREIGN KEY(line_id) REFERENCES lines(id) ON DELETE CASCADE,
    FOREIGN KEY(station_id) REFERENCES stations(id) ON DELETE CASCADE
);


CREATE TABLE game_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    start_station TEXT NOT NULL,
    destination_station TEXT NOT NULL,
    score INTEGER NOT NULL,
    played_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);