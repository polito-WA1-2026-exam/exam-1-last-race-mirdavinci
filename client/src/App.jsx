import React, { useState, useEffect, useRef } from 'react';
import { Container, Navbar, Nav, Button, Card, Row, Col, Alert, Table, Form, ListGroup, Badge } from 'react-bootstrap';
import 'bootstrap/dist/css/bootstrap.min.css';
import { API } from './api';

// Dynamic helper function to color-code map headers (Tehran Metro)
const getLineColor = (lineName) => {
  const lower = lineName.toLowerCase();
  if (lower.includes('red')) return '#D32F2F';
  if (lower.includes('blue')) return '#1976D2';
  if (lower.includes('green')) return '#388E3C';
  if (lower.includes('yellow')) return '#FBC02D';
  return '#424242';
};

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
  const [allStations, setAllStations] = useState([]); 

  //GAMEPLAY CORE ENGINE STATE
  const [gameState, setGameState] = useState('idle'); 
  const [startStation, setStartStation] = useState('');
  const [destStation, setDestStation] = useState('');
  const [segmentsPool, setSegmentsPool] = useState([]);
  const [selectedRoute, setSelectedRoute] = useState([]); 
  const [memoTimer, setMemoTimer] = useState(10);
  const [planTimer, setPlanTimer] = useState(90);

  //SIMULATION STEP REPLAY STATE
  const [executionLogs, setExecutionLogs] = useState([]);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [runningCoins, setRunningCoins] = useState(20);
  const [gameOutcome, setGameOutcome] = useState(null);

  const memoIntervalRef = useRef(null);
  const planIntervalRef = useRef(null);

  useEffect(() => {
    if (memoIntervalRef.current) clearInterval(memoIntervalRef.current);
    if (planIntervalRef.current) clearInterval(planIntervalRef.current);
    
    if (!user) {
      API.checkSession()
        .then(userProfile => {
          const verified = userProfile?.user || userProfile?.data || userProfile;
          if (verified && verified.username) setUser(verified);
        })
        .catch(() => {
          setUser(null);
        });
    }
    
    API.getRankings().then(data => setRankings(data)).catch(console.error);
    
    API.getNetwork()
      .then(data => {
        const linesMap = data.lines || data;
        setNetwork(linesMap);

        const uniqueStations = new Set();
        Object.values(linesMap).forEach(lineObj => {
          const stationList = Array.isArray(lineObj) ? lineObj : lineObj.stations;
          if (stationList) {
            stationList.forEach(station => uniqueStations.add(station));
          }
        });

        setAllStations(Array.from(uniqueStations));
      })
      .catch(console.error);
  }, []);

  const handleLogin = (e) => {
    e.preventDefault();
    setAuthError('');
    API.login(loginUsername, loginPassword)
      .then(userProfile => {
        const finalUser = userProfile?.user || userProfile?.data || userProfile;
        if (finalUser && finalUser.username) {
          setUser(finalUser);
          setView('instructions');
          setGameState('idle');
        }
      })
      .catch(err => {
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
      .catch(() => {
        setUser(null);
        setView('instructions');
        setGameState('idle');
      });
  };

  const refreshRankings = () => {
    API.getRankings().then(data => setRankings(data)).catch(console.error);
  };

  const handleStartGame = () => {
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
        console.error(err);
        alert("Failed to start game session.");
      });
  };

  const startPlanningPhase = () => {
    clearInterval(memoIntervalRef.current);
    if (planIntervalRef.current) clearInterval(planIntervalRef.current);
    setGameState('planning');
    setPlanTimer(90);

    planIntervalRef.current = setInterval(() => {
      setPlanTimer(prev => {
        if (prev <= 1) {
          clearInterval(planIntervalRef.current);
          submitRoutePlan();
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
      nextStation = seg.source; 
    }

    setSelectedRoute([...selectedRoute, nextStation]);
    setSegmentsPool(segmentsPool.filter(s => s !== seg)); 
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
          setGameState('result');
          setRunningCoins(0);
        }
        refreshRankings();
      })
      .catch(() => {
        setGameState('result');
        setRunningCoins(0);
      });
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

  const checkIsRouteDisconnected = () => {
    const linesMap = network?.lines || network;
    if (!linesMap || Object.keys(linesMap).length === 0) return false;

    for (let i = 0; i < selectedRoute.length - 1; i++) {
      const s1 = selectedRoute[i];
      const s2 = selectedRoute[i + 1];
      let directLinkExists = false;

      Object.values(linesMap).forEach(line => {
        const stationsArray = Array.isArray(line) ? line : line?.stations;
        if (!stationsArray) return;

        const idx1 = stationsArray.indexOf(s1);
        const idx2 = stationsArray.indexOf(s2);
        if (idx1 !== -1 && idx2 !== -1 && Math.abs(idx1 - idx2) === 1) {
          directLinkExists = true;
        }
      });
      if (!directLinkExists) return true; 
    }
    return false;
  };

  const isDisconnected = checkIsRouteDisconnected();

const navigateTo = (targetView) => {

    //kill timer if we are leaving the game
    if (targetView !== 'game') {
      if (memoIntervalRef.current) clearInterval(memoIntervalRef.current);
      if (planIntervalRef.current) clearInterval(planIntervalRef.current);
      setGameState('idle');
    }
    
    setView(targetView);
    
    if (targetView === 'rankings') {
      refreshRankings();
    }
  };

  return (
    <div className="bg-light min-vh-100 pb-5">

      <Navbar bg="dark" variant="dark" className="mb-4 px-4 shadow-sm">
       <Navbar.Brand href="#home" onClick={() => navigateTo('instructions')}>
  🚇 Last Race — Metro Network Console
</Navbar.Brand>
<Nav className="me-auto">
  <Nav.Link active={view === 'instructions'} onClick={() => navigateTo('instructions')}>
    Game Rules
  </Nav.Link>
  <Nav.Link active={view === 'rankings'} onClick={() => navigateTo('rankings')}>
    Leaderboard
  </Nav.Link>
  {user && <Nav.Link active={view === 'game'} onClick={() => navigateTo('game')}>
    Gameplay Console
  </Nav.Link>}
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
        {/* VIEW A:REFERENCE METRO GUIDE MAP */}
        {view === 'instructions' && (
          <Row>
            <Col md={12} className="mb-4">
              <Card className="shadow-sm border-0">
                <Card.Body>
                  <Card.Title className="fs-3 text-primary mb-2">Race the Rails Challenge Setup</Card.Title>
                  <Card.Text className="text-muted">
                    Navigate from a randomly assigned starting station to your destination station within the underground infrastructure layout. 
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
                      {Object.entries(network?.lines || network || {}).map(([lineName, lineData]) => {
                        const stations = Array.isArray(lineData) ? lineData : lineData?.stations || [];
                        return (
                          <Col md={6} key={lineName} className="mb-3">
                            <div className="p-3 border rounded shadow-sm bg-white" style={{ borderLeft: `6px solid ${getLineColor(lineName)}` }}>
                              <h5 style={{ color: getLineColor(lineName) }} className="fw-bold">{lineName}</h5>
                              <div className="d-flex flex-wrap gap-1 align-items-center mt-2">
                                {stations.map((station, index) => (
                                  <React.Fragment key={station}>
                                    <Badge bg="dark" className="p-2 fs-7">{station}</Badge>
                                    {index < stations.length - 1 && <span className="text-muted font-monospace">➔</span>}
                                  </React.Fragment>
                                ))}
                              </div>
                            </div>
                          </Col>
                        );
                      })}
                    </Row>
                  </Card.Body>
                </Card>
              </Col>
            )}
          </Row>
        )}

        {/*GLOBAL LEADERBOARD RANKINGS */}
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


        {view === 'game' && (
          <Card className="shadow-sm border-0">
            <Card.Body>

              {gameState === 'idle' && (
                <div className="text-center py-5">
                  <h4 className="text-muted mb-4">No active transit mission.</h4>
                  <Button size="lg" variant="success" className="px-4 shadow-sm fw-bold" onClick={handleStartGame}>
                    Launch Faction Journey 🚀
                  </Button>
                </div>
              )}

              {gameState === 'memo' && (
                <div className="text-center py-4">
                  <Alert variant="info" className="fs-4 shadow-sm border-0 bg-primary text-white fw-bold mb-4">
                    ⏳ Study Layout: You have {memoTimer} seconds to memorize the transit paths before they disappear!
                  </Alert>
                  <Button variant="success" size="lg" className="px-5 mb-4 shadow-sm" onClick={startPlanningPhase}>
                    Skip Timer, Let's Plan! 🕹️
                  </Button>
                  <Row className="text-start">
                    {Object.entries(network?.lines || network || {}).map(([lineName, lineData]) => {
                      const stations = Array.isArray(lineData) ? lineData : lineData?.stations || [];
                      return (
                        <Col md={6} key={lineName} className="mb-3">
                          <Card style={{ borderLeft: `6px solid ${getLineColor(lineName)}` }} className="border-0 shadow-sm">
                            <Card.Body>
                              <h5 style={{ color: getLineColor(lineName) }} className="fw-bold">{lineName}</h5>
                              <p className="mb-0 text-muted">{stations.join(' ➔ ')}</p>
                            </Card.Body>
                          </Card>
                        </Col>
                      );
                    })}
                  </Row>
                </div>
              )}

              {/*ACTIVE TIMER ROUTE PLANNING EDITOR */}
              {gameState === 'planning' && (
                <div>

                  <div className="mb-4 p-3 bg-white rounded shadow-sm border">
                    <h6 className="fw-bold text-secondary mb-2">📍 Unlinked Station Reference Board:</h6>
                    <div className="d-flex flex-wrap gap-2">
                      {allStations.map((station, idx) => (
                        <Badge bg="light" text="dark" className="p-2 border fs-7" key={idx}>
                          {station}
                        </Badge>
                      ))}
                    </div>
                  </div>

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