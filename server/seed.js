import sqlite3 from 'sqlite3';
import bcrypt from 'bcrypt';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

// Activate verbose tracing mode explicitly for ES Module instances
const sqlite = sqlite3.verbose();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.join(__dirname, 'database.sqlite');

// 1. Clean up stale databases
if (fs.existsSync(dbPath)) {
    try {
        fs.unlinkSync(dbPath);
        console.log("-> Removed old database file successfully.");
    } catch (err) {
        console.error("-> Warning: Could not remove old database file:", err);
    }
}

// 2. Open active DB connection instance
const db = new sqlite.Database(dbPath, (err) => {
    if (err) {
        console.error("-> Error opening database connection:", err);
        process.exit(1);
    }
    console.log("-> Success: Connected and created database.sqlite file.");
});

const stationsList = [
  "Tajrish", "Shariati", "Darvazeh Dowlat", "Taleghani", "Panzdah-e Khordad", "Kahrizak",
    "Sadeghieh", "Shademan", "Meydan-e Enghelab", "Baharestan", "Darvazeh Shemiran", "Tehranpars",
    "Azadegan", "Rahahan", "Teatr-e Shahr", "Meydan-e Vali Asr", "Nobonyad", "Ghaem",
    "Ekbatan", "Kolahdouz"
];

const linesData = [
{ name: "Red Line", color: "#D32F2F", stops: ["Tajrish", "Shariati", "Darvazeh Dowlat", "Taleghani", "Panzdah-e Khordad", "Kahrizak"] },
{ name: "Blue Line", color: "#1976D2", stops: ["Sadeghieh", "Shademan", "Meydan-e Enghelab", "Baharestan", "Darvazeh Shemiran", "Tehranpars"] },
{ name: "Green Line", color: "#5fccff", stops: ["Azadegan", "Rahahan", "Teatr-e Shahr", "Meydan-e Vali Asr", "Nobonyad", "Ghaem"] },
{ name: "Yellow Line", color: "#FBC02D", stops: ["Ekbatan", "Shademan", "Teatr-e Shahr", "Darvazeh Dowlat", "Darvazeh Shemiran", "Kolahdouz"] }];

const eventsData = [
    { description: "Quiet journey, seamless transfers.", effect_coins: 0, is_bad_event: 0 },
    { description: "Kind passenger offers you their daily transit voucher.", effect_coins: 1, is_bad_event: 0 },
    { description: "Express train active! Saved travel overhead.", effect_coins: 3, is_bad_event: 0 },
    { description: "Found a forgotten wallet containing minor cash on a bench.", effect_coins: 4, is_bad_event: 0 },
    { description: "Wrong platform direction! Lost time backtracking.", effect_coins: -2, is_bad_event: 1 },
    { description: "Ticket controller inspection fine for expired zone stamp.", effect_coins: -3, is_bad_event: 1 },
    { description: "Baggage stolen by an aggressive bag snatcher!", effect_coins: -4, is_bad_event: 1 },
    { description: "Aggressive or disruptive passenger caused delays.", effect_coins: -1, is_bad_event: 1 }
];

async function runSeeding() {
    try {
        console.log("-> Reading schema.sql contents...");
        const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');

        console.log("-> Executing schema structural tables layout...");
        await new Promise((resolve, reject) => {
            db.exec(schema, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
        console.log("-> System Tables created.");

        console.log("-> Hashing application passwords with bcrypt... (Please wait a moment)");
        const saltRounds = 10;
        const user1Hash = await bcrypt.hash('password123', saltRounds);
        const user2Hash = await bcrypt.hash('password123', saltRounds);
        const user3Hash = await bcrypt.hash('password123', saltRounds);


        console.log("-> Inserting pre-seeded user records...");
        await new Promise((resolve, reject) => {
            db.run(`INSERT INTO users (id, username, password_hash) VALUES (1, 'mohsen', ?), (2, 'Sara', ?), (3, 'Ali', ?)`, 
                [user1Hash, user2Hash, user3Hash], (err) => {
                    if (err) reject(err);
                    else resolve();
                });
        });


        console.log("-> Inserting historical scores dataset...");
        await new Promise((resolve, reject) => {
            db.run(`INSERT INTO game_history (user_id, start_station, destination_station, score) VALUES 
                (1, 'Fermi', 'Bengasi', 24),
                (1, 'Stura', 'Lingotto', 18),
                (2, 'Rivoli', 'Mirafiori', 22)`, (err) => {
                    if (err) reject(err);
                    else resolve();
                });
        });

        console.log("-> Inserting random event profiles...");
        const eventStmt = db.prepare(`INSERT INTO events (description, effect_coins, is_bad_event) VALUES (?, ?, ?)`);
        for (const ev of eventsData) {
            eventStmt.run(ev.description, ev.effect_coins, ev.is_bad_event);
        }
        await new Promise((resolve) => eventStmt.finalize(() => resolve()));

        console.log("-> Inserting system metro station names...");
        const stationStmt = db.prepare(`INSERT INTO stations (name) VALUES (?)`);
        for (const name of stationsList) {
            stationStmt.run(name);
        }
        await new Promise((resolve) => stationStmt.finalize(() => resolve()));

        console.log("-> Establishing route linkages and sequences...");
        for (const line of linesData) {
            const lineId = await new Promise((resolve, reject) => {
                db.run(`INSERT INTO lines (name, color) VALUES (?, ?)`, [line.name, line.color], function(err) {
                    if (err) reject(err);
                    else resolve(this.lastID);
                });
            });

            for (let i = 0; i < line.stops.length; i++) {
                const stopName = line.stops[i];
                const stationId = await new Promise((resolve, reject) => {
                    db.get(`SELECT id FROM stations WHERE name = ?`, [stopName], (err, row) => {
                        if (err) reject(err);
                        else resolve(row.id);
                    });
                });

                await new Promise((resolve, reject) => {
                    db.run(`INSERT INTO line_stations (line_id, station_id, stop_sequence) VALUES (?, ?, ?)`, 
                        [lineId, stationId, i], (err) => {
                            if (err) reject(err);
                            else resolve();
                        });
                });
            }
        }

        console.log("-------------------------------------------------------");
        console.log("🎉 SUCCESS: Database initialization completed safely!");
        console.log("-------------------------------------------------------");

    } catch (error) {
        console.error("❌ CRITICAL: Seeding loop aborted due to an error:", error);
    } finally {
        db.close((err) => {
            if (err) console.error("Error closing database:", err);
            else console.log("-> Connection closed. Safe to proceed.");
        });
    }
}

runSeeding();