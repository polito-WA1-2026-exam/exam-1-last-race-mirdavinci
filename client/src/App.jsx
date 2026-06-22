import React, { useState, useEffect, useRef } from 'react';
import { Container, Navbar, Nav, Button, Card, Row, Col, Alert, Table, Form, ListGroup, Badge } from 'react-bootstrap';
import 'bootstrap/dist/css/bootstrap.min.css';
import { API } from './api';

export default function App() {

  //AUTHENTICATION & NAVIGATION STATE 
  const [user, setUser] = useState(null);
  const [view, setView] = useState('instructions'); // Options: instructions, rankings, game
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [authError, setAuthError] = useState('');

  //GLOBAL DATA DATASETS
  const [rankings, setRankings] = useState([]);
  const [network, setNetwork] = useState({ lines: {} });
  const [allStations, setAllStations] = useState([]); // Added missing state variable for backend station sync

  //GAMEPLAY CORE ENGINE STATE
  const [gameState, setGameState] = useState('idle'); // Options: idle, memo, planning, execution, result
  const [startStation, setStartStation] = useState('');
  const [destStation, setDestStation] = useState('');
  const [segmentsPool, setSegmentsPool] = useState([]);
  const [selectedRoute, setSelectedRoute] = useState([]); // Array of station names tracked in sequence
  const [memoTimer, setMemoTimer] = useState(10);
  const [planTimer, setPlanTimer] = useState(90);

  //SIMULATION STEP REPLAY STATE
  const [executionLogs, setExecutionLogs] = useState([]);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [runningCoins, setRunningCoins] = useState(20);
  const [gameOutcome, setGameOutcome] = useState(null);

  // References to handle interval drops safely across fast phase transitions
  const memoIntervalRef = useRef(null);
  const planIntervalRef = useRef(null);

  useEffect(() => {
    if (memoIntervalRef.current) clearInterval(memoIntervalRef.current);
    if (planIntervalRef.current) clearInterval(planIntervalRef.current);
    
    // 🛡️ Guard Clause: If a user state already exists, do not run the background session check
    if (!user) {
      API.checkSession()
        .then(userProfile => {
          const verified = userProfile?.user || userProfile?.data || userProfile;
          if (verified && verified.username) setUser(verified);
        })
        .catch(() => {
          // If no active session, ensure we stay clear without breaking active components
          setUser(null);
        });
    }
    
    API.getRankings().then(data => setRankings(data)).catch(console.error);
    
    // Dynamic Station Fetching Layer from Server Network Map
    API.getNetwork()
      .then(data => {
        const linesMap = data.lines || data;
        setNetwork(linesMap);

        // Extract every unique station name dynamically from the backend structure
        const uniqueStations = new Set();
        Object.values(linesMap).forEach(lineObj => {
          // This handles both a direct array of stations or an object containing a .stations array
          const stationList = Array.isArray(lineObj) ? lineObj : lineObj.stations;
          if (stationList) {
            stationList.forEach(station => uniqueStations.add(station));
          }
        });

        // Save the dynamic station list to state so the rest of your app can use it
        setAllStations(Array.from(uniqueStations));
      })
      .catch(console.error);
  }, []); // <-- FIXED: Cleanly closed out the lifecycle mounting hook layout block!

  const handleLogin = (e) => {
    e.preventDefault();
    setAuthError('');
    API.login(loginUsername, loginPassword)
      .then(userProfile => {
        console.log("🎯 Raw Login Response:", userProfile);
        
        // Extract user data even if your API wrapper nests it inside an object
        const finalUser = userProfile?.user || userProfile?.data || userProfile;
        
        if (finalUser && finalUser.username) {
          setUser(finalUser);
          setView('instructions');
          setGameState('idle');
        } else {
          console.warn("⚠️ Login returned an unexpected format:", userProfile);
        }
      })
      .catch(err => {
        console.error("❌ Login failed:", err);
        setAuthError(err.message || 'Invalid credentials.');
      });
  };

  const handleLogout = () => {
    API.logout()
      .then(() => {
        setUser(null);
        setView('instructions');
        setGameState('idle');
      })
      .catch(err => {
        console.warn("Logout parse notice:", err.message);
        // Fallback: update state anyway so the user isn't stuck on the screen
        setUser(null);
        setView('instructions');
        setGameState('idle');
      });
  };

  const refreshRankings = () => {
    API.getRankings().then(data => setRankings(data)).catch(console.error);
  };

  const handleStartGame = () => {
    // Aggressively clear active intervals right at the threshold edge
    if (memoIntervalRef.current) clearInterval(memoIntervalRef.current);
    if (planIntervalRef.current) clearInterval(planIntervalRef.current);

    API.startGame()
      .then(gameData => {
        if (!gameData || !gameData.startStation) {
          throw new Error("Invalid initialization payload structured.");
        }
        setStartStation(gameData.startStation);
        setDestStation(gameData.destStation);
        setSegmentsPool(gameData.segments);
        setSelectedRoute([gameData.startStation]); 
        setGameState('memo');
        setMemoTimer(10);
        setView('game');

        memoIntervalRef.current = setInterval(() => {
          setMemoTimer(prev => {
            if (prev <= 1) {
              clearInterval(memoIntervalRef.current);
              startPlanningPhase();
              return 0;
            }
            return prev - 1;
          });
        }, 1000);
      })
      .catch(err => {
        console.error("Critical game launcher failure:", err);
        alert("Failed to start game session. Ensure your backend server is running on port 3001.");
      });
  };

  const startPlanningPhase = () => {
    clearInterval(memoIntervalRef.current);
    if (planIntervalRef.current) clearInterval(planIntervalRef.current);
    setGameState('planning');
    setPlanTimer(90);

    // Setup 90-second active route submission countdown clock
    planIntervalRef.current = setInterval(() => {
      setPlanTimer(prev => {
        if (prev <= 1) {
          clearInterval(planIntervalRef.current);
          forceAutoSubmit();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const selectSegment = (seg) => {
    const currentEndpoint = selectedRoute[selectedRoute.length - 1];
    let nextStation = null;

    if (seg.source === currentEndpoint) nextStation = seg.destination;
    else if (seg.destination === currentEndpoint) nextStation = seg.source;
    else {
      // User selected a node pair that is valid on the network but disconnected from their current sequence chain position
      nextStation = seg.source; 
    }

    setSelectedRoute([...selectedRoute, nextStation]);
    setSegmentsPool(segmentsPool.filter(s => s !== seg)); // Remove chosen pair from pool
  };

  const handleUndoLastStep = () => {
    if (selectedRoute.length <= 1) return;
    const newRoute = [...selectedRoute];
    const removedStation = newRoute.pop();
    const lastRemaining = newRoute[newRoute.length - 1];

    const sourceName = lastRemaining < removedStation ? lastRemaining : removedStation;
    const destName = lastRemaining < removedStation ? removedStation : lastRemaining;
    
    setSelectedRoute(newRoute);
    setSegmentsPool([{ source: sourceName, destination: destName }, ...segmentsPool]);
  };

  const submitRoutePlan = () => {
    // Clear out the planning clock immediately
    if (planIntervalRef.current) clearInterval(planIntervalRef.current);
    
    API.submitRoute(selectedRoute, startStation, destStation)
      .then(result => {
        setGameOutcome(result);
        
        if (result && result.valid) {
          setGameState('execution');
          setExecutionLogs(result.actionsLog || []);
          setCurrentStepIndex(0);
          setRunningCoins(20);
        } else {
          // FORCE state transition to 'result' instantly for invalid routes 
          // This removes the planning board and updates the logout button status!
          setGameState('result');
          setRunningCoins(0);
        }
        refreshRankings();
      })
      .catch(err => {
        console.error("Submission pipeline failure:", err);
        // Safety fallback to prevent UI freezing if the network fails
        setGameState('result');
        setRunningCoins(0);
      });
  };

  const forceAutoSubmit = () => {
    submitRoutePlan();
  };

  const handleNextExecutionStep = () => {
    if (currentStepIndex < executionLogs.length) {
      const stepLog = executionLogs[currentStepIndex];
      setRunningCoins(stepLog.runningTotal);
      setCurrentStepIndex(prev => prev + 1);
    } else {
      setGameState('result');
    }
  };

  //CLIENT-SIDE LIVE DISCONNECTED TRACKING VALIDATOR
  const checkIsRouteDisconnected = () => {
    for (let i = 0; i < selectedRoute.length - 1; i++) {
      const s1 = selectedRoute[i];
      const s2 = selectedRoute[i + 1];
      let directLinkExists = false;

      Object.values(network.lines).forEach(line => {
        const idx1 = line.stations.indexOf(s1);
        const idx2 = line.stations.indexOf(s2);
        if (idx1 !== -1 && idx2 !== -1 && Math.abs(idx1 - idx2) === 1) {
          directLinkExists = true;
        }
      });
      if (!directLinkExists) return true; // Segment does not share a continuous direct connecting transit line layout
    }
    return false;
  };

  const isDisconnected = checkIsRouteDisconnected();

  return (
    <div className="bg-light min-vh-100 pb-5">
      {/* GLOBAL NAVBAR COMPONENT HEADER */}
      <Navbar bg="dark" variant="dark" className="mb-4 px-4 shadow-sm">
        <Navbar.Brand href="#home" onClick={() => { if(gameState==='idle') setView('instructions'); }}>
          🚇 Last Race — Turin Metro SPA
        </Navbar.Brand>
        <Nav className="me-auto">
          <Nav.Link active={view === 'instructions'} onClick={() => { if(gameState==='idle') setView('instructions'); }}>Game Rules</Nav.Link>
          <Nav.Link active={view === 'rankings'} onClick={() => { if(gameState==='idle') setView('rankings'); refreshRankings(); }}>Leaderboard</Nav.Link>
          {user && <Nav.Link active={view === 'game'} onClick={() => setView('game')}>Gameplay Console</Nav.Link>}
        </Nav>
        <Navbar.Collapse className="justify-content-end">
          {user ? (
            <div className="text-white">
              <span className="me-3">👤 Competitor: <strong>{user.username}</strong></span>
              <Button size="sm" variant="outline-danger" onClick={handleLogout} disabled={['memo', 'planning', 'execution'].includes(gameState)}>Logout</Button>
            </div>
          ) : (
            <Form onSubmit={handleLogin} className="d-flex align-items-center gap-2">
              <Form.Control size="sm" type="text" placeholder="Username" value={loginUsername} onChange={e => setLoginUsername(e.target.value)} required />
              <Form.Control size="sm" type="password" placeholder="Password" value={loginPassword} onChange={e => setLoginPassword(e.target.value)} required />
              <Button size="sm" type="submit" variant="success">Login</Button>
              {authError && <Badge bg="danger" className="p-2 position-absolute top-100 end-0 mt-1">{authError}</Badge>}
            </Form>
          )}
        </Navbar.Collapse>
      </Navbar>

      <Container>
        {/* VIEW A: MANUAL INSTRUCTIONS & REFERENCE METRO GUIDE MAP */}
        {view === 'instructions' && (
          <Row>
            <Col md={12} className="mb-4">
              <Card className="shadow-sm border-0">
                <Card.Body>
                  <Card.Title className="fs-3 text-primary mb-2">Race the Rails Challenge Setup</Card.Title>
                  <Card.Text className="text-muted">
                    Navigate from a randomly assigned starting station to your destination station within the Turin underground infrastructure layout. 
                    Reconstruct the map paths completely from memory within the allotted timeframe to score high placements!
                  </Card.Text>
                  {!user && (
                    <Alert variant="warning" className="py-2 mb-0">
                      ℹ️ <strong>Anonymous Site Visitors:</strong> Can review instructions. Please log in with a pre-seeded account profile above to run matches.
                    </Alert>
                  )}
                  {user && gameState === 'idle' && (
                    <Button size="lg" variant="success" className="mt-3 px-4 shadow-sm fw-bold" onClick={handleStartGame}>
                      Launch Faction Journey 🚀
                    </Button>
                  )}
                </Card.Body>
              </Card>
            </Col>

            {user && (
              <Col md={12}>
                <Card className="shadow-sm border-0">
                  <Card.Body>
                    <Card.Title className="text-secondary mb-3">📐 System Reference Metro Infrastructure Map Layout</Card.Title>
                    <Row>
                      {Object.entries(network.lines || network).map(([lineName, lineObj]) => (
                        <Col md={6} key={lineName} className="mb-3">
                          <div className="p-3 border rounded shadow-2xs" style={{ borderLeft: `6px solid ${lineObj.color || '#333'}` }}>
                            <h5 style={{ color: lineObj.color || '#333' }} className="fw-bold">{lineName}</h5>
                            <div className="d-flex flex-wrap gap-1 align-items-center mt-2">
                              {(lineObj.stations || (Array.isArray(lineObj) ? lineObj : [])).map((st, idx, arr) => (
                                <React.Fragment key={st}>
                                  <Badge bg="dark" className="p-2 fs-7">{st}</Badge>
                                  {idx < arr.length - 1 && <span className="text-muted font-monospace">➔</span>}
                                </React.Fragment>
                              ))}
                            </div>
                          </div>
                        </Col>
                      ))}
                    </Row>
                  </Card.Body>
                </Card>
              </Col>
            )}
          </Row>
        )}

        {/* VIEW B: GLOBAL LEADERBOARD RANKINGS */}
        {view === 'rankings' && (
          <Card className="shadow-sm border-0">
            <Card.Body>
              <Card.Title className="fs-3 text-dark mb-3">🏆 Global High-Score Rankings</Card.Title>
              <Table striped bordered hover responsive>
                <thead className="table-dark">
                  <tr>
                    <th>Rank Position</th>
                    <th>Username Profile</th>
                    <th>Personal High Score</th>
                  </tr>
                </thead>
                <tbody>
                  {rankings.map((rk, idx) => (
                    <tr key={idx} className={user && rk.username === user.username ? "table-warning fw-bold" : ""}>
                      <td>{idx + 1}</td>
                      <td>{rk.username} {user && rk.username === user.username && "⭐"}</td>
                      <td>{rk.best_score} 🪙</td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </Card.Body>
          </Card>
        )}

        {/* VIEW C: ACTIVE GAME INTERACTIVE WINDOW */}
        {view === 'game' && (
          <Card className="shadow-sm border-0">
            <Card.Body>
              {/* MEMORIZATION STUDY COMPONENT */}
              {gameState === 'memo' && (
                <div className="text-center py-4">
                  <Alert variant="info" className="fs-4 shadow-sm border-0 bg-primary text-white fw-bold mb-4">
                    ⏳ Study Layout: You have {memoTimer} seconds to memorize the transit paths before they disappear!
                  </Alert>
                  <Button variant="success" size="lg" className="px-5 mb-4 shadow-sm" onClick={startPlanningPhase}>
                    Skip Timer, Let's Plan! 🕹️
                  </Button>
                  <Row className="text-start">
                    {Object.entries(network.lines || network).map(([name, obj]) => (
                      <Col md={6} key={name} className="mb-3">
                        <Card style={{ borderLeft: `6px solid ${obj.color || '#333'}` }} className="border-0 shadow-sm">
                          <Card.Body>
                            <h5 style={{ color: obj.color || '#333' }} className="fw-bold">{name}</h5>
                            <p className="mb-0 text-muted">{(obj.stations || (Array.isArray(obj) ? obj : [])).join(' ➔ ')}</p>
                          </Card.Body>
                        </Card>
                      </Col>
                    ))}
                  </Row>
                </div>
              )}

              {/*ACTIVE TIMER ROUTE PLANNING EDITOR */}
              {gameState === 'planning' && (
                <div>
                  <Row className="mb-4 align-items-center bg-dark text-white p-3 rounded shadow-sm mx-1">
                    <Col>
                      <h5 className="text-muted text-uppercase mb-1 fs-7">Assigned Mission Blueprint Route:</h5>
                      <div className="fs-5 mt-1 d-flex align-items-center gap-2">
                        <Badge bg="success" className="p-2">{startStation}</Badge>
                        <span className="text-muted font-monospace">➔</span>
                        <Badge bg="danger" className="p-2">{destStation}</Badge>
                      </div>
                    </Col>
                    <Col className="text-end">
                      <div className="fs-3 fw-bold text-warning mb-1">⏳ {planTimer}s Remaining</div>
                      <Button variant="primary" className="fw-bold shadow-sm" onClick={submitRoutePlan}>
                        Submit Path Configuration 📤
                      </Button>
                    </Col>
                  </Row>

                  {isDisconnected && (
                    <Alert variant="danger" className="fw-bold shadow-sm border-0">
                      ⚠️ DISCONNECTED SEGMENT ERROR: Adjacent stations in your list do not share a direct line connection! Modify your path or your score will be zero.
                    </Alert>
                  )}

                  <Row>
                    {/* User Selection Sequence Column */}
                    <Col md={5} className="mb-3">
                      <Card className="h-100 border-0 bg-white shadow-sm">
                        <Card.Body>
                          <div className="d-flex justify-content-between align-items-center mb-3">
                            <h6 className="fw-bold text-secondary mb-0">Your Constructed Sequence:</h6>
                            <Button size="sm" variant="outline-secondary" onClick={handleUndoLastStep} disabled={selectedRoute.length <= 1}>
                              ↩️ Undo Step
                            </Button>
                          </div>
                          <ListGroup variant="flush" className="border rounded max-vh-50 overflow-auto">
                            {selectedRoute.map((st, idx) => (
                              <ListGroup.Item key={idx} className="d-flex justify-content-between align-items-center py-2">
                                <div>
                                  <span className="text-muted me-2 font-monospace fs-7">Stop #{idx}:</span>
                                  <strong>{st}</strong>
                                </div>
                                {idx === 0 && <Badge bg="success">START</Badge>}
                                {idx > 0 && idx === selectedRoute.length - 1 && st === destStation && <Badge bg="danger">GOAL ARRIVED</Badge>}
                              </ListGroup.Item>
                            ))}
                          </ListGroup>
                        </Card.Body>
                      </Card>
                    </Col>

                    {/* Shuffled Action Choices Selection Board Column */}
                    <Col md={7} className="mb-3">
                      <Card className="h-100 border-0 bg-white shadow-sm">
                        <Card.Body>
                          <h6 className="fw-bold text-secondary mb-3">🛤️ Select Direct Segment (Completely Shuffled Options Pool):</h6>
                          <div className="overflow-auto pr-1" style={{ maxHeight: '400px' }}>
                            <Row className="g-2">
                              {segmentsPool.map((seg, idx) => (
                                <Col sm={6} key={idx}>
                                  <Button variant="outline-dark" className="w-100 text-truncate text-start font-monospace fs-7 shadow-2xs" onClick={() => selectSegment(seg)}>
                                    🛤️ {seg.source} — {seg.destination}
                                  </Button>
                                </Col>
                              ))}
                            </Row>
                          </div>
                        </Card.Body>
                      </Card>
                    </Col>
                  </Row>
                </div>
              )}

              {/*JOURNEY SIMULATION SCREEN */}
              {gameState === 'execution' && (
                <div className="text-center py-4">
                  <h4 className="text-primary fw-bold mb-2">🚇 Running Journey Simulation Engine...</h4>
                  <div className="display-4 fw-bold text-success mb-4">🪙 Coins Remaining: {runningCoins}</div>
                  
                  <Card className="w-75 mx-auto border-0 bg-dark text-white shadow p-4 mb-4">
                    <h6 className="text-uppercase text-muted fs-7 mb-2">Active Segment:</h6>
                    <div className="fs-4 text-warning fw-bold mb-2">
                      {executionLogs[currentStepIndex - 1]?.segment || "Departing Station Platform..."}
                    </div>
                    <p className="fs-6 text-light opacity-75 mb-3">
                      {executionLogs[currentStepIndex - 1]?.description || "Click below to execute individual stop sequences and record random event data."}
                    </p>
                    {executionLogs[currentStepIndex - 1] && (
                      <div className="fs-6 fw-bold">
                        Outcome Overhead: <span className={executionLogs[currentStepIndex - 1].effect >= 0 ? "text-success" : "text-danger"}>
                          {executionLogs[currentStepIndex - 1].effect >= 0 ? `+${executionLogs[currentStepIndex - 1].effect}` : executionLogs[currentStepIndex - 1].effect} coins
                        </span>
                      </div>
                    )}
                  </Card>

                  <Button variant="success" size="lg" className="px-5 shadow-sm fw-bold" onClick={handleNextExecutionStep}>
                    {currentStepIndex < executionLogs.length ? "Advance to Next Node ➔" : "Compile Score Report 🏁"}
                  </Button>
                </div>
              )}

              {/* MATCHNIGHT MISSION OUTCOME REPORT */}
              {gameState === 'result' && (
                <div className="text-center py-5">
                  <div className="display-1 mb-3">{gameOutcome?.valid ? "🏆" : "💥"}</div>
                  <h2 className="fw-bold mb-2">
                    {gameOutcome?.valid ? "Destination Reached Safely!" : "Invalid Route Map Structure Setup!"}
                  </h2>
                  <h4 className="text-muted mb-4">
                    Final Retained Score Result: <strong className="text-success fs-2">{gameOutcome?.finalScore || 0} Coins</strong>
                  </h4>
                  
                  <div className="d-flex justify-content-center gap-3">
                    <Button variant="primary" size="lg" className="px-4 shadow-sm" onClick={handleStartGame}>
                      Launch Another Match 🔄
                    </Button>
                    <Button variant="outline-dark" size="lg" className="px-4" onClick={() => { setGameState('idle'); setView('instructions'); }}>
                      Return to Main Menu
                    </Button>
                  </div>
                </div>
              )}
            </Card.Body>
          </Card>
        )}
      </Container>
    </div>
  );
}