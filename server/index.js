import express from 'express';
import session from 'express-session';
import passport from 'passport';
import { Strategy as LocalStrategy } from 'passport-local';
import bcrypt from 'bcrypt';
import sqlite3 from 'sqlite3';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3001; 

const db = new sqlite3.Database(path.join(__dirname, 'database.sqlite'), (err) => {
    if (err) console.error("❌ Database connection error:", err);
    else {
        console.log("💾 Connected to SQLite database successfully.");
    }
});

//Middleware & CORS Configuration
app.use(cors({
    origin: 'http://localhost:5173',
    credentials: true
}));
app.use(express.json()); 

app.use(session({
    secret: 'torino-secret-key-2026-last-race',
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        secure: false, 
        sameSite: 'lax'
    }
}));

//Passport.js Authentication  
app.use(passport.initialize());
app.use(passport.session());


passport.use(new LocalStrategy((username, password, cb) => {
    db.get('SELECT * FROM users WHERE username = ?', [username], (err, row) => {
        if (err) return cb(err);
        

        if (!row) return cb(null, false, { message: 'Wrong username or password.' }); 


        bcrypt.compare(password, row.password_hash, (err, isMatch) => {
            if (err) return cb(err);
            

            if (!isMatch) return cb(null, false, { message: 'Wrong username or password.' }); 
            

            const user = { id: row.id, username: row.username };
            return cb(null, user);
        });
    });
}));

passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser((id, done) => {
    db.get('SELECT id, username FROM users WHERE id = ?', [id], (err, user) => done(err, user));
});

const isLoggedIn = (req, res, next) => {
    if (req.isAuthenticated()) return next();
    return res.status(401).json({ error: 'User is unauthenticated.' });
};



app.post('/api/login', passport.authenticate('local'), (req, res) => {
    res.json({ id: req.user.id, username: req.user.username });
});

app.delete('/api/logout', (req, res) => {
    req.logout((err) => {
        if (err) return res.status(500).json({ error: 'Logout sequence failed.' });
        res.end();
    });
});

app.get('/api/session', (req, res) => {
    if (req.isAuthenticated()) res.json(req.user);
    else res.status(401).json({ error: 'No active session.' });
});

app.get('/api/rankings', (req, res) => {
    const query = `
        SELECT u.username, MAX(g.score) as best_score 
        FROM game_history g
        JOIN users u ON g.user_id = u.id
        GROUP BY u.id
        ORDER BY best_score DESC
    `;
    db.all(query, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// Fetch Full Map Structure
app.get('/api/network', (req, res) => {
    const query = `
        SELECT l.name as line_name, l.color, s.name as station_name, ls.stop_sequence
        FROM line_stations ls
        JOIN lines l ON ls.line_id = l.id
        JOIN stations s ON ls.station_id = s.id
        ORDER BY l.id, ls.stop_sequence
    `;
    db.all(query, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        
        const lines = {};
        rows.forEach(row => {
            if (!lines[row.line_name]) {
                lines[row.line_name] = { color: row.color, stations: [] };
            }
            lines[row.line_name].stations.push(row.station_name);
        });
        res.json({ lines });
    });
});

// Helper functions for path distance graph checking
function buildAdjacencyList(lines) {
    const adj = {};
    Object.values(lines).forEach(line => {
        for (let i = 0; i < line.stations.length - 1; i++) {
            const s1 = line.stations[i];
            const s2 = line.stations[i + 1];
            if (!adj[s1]) adj[s1] = new Set();
            if (!adj[s2]) adj[s2] = new Set();
            adj[s1].add(s2);
            adj[s2].add(s1);
        }
    });
    return adj;
}

function getShortestDistance(start, dest, adj) {
    const queue = [[start, 0]];
    const visited = new Set([start]);
    while (queue.length > 0) {
        const [current, dist] = queue.shift();
        if (current === dest) return dist;
        for (const neighbor of (adj[current] || [])) {
            if (!visited.has(neighbor)) {
                visited.add(neighbor);
                queue.push([neighbor, dist + 1]);
            }
        }
    }
    return -1;
}


app.post('/api/game/start', isLoggedIn, (req, res) => {
    const query = `
        SELECT l.name as line_name, l.color, s.name as station_name, ls.stop_sequence
        FROM line_stations ls
        JOIN lines l ON ls.line_id = l.id
        JOIN stations s ON ls.station_id = s.id
    `;
    
    db.all(query, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });

        const networkLines = {};
        const uniqueStations = new Set();
        
        rows.forEach(row => {
            uniqueStations.add(row.station_name);
            if (!networkLines[row.line_name]) {
                networkLines[row.line_name] = { color: row.color, stations: [] };
            }
            networkLines[row.line_name].stations.push(row.station_name);
        });

        const stationsArray = Array.from(uniqueStations);
        const adj = buildAdjacencyList(networkLines);

        let startStation, destStation;
        let validPair = false;


        while (!validPair) {
            startStation = stationsArray[Math.floor(Math.random() * stationsArray.length)];
            destStation = stationsArray[Math.floor(Math.random() * stationsArray.length)];
            
            if (startStation !== destStation) {
                const distance = getShortestDistance(startStation, destStation, adj);
                if (distance >= 3) validPair = true;
            }
        }

        const segmentsSet = new Set();
        Object.values(networkLines).forEach(line => {
            for (let i = 0; i < line.stations.length - 1; i++) {
                const pair = [line.stations[i], line.stations[i + 1]].sort();
                segmentsSet.add(`${pair[0]}—${pair[1]}`);
            }
        });

        // Map and shuffle completely
        let segmentsArray = Array.from(segmentsSet).map(str => {
            const [source, destination] = str.split('—');
            return { source, destination };
        });
        segmentsArray.sort(() => Math.random() - 0.5);

        // Send one response to the client
        res.json({
            startStation,
            destStation,
            segments: segmentsArray
        });
    });
});

// Process Route Validations & Apply Random Events 
app.post('/api/game/submit', isLoggedIn, (req, res) => {
    const { route, startStation, destStation } = req.body; 
    

    if (!route || route.length < 2 || route[0] !== startStation || route[route.length - 1] !== destStation) {
        return res.json({ valid: false, finalScore: 0, actionsLog: [] });
    }

    const networkQuery = `
        SELECT l.name as line_name, s.name as station_name, ls.stop_sequence
        FROM line_stations ls
        JOIN lines l ON ls.line_id = l.id
        JOIN stations s ON ls.station_id = s.id
    `;

    db.all(networkQuery, [], (err, networkRows) => {
        if (err) return res.status(500).json({ error: err.message });

        db.all('SELECT * FROM events', [], (err, eventRows) => {
            if (err) return res.status(500).json({ error: err.message });

            const goodEvents = eventRows.filter(e => e.is_bad_event === 0);
            const badEvents = eventRows.filter(e => e.is_bad_event === 1);

            let currentCoins = 20; 
            const actionsLog = [];
            let isValidPath = true;

            const linesMap = {};
            networkRows.forEach(row => {
                if (!linesMap[row.line_name]) linesMap[row.line_name] = [];
                linesMap[row.line_name].push(row.station_name);
            });


            for (let i = 0; i < route.length - 1; i++) {
                const s1 = route[i];
                const s2 = route[i + 1];

                let structuralLinkExists = false;
                Object.values(linesMap).forEach(stations => {
                    const idx1 = stations.indexOf(s1);
                    const idx2 = stations.indexOf(s2);
                    if (idx1 !== -1 && idx2 !== -1 && Math.abs(idx1 - idx2) === 1) {
                        structuralLinkExists = true;
                    }
                });

                if (!structuralLinkExists) {
                    isValidPath = false;
                    break;
                }

                // fatigue probability modifier
                let chosenEvent;
                if (i >= 4) {
                    chosenEvent = Math.random() < 0.75 
                        ? badEvents[Math.floor(Math.random() * badEvents.length)]
                        : goodEvents[Math.floor(Math.random() * goodEvents.length)];
                } else {
                    chosenEvent = eventRows[Math.floor(Math.random() * eventRows.length)];
                }

                currentCoins += chosenEvent.effect_coins; 
                actionsLog.push({
                    step: i + 1,
                    segment: `${s1} ➔ ${s2}`,
                    description: chosenEvent.description,
                    effect: chosenEvent.effect_coins,
                    runningTotal: currentCoins
                });
            }

            const finalScore = isValidPath ? Math.max(0, currentCoins) : 0;

            db.run(`INSERT INTO game_history (user_id, start_station, destination_station, score) VALUES (?, ?, ?, ?)`,
                [req.user.id, startStation, destStation, finalScore], (insertErr) => {
                    if (insertErr) console.error("History write error:", insertErr);
                    
                    res.json({
                        valid: isValidPath,
                        finalScore,
                        actionsLog: isValidPath ? actionsLog : []
                    });
                });
        });
    });
});

app.listen(PORT, () => {
    console.log(`🚀 Express network listening securely on http://localhost:${PORT}`);
});