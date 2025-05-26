import {
    db,
    doc,
    collection,
    onSnapshot,
    getDoc,
    getDocs,
    setDoc,
    updateDoc,
    deleteDoc,
    writeBatch,
    auth
  } from './firebase-config.js';

import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-auth.js";
import SecurityService from './security.js';
import CardDealer from './code-dealer.js';
  
// --------- INITIALIZATION ---------

// Get URL parameters
const params = new URLSearchParams(window.location.search);
const roomId = params.get("roomId");
const playerUID = params.get("player");

// Debugging: Log parameters
// console.log("Room ID:", roomId);
// console.log("Player UID:", playerUID);
  
// Get localStorage data
let joinedRoomId = localStorage.getItem("joinedRoomId");
let joinedPlayerUID = localStorage.getItem("joinedPlayerUID");

// If localStorage is empty but URL parameters exist, use them instead
if ((!joinedRoomId || !joinedPlayerUID) && roomId && playerUID) {
    // Save parameters to localStorage
    localStorage.setItem("joinedRoomId", roomId);
    localStorage.setItem("joinedPlayerUID", playerUID);
    joinedRoomId = roomId;
    joinedPlayerUID = playerUID;
}

// Debugging: Log localStorage data
// console.log("Stored Room ID:", joinedRoomId);
// console.log("Stored Player UID:", joinedPlayerUID);

// Protect direct access - simplified check
if (!roomId || !playerUID) {
    alert("Missing required parameters");
    window.location.href = "index.html";
} 
  
  // Global variables
  let playerData = null;
  let gameData = null;
  let isMyTurn = false;
  let isHost = false;
  let allPlayerUIDs = [];
  let playerPositions = {};
  let myPosition = null;
  let positionToElement = {};
  let securityService = null;
  let cardDealer = null;
  
  // Protect direct access
//   if (!roomId || !playerUID || roomId !== joinedRoomId || playerUID !== joinedPlayerUID) {
//     alert("Access denied. You cannot access the room directly.");
//     window.location.href = "index.html";
//   }
  
  // Initialize position to element mapping
  function initializePositionMapping() {
    positionToElement = {
      1: {
        position: "player-bottom",
        handClass: "yellow",
        isMe: true
      },
      2: {
        position: "player-right",
        handClass: "orange",
        isMe: false
      },
      3: {
        position: "player-top",
        handClass: "orange",
        isMe: false
      },
      4: {
        position: "player-left",
        handClass: "orange",
        isMe: false
      }
    };
  }
  
  // --------- AUTHENTICATION & SECURITY ---------
  
  // Examine Firebase Auth
  onAuthStateChanged(auth, async (user) => {
    if (!user || user.uid !== playerUID) {
      alert("Unauthorized access");
      window.location.href = "index.html";
      return;
    }
  
    // Verify player in room
    const playerRef = doc(db, "games", roomId, "players", playerUID);
    const playerSnap = await getDoc(playerRef);
  
    if (!playerSnap.exists()) {
      alert("You are not a participant in this room.");
      window.location.href = "index.html";
      return;
    }
  
    playerData = playerSnap.data();
    
    // Verify room exists
    const roomRef = doc(db, "rooms", roomId);
    const roomSnap = await getDoc(roomRef);
    
    if (!roomSnap.exists()) {
      alert("The room no longer exists.");
      window.location.href = "index.html";
      return;
    }
    
    const roomData = roomSnap.data();
    isHost = roomData.hostUID === playerUID;
    
    // Initialize the game
    initializeGame();
  });
  
  // --------- GAME INITIALIZATION ---------
  
async function initializeGame() {
    try {
      // console.log("Initializing game...");
      
      initializePositionMapping();
      // console.log("Position mapping initialized");
      
      // Firebase
      try {
        const testRef = doc(db, "test_access", "test_document");
        await setDoc(testRef, { timestamp: new Date(), test: true });
        console.log("Firebase access test successful");
      } catch (accessError) {
        console.error("Firebase access test failed:", accessError);
        alert("Cannot access Firebase. Check your connection and permissions.");
        return;
      }
      
      try {
        const playerRef = doc(db, "games", roomId, "players", playerUID);
        const playerDoc = await getDoc(playerRef);
        
        if (!playerDoc.exists()) {
          console.log("Player not in game, adding player");
          await setDoc(playerRef, {
            name: "Player " + playerUID.substring(0, 5),
            money: 10000,
            bet: 0,
            roundBet: 0,
            status: "waiting",
            revealed: false,
            cards: []
          });
          console.log("Player added to game");
        } else {
          console.log("Player already in game");
        }
        
        if (typeof CardDealer !== 'undefined') {
          cardDealer = new CardDealer(roomId);
          // console.log("Card dealer initialized");
        } else {
          // console.log("CardDealer not available");
        }

        if (typeof SecurityService !== 'undefined') {
          securityService = new SecurityService(roomId, playerUID);
          // console.log("Security service initialized");
        } else {
          // console.log("SecurityService not available");
        }

        const gameRef = doc(db, "games", roomId);
        let gameSnap = await getDoc(gameRef);

        if (!gameSnap.exists() && isHost) {
            await setDoc(gameRef, {
                phase: "waiting",
                pot: 0,
                communityCards: [],
                currentTurn: "",
                currentCallAmount: 0,
                winnerDeclared: false,
                players: {},
                playerPositions: {}
            });
            console.log("Game document was missing — created.");
            gameSnap = await getDoc(gameRef);
        }
                
        setupEventListeners();
        // console.log("Event listeners set up");
        
        setUpRealTimeListeners();
        // console.log("Real-time listeners set up");
        
        console.log("Starting auto game in 3 seconds");
        setTimeout(() => autoStartGame(), 3000);
        
        // console.log("Game initialization complete");
      } catch (gameError) {
        console.error("Game setup error:", gameError);
        throw gameError; 
      }
    } catch (error) {
      console.error("Error initializing game:", error);
      alert("There was a problem initializing the game: " + error.message);
    }
}
  
async function initializePlayerPositions() {
    if (!isHost) return;
    
    try {
      const playersRef = collection(db, "games", roomId, "players");
      const playersSnap = await getDocs(playersRef);
      
      const playerIds = [];
      playersSnap.forEach(doc => {
        playerIds.push(doc.id);
      });
      
      const positions = {};
      playerIds.forEach((id, index) => {
        positions[id] = index + 1;
      });
      
      const playerData = {};
      playersSnap.forEach(doc => {
        playerData[doc.id] = doc.data();
      });
      
      const gameRef = doc(db, "games", roomId);
      await updateDoc(gameRef, {
        playerPositions: positions,
        players: playerData
      });
      
      // console.log("Player positions initialized:", positions);
    } catch (error) {
      console.error("Error initializing player positions:", error);
    }
}
  
function setupEventListeners() {
    document.getElementById("callBtn").addEventListener("click", () => handleCall());
    document.getElementById("raiseBtn").addEventListener("click", () => toggleRaiseBox());
    document.getElementById("foldBtn").addEventListener("click", () => handleFold());
    document.getElementById("leaveRoomBtn").addEventListener("click", () => leaveRoom());
    document.getElementById("closeWinnerBtn").addEventListener("click", () => closeWinnerPanel());
    document.getElementById("startNewRoundBtn").addEventListener("click", () => startNewRound());
    document.getElementById("newGameBtn").addEventListener("click", () => startNewRound());
}
  
// --------- REALTIME LISTENERS ---------

function setUpRealTimeListeners() {
    // console.log("Setting up realtime listeners...");
    
    try {
      const handleListenerError = (error, type) => {
        console.error(`Error in ${type} listener:`, error);
        
        if (error.code === "permission-denied") {
          console.log(`Permission denied for ${type} listener. The game might need to be recreated.`);
          
          if (isHost) {
            alert("There was a permission issue. The game will be reset.");
            resetGame();
          } else {
            alert("There was a permission issue. Please ask the host to restart the game.");
          }
        }
      };
      
      const gameRef = doc(db, "games", roomId);
      const gameUnsubscribe = onSnapshot(gameRef, 
        (docSnap) => {
          if (!docSnap.exists()) {
            console.log("Game document doesn't exist");
            
            if (isHost) {
              console.log("Host is recreating the game");
              createNewGame();
            } else {
              alert("Game has been closed or doesn't exist.");
              window.location.href = "index.html";
            }
            return;
          }
  
          gameData = docSnap.data();
          updateGameDisplay();
          checkTurn();
        },
        (error) => handleListenerError(error, "game")
      );
  
      const roomRef = doc(db, "rooms", roomId);
      const roomUnsubscribe = onSnapshot(roomRef,
        (docSnap) => {
          if (!docSnap.exists()) {
            console.log("Room doesn't exist");
            
            if (isHost) {
              console.log("Host is recreating the room");
              createNewRoom();
            } else {
              alert("Room has been closed by the host.");
              window.location.href = "index.html";
            }
            return;
          }
        },
        (error) => handleListenerError(error, "room")
      );
  
      const playersCol = collection(db, "games", roomId, "players");
      const playersUnsubscribe = onSnapshot(playersCol,
        (snapshot) => {
          allPlayerUIDs = [];
          if (!gameData.players) gameData.players = {}; // 👈 กัน null กรณี snapshot เร็วเกิน
      
          snapshot.forEach((doc) => {
            const playerId = doc.id;
            allPlayerUIDs.push(playerId);
            const data = doc.data();
      
            gameData.players[playerId] = data;
            // console.log("Updated gameData.players from snapshot:", gameData.players);
      
            if (playerId === playerUID) {
              playerData = data;
            }
          });
      
          updatePlayersDisplay();
        },
        (error) => handleListenerError(error, "players")
      );
      
    
      window.unsubscribeListeners = () => {
        gameUnsubscribe();
        roomUnsubscribe();
        playersUnsubscribe();
        // console.log("All listeners unsubscribed");
      };
      
      // console.log("All realtime listeners set up successfully");
    } catch (error) {
      // console.error("Error setting up listeners:", error);
      alert("There was a problem connecting to the game. Please refresh the page.");
    }
}
  
  // --------- UI UPDATES ---------
  
  function updateGameDisplay() {
    if (!gameData) return;
  
    // Update pot amount
    document.getElementById("potAmount").textContent = `TOTAL POT $${gameData.pot}`;
    
    // Update game phase
    document.getElementById("gamePhase").textContent = convertPhaseToDisplay(gameData.phase);
    
    // Update current call amount
    document.getElementById("currentCall").textContent = `Current Call: $${gameData.currentCallAmount}`;
    
    // Update turn display
    updateTurnDisplay();
    
    // Update community cards
    updateCommunityCards();
    
    // Update player cards and info
    updatePlayersDisplay();
    
    // Check if winner is declared
    if (gameData.winnerDeclared) {
      showWinnerPanel();
    }
  }
  
function convertPhaseToDisplay(phase) {
    switch(phase) {
      case "preflop": return "Pre-Flop";
      case "flop": return "Flop";
      case "turn": return "Turn";
      case "river": return "River";
      case "showdown": return "Showdown";
      case "waiting": return "Waiting";
      case "ended": return "Game Ended";
      default: return phase;
    }
}
  
function updateTurnDisplay() {
    if (!gameData) return;
    
    const turnPlayerName = gameData.currentTurn && gameData.players[gameData.currentTurn] ? 
      gameData.players[gameData.currentTurn].name || "Unknown Player" : 
      "Waiting...";
    
    document.getElementById("turnDisplay").textContent = `${turnPlayerName}'s Turn`;
    
    const controlsDiv = document.getElementById("controls");
    isMyTurn = gameData.currentTurn === playerUID;
    
    if (isMyTurn && gameData.phase !== "ended" && gameData.phase !== "showdown" && gameData.phase !== "waiting") {
      controlsDiv.style.display = "flex";
      updateActionButtons();
    } else {
      controlsDiv.style.display = "none";
      document.getElementById("raiseBox").style.display = "none";
    }
    
    if (isHost && (gameData.phase === "ended" || gameData.phase === "showdown")) {
      document.getElementById("startNewRoundBtn").style.display = "block";
    } else {
      document.getElementById("startNewRoundBtn").style.display = "none";
    }
}

function updateCommunityCards() {
    const communityCardsDiv = document.getElementById("communityCards");
    communityCardsDiv.innerHTML = "";
    
    if (!gameData) {
      // console.log("No game data for community cards update");
      return;
    }
    
    console.log(`Updating community cards for phase: ${gameData.phase}`);
    
    if (gameData.phase === "waiting" || gameData.phase === "ended") {
      for (let i = 0; i < 5; i++) {
        const cardDiv = document.createElement("div");
        cardDiv.className = "card pink";
        communityCardsDiv.appendChild(cardDiv);
      }
      return;
    }
    
    const visibleCards = gameData.communityCards || [];
    let displayCount = 0;
    
    switch (gameData.phase) {
      case "preflop": displayCount = 0; break;
      case "flop": displayCount = 3; break;
      case "turn": displayCount = 4; break;
      case "river": case "showdown": displayCount = 5; break;
      default: displayCount = 0;
    }
    
    // console.log(`Visible cards: ${displayCount}, Available: ${visibleCards.length}`);
    
    // 
    for (let i = 0; i < displayCount; i++) {
      if (i < visibleCards.length) {
        const card = visibleCards[i];
        const cardDiv = document.createElement("div");
        cardDiv.className = "card";
        cardDiv.textContent = formatCard(card);
        cardDiv.classList.add(getCardColor(card));
        communityCardsDiv.appendChild(cardDiv);
      } else {
        // 
        const cardDiv = document.createElement("div");
        cardDiv.className = "card pink";
        communityCardsDiv.appendChild(cardDiv);
      }
    }
    
    // 
    for (let i = displayCount; i < 5; i++) {
      const cardDiv = document.createElement("div");
      cardDiv.className = "card pink";
      communityCardsDiv.appendChild(cardDiv);
    }
}
  
async function updatePlayersDisplay() {
    if (!gameData || !gameData.playerPositions || !gameData.players) {
      console.log("Missing game data for player display update");
      return;
    }

    // if (playerId === playerUID || (gameData.phase === 'showdown' && player.revealed)) {
    //     const handDiv = playerEl.querySelector(".hand");
    //     handDiv.innerHTML = '';
    //     (player.cards || []).forEach(card => {
    //         const cardDiv = document.createElement("div");
    //         cardDiv.className = `card ${positionData.handClass}`;
    //         cardDiv.textContent = formatCard(card);
    //         handDiv.appendChild(cardDiv);
    //     });
    
    //     if (player.handName) {
    //         const label = document.createElement("div");
    //         label.className = "highcard-label";
    //         label.textContent = player.handName;
    //         handDiv.appendChild(label);
    //     }
    // }

    // if (gameData.phase === 'showdown') {
    //     playerHandDiv.innerHTML = '';
    //     (player.cards || []).forEach(card => {
    //       const cardEl = createCardElement(card);
    //       playerHandDiv.appendChild(cardEl);
    //     });
    //   }
      
      
  
    console.log("Updating player display...");
  
    document.querySelectorAll(".player").forEach(el => {
      el.style.display = "none";
      const positionTag = el.querySelector(".position-tag");
      if (positionTag) positionTag.remove();
    });
  
    myPosition = gameData.playerPositions[playerUID];
    if (!myPosition) {
      console.error("Could not find current player's position");
      return;
    }
  
    const tablePositions = gameData.tablePositions || assignTablePositions();
  
    const activePlayers = [];
    for (const uid of Object.keys(gameData.players)) {
      const playerRef = doc(db, "games", roomId, "players", uid);
      const latestSnap = await getDoc(playerRef);
      if (latestSnap.exists()) {
        gameData.players[uid] = latestSnap.data();
      }
  
      const player = gameData.players[uid];
      if (player && player.status !== "folded") {
        activePlayers.push(uid);
      }
    }
  
    for (const uid of Object.keys(gameData.players)) {
      const player = gameData.players[uid];
      if (!player) continue;
  
      const position = gameData.playerPositions[uid];
      const visualPosition = getVisualPosition(position);
      const positionData = positionToElement[visualPosition];
      const playerEl = document.querySelector(`.${positionData.position}`);
      if (!playerEl) continue;
  
      playerEl.style.display = "flex";
  
      if (uid === tablePositions.dealer) {
        const tag = document.createElement("div");
        tag.className = "position-tag";
        tag.textContent = "D";
        playerEl.appendChild(tag);
      } else if (uid === tablePositions.smallBlind) {
        const tag = document.createElement("div");
        tag.className = "position-tag";
        tag.textContent = "SB";
        playerEl.appendChild(tag);
      } else if (uid === tablePositions.bigBlind) {
        const tag = document.createElement("div");
        tag.className = "position-tag";
        tag.textContent = "BB";
        playerEl.appendChild(tag);
      }
  
      playerEl.querySelector(".info").innerHTML = `${player.name}<br>$${player.money || 0}${uid === playerUID ? " [ME]" : ""}`;
      playerEl.querySelector(".bet").textContent = `Total Bet: $${player.bet || 0}`;
  
      // 
      const handDiv = playerEl.querySelector(".hand");
      handDiv.innerHTML = "";
      const cards = player.cards || [];
  
    //   if (shouldShowCards) {
    //     console.log(`Rendering hand cards for ${player.name}:`, cards);  
    //     for (const card of cards) {
    //         const cardDiv = document.createElement("div");
    //         cardDiv.className = `card ${getCardColor(card)}`;
    //         cardDiv.textContent = formatCard(card);
    //         handDiv.appendChild(cardDiv);
    //     }
    // }
    // for (const card of cards) {
    //     console.log("formatCard for", card, "is", formatCard(card));  
    //     const cardDiv = document.createElement("div");
    //     cardDiv.className = `card ${positionData.handClass}`;
    //     cardDiv.textContent = formatCard(card);
    //     handDiv.appendChild(cardDiv);
    //   }
      
      if (uid === playerUID || (gameData.phase === "showdown" && player.revealed)) {
        for (const card of cards) {
          const cardDiv = document.createElement("div");
          cardDiv.className = `card ${getCardColor(card.suit)}`;
          cardDiv.textContent = formatCard(card);
          handDiv.appendChild(cardDiv);
        }
      
        if (player.handName) {
          const label = document.createElement("div");
          label.className = "highcard-label";
          label.textContent = player.handName;
          handDiv.appendChild(label);
        }
      } else {
        for (let i = 0; i < 2; i++) {
          const cardDiv = document.createElement("div");
          cardDiv.className = "card back";
          handDiv.appendChild(cardDiv);
        }
      }

    //   if (uid === playerUID || (gameData.phase === "showdown" && player.revealed)) {
    //     for (const card of cards) {
    //       const cardDiv = document.createElement("div");
    //       cardDiv.className = `card ${positionData.handClass}`;
    //       cardDiv.textContent = formatCard(card);
    //       handDiv.appendChild(cardDiv);
    //     }
  
    //     if (player.handName) {
    //       const label = document.createElement("div");
    //       label.className = "highcard-label";
    //       label.textContent = player.handName;
    //       handDiv.appendChild(label);
    //     }
    //   } else {
    //     for (let i = 0; i < 2; i++) {
    //       const cardDiv = document.createElement("div");
    //       cardDiv.className = `card ${positionData.handClass}`;
    //       handDiv.appendChild(cardDiv);
    //     }
    //   }
  
      // Highlighter
      if (uid === gameData.currentTurn) playerEl.classList.add("current-turn");
      else playerEl.classList.remove("current-turn");
  
      if (player.status === "folded") playerEl.classList.add("folded");
      else playerEl.classList.remove("folded");
    }
  }
  



function getVisualPosition(actualPosition) {
    if (!myPosition) return actualPosition;
    
    // 
    const maxPlayers = 4;
    let relativePosition = (actualPosition - myPosition + maxPlayers) % maxPlayers;
    
    return relativePosition === 0 ? 4 : relativePosition;
}

// --------- CARD FORMATTING ---------
  
function formatCard(card) {
    if (!card) return "";
    
    const value = card.value;
    const suit = card.suit;
    
    let valueDisplay;
    switch(value) {
      case 14: valueDisplay = "A"; break;
      case 13: valueDisplay = "K"; break;
      case 12: valueDisplay = "Q"; break;
      case 11: valueDisplay = "J"; break;
      default: valueDisplay = value;
    }
    
    let suitDisplay;
    switch(suit) {
      case "hearts": suitDisplay = "♥"; break;
      case "diamonds": suitDisplay = "♦"; break;
      case "clubs": suitDisplay = "♣"; break;
      case "spades": suitDisplay = "♠"; break;
      default: suitDisplay = suit;
    }
    
    return `${valueDisplay}${suitDisplay}`;
}
  

async function handleCall() {
    if (!gameData || !playerUID) return;
  
    const playerRef = doc(db, "games", roomId, "players", playerUID);
    const playerData = gameData.players?.[playerUID];
    const currentCall = gameData.currentCallAmount || 0;
  
    const myBet = playerData?.roundBet || 0;
    const toCall = currentCall - myBet;
  
    if (toCall > playerData.money) {
      console.warn("Cannot call: not enough money");
      return;
    }
  
    const newMoney = playerData.money - toCall;
    const newTotalBet = (playerData.bet || 0) + toCall;
    const newRoundBet = (playerData.roundBet || 0) + toCall;
  
    console.log(`Executing ${toCall > 0 ? "CALL" : "CHECK"} with amount $${toCall}`);
    console.log(`Player money before: $${playerData.money}, after: $${newMoney}`);
    console.log(`Bet before: $${playerData.bet}, after: $${newTotalBet}`);
  
    await updateDoc(playerRef, {
      money: newMoney,
      bet: newTotalBet,
      roundBet: newRoundBet,
      status: toCall === 0 ? "checked" : "called"
    });
  
    const latestPlayerSnap = await getDoc(playerRef);
    if (latestPlayerSnap.exists()) {
      gameData.players[playerUID] = latestPlayerSnap.data();
    }
  
    if (isHost) {
      const potRef = doc(db, "games", roomId);
      await updateDoc(potRef, {
        pot: (gameData.pot || 0) + toCall
      });
      console.log(`Pot updated from $${gameData.pot} to $${(gameData.pot || 0) + toCall}`);
    }
  
    await advanceTurn();  
  
    updateActionButtons();  // 
  }
  


 // Called from the HTML button
 window.submitRaise = async function() {
    if (!isMyTurn || !gameData || !playerData) return;
    
    const raiseInput = document.getElementById("raiseInput");
    const raiseAmount = parseInt(raiseInput.value);
    const currentCall = gameData.currentCallAmount || 0;
    const myBet = playerData.roundBet || 0;
    const toCall = currentCall - myBet;
    const extraAmount = raiseAmount - toCall; 
    const minRaise = Math.max(20, toCall + 20); 
    
    if (isNaN(raiseAmount) || raiseAmount < minRaise) {
        alert(`Minimum raise is $${minRaise}`);
        return;
    }
    
    if (raiseAmount > playerData.money) {
        alert("You don't have enough money for this raise!");
        return;
    }
    
    try {
        console.log(`Executing raise of $${raiseAmount} (call $${toCall} + raise $${extraAmount})`);
        const currentTurn = gameData.currentTurn;
        const totalBetAmount = (playerData.bet || 0) + raiseAmount;
        const newMoney = playerData.money - raiseAmount;
        
        console.log(`Player money before: $${playerData.money}, after: $${newMoney}`);
        console.log(`Bet before: $${playerData.bet || 0}, roundBet: ${myBet}, after total: $${totalBetAmount}, roundBet: ${myBet + raiseAmount}`);
        const playerRef = doc(db, "games", roomId, "players", playerUID);
        await updateDoc(playerRef, {
            bet: totalBetAmount,
            roundBet: myBet + raiseAmount,
            money: newMoney,
            status: "raised"
        });

        const latestPlayerSnap = await getDoc(playerRef);
        if (latestPlayerSnap.exists()) {
            playerData = latestPlayerSnap.data(); 
        }
        
        const gameRef = doc(db, "games", roomId);
        await updateDoc(gameRef, {
            pot: gameData.pot + raiseAmount,
            currentCallAmount: myBet + raiseAmount
        });
        
        console.log(`Pot updated from $${gameData.pot} to $${gameData.pot + raiseAmount}`);
        console.log(`Current call amount updated to $${myBet + raiseAmount}`);
        
        document.getElementById("raiseBox").style.display = "none";
        const updatedGameSnap = await getDoc(gameRef);
        if (updatedGameSnap.exists() && updatedGameSnap.data().currentTurn === currentTurn) {
            
            await advanceTurn();
        } else {
            console.log("Turn already advanced by another player or system");
        }
    } catch (error) {
        console.error("Error handling raise:", error);
        alert("Failed to raise: " + error.message);
    }
};
  
function updateActionButtons() {
    if (!gameData || !playerData) {
      console.log("Missing data for action button update");
      return;
    }
    
    const callBtn = document.getElementById("callBtn");
    const raiseBtn = document.getElementById("raiseBtn");
    const foldBtn = document.getElementById("foldBtn");
    const raiseInput = document.getElementById("raiseInput");
    
    const currentCall = gameData.currentCallAmount || 0;
    const myBet = playerData.roundBet || 0;
    const toCall = Math.max(0, currentCall - myBet);
    
    console.log(`Current call: ${currentCall}, My bet: ${myBet}, To call: ${toCall}`);

    if (toCall === 0) {
      callBtn.textContent = "CHECK";
      callBtn.classList.remove("call-button");
      callBtn.classList.add("check-button");
    } else {
      callBtn.textContent = `CALL ${toCall}`;
      callBtn.classList.remove("check-button");
      callBtn.classList.add("call-button");
    }
    
    if (toCall > playerData.money) {
      callBtn.disabled = true;
      callBtn.classList.add("disabled");
    } else {
      callBtn.disabled = false;
      callBtn.classList.remove("disabled");
    }
    
    const minRaise = Math.max(20, toCall + 20);
    raiseInput.min = minRaise;
    raiseInput.value = minRaise;
    
    if (playerData.money < minRaise) {
      raiseBtn.disabled = true;
      raiseBtn.classList.add("disabled");
    } else {
      raiseBtn.disabled = false;
      raiseBtn.classList.remove("disabled");
    }
    
    if (toCall === 0) {
      foldBtn.classList.add("secondary-button");
    } else {
      foldBtn.classList.remove("secondary-button");
    }
  }
  
  function toggleRaiseBox() {
    const raiseBox = document.getElementById("raiseBox");
    
    if (raiseBox.style.display === "none" || !raiseBox.style.display) {
      raiseBox.style.display = "flex";
      
      // Set default raise amount
      const raiseInput = document.getElementById("raiseInput");
      const currentCall = gameData?.currentCallAmount || 0;
      const myBet = playerData?.roundBet || 0;
      const toCall = currentCall - myBet;
      const minRaise = Math.max(20, toCall * 2);
      
      raiseInput.min = minRaise;
      raiseInput.value = minRaise;
      document.getElementById("raiseInput").focus();
    } else {
      raiseBox.style.display = "none";
    }
  }
  
window.submitRaise = async function() {
    if (!isMyTurn || !gameData || !playerData) return;
    
    const raiseInput = document.getElementById("raiseInput");
    const raiseAmount = parseInt(raiseInput.value);
    
    // Validate raise amount
    const currentCall = gameData.currentCallAmount || 0;
    const myBet = playerData.roundBet || 0;
    const toCall = currentCall - myBet;
    const minRaise = Math.max(20, toCall * 2);
    
    if (isNaN(raiseAmount) || raiseAmount < minRaise) {
      alert(`Minimum raise is $${minRaise}`);
      return;
    }
    
    if (raiseAmount > playerData.money) {
      alert("You don't have enough money for this raise!");
      return;
    }
    
    try {
      const currentTurn = gameData.currentTurn;
      
      // Update player's bet and money
      const playerRef = doc(db, "games", roomId, "players", playerUID);
      await updateDoc(playerRef, {
        bet: playerData.bet + raiseAmount,
        roundBet: myBet + raiseAmount,
        money: playerData.money - raiseAmount,
        status: "raised"
      });
      
      // Update game pot and call amount
      const gameRef = doc(db, "games", roomId);
      await updateDoc(gameRef, {
        pot: gameData.pot + raiseAmount,
        currentCallAmount: myBet + raiseAmount
      });
      
      // Hide raise box
      document.getElementById("raiseBox").style.display = "none";
      
      const updatedGameSnap = await getDoc(gameRef);
      if (updatedGameSnap.exists() && updatedGameSnap.data().currentTurn === currentTurn) {
        // Move to next player
        gameData = updatedGameSnap.data();
        await advanceTurn();
        updatePlayersDisplay();
      } else {
        console.log("Turn already advanced by another player or system");
      }
    } catch (error) {
      console.error("Error handling raise:", error);
      alert("Failed to raise: " + error.message);
    }
};
  
async function handleFold() {
    if (!isMyTurn || !gameData || !playerData) {
      console.log("Not your turn or missing data");
      return;
    }
    
    try {
      console.log("Player folding");
      const currentTurn = gameData.currentTurn;
      const playerRef = doc(db, "games", roomId, "players", playerUID);
      await updateDoc(playerRef, {
        status: "folded"
      });

      const latestPlayerSnap = await getDoc(playerRef);
        if (latestPlayerSnap.exists()) {
            playerData = latestPlayerSnap.data(); 
        }
      const gameRef = doc(db, "games", roomId);
      const updatedGameSnap = await getDoc(gameRef);
    if (updatedGameSnap.exists() && updatedGameSnap.data().currentTurn === currentTurn) {
        gameData = updatedGameSnap.data(); 
        await advanceTurn();
    } else {
        console.log("Turn already advanced by another player or system");
      }
    } catch (error) {
      console.error("Error handling fold:", error);
      alert("Failed to fold: " + error.message);
    }
}
  
// Called from the HTML button
window.fold = async function(roomId, playerUid) {
    await handleFold();
};
  
// --------- GAME FLOW ---------

async function advanceTurn() {
    if (!gameData) return;
    
    try {
        // const currentPlayerId = gameData.currentTurn;
        // const currentPlayerObj = gameData.players[currentPlayerId];
        // console.log("advanceTurn called. Current turn:", currentPlayerObj?.name || currentPlayerId);
        
        
        const playerIds = Object.keys(gameData.playerPositions || {});
        const activePlayers = [];
        const playerStatus = {};
        
        for (const playerId of Object.keys(gameData.players)) {
            const playerRef = doc(db, "games", roomId, "players", playerId);
            const latestSnap = await getDoc(playerRef);
            if (latestSnap.exists()) {
            gameData.players[playerId] = latestSnap.data();
            }
        }
        const playerBets = {};
        
        const positionToPlayer = new Map();
        
        playerIds.forEach(playerId => {
            const position = gameData.playerPositions[playerId];
            positionToPlayer.set(position, playerId);
        });
        

        const positions = Array.from(positionToPlayer.keys()).sort((a, b) => a - b);
        

        const orderedPlayers = [];
        for (const position of positions) {
            const playerId = positionToPlayer.get(position);
            orderedPlayers.push(playerId);
            

            if (gameData.players[playerId]) {
                const player = gameData.players[playerId];
                playerStatus[playerId] = player.status;
                playerBets[playerId] = player.roundBet || 0;
                

                if (player.status !== "folded") {
                    activePlayers.push(playerId);
                }
            }
        }
        
        // console.log(`Active players: ${activePlayers.length}`);
        // console.log("Player bets:", playerBets);
        

        if (activePlayers.length === 1) {
            // console.log(`Only one player remains: ${activePlayers[0]}`);
            await declareWinner(activePlayers[0], "Last player standing");
            return;
        }
        

        const currentIndex = activePlayers.indexOf(gameData.currentTurn);
        

        let nextIndex;
        if (currentIndex === -1) {

            nextIndex = 0;
        } else {
            nextIndex = (currentIndex + 1) % activePlayers.length;
        }
        
        const nextPlayer = activePlayers[nextIndex];
        // console.log(`Current turn index: ${currentIndex}, next index: ${nextIndex}, next player: ${nextPlayer}`);
        
        let roundComplete = false;

        if (nextIndex === 0 && currentIndex !== -1) {
            // console.log("Back to first player, checking if bets are equal");
            
            let allBetsEqual = true;
            const targetBet = gameData.currentCallAmount;
            
            for (const playerId of activePlayers) {
                const bet = gameData.players[playerId].roundBet || 0;
                if (bet !== targetBet) {
                  // console.log(`Player ${playerId} has roundBet ${bet}, expected ${targetBet}`);
                  allBetsEqual = false;
                  break;
                }
              }
              
              const allActed = activePlayers.every(p => {
                const s = gameData.players[p].status;
                return s === "called" || s === "checked" || s === "raised";
              });

              if (allBetsEqual && allActed) {
                const currentIndex = activePlayers.indexOf(gameData.currentTurn);
                const nextIndex = (currentIndex + 1) % activePlayers.length;
                console.log("All bets are equal and everyone has acted. Advancing phase...");
                await advancePhase();
                return;
                // if (nextIndex === 0) {
                //   console.log("Round complete. Advancing to next phase.");
                //   await advancePhase();
                //   return;
                // }
              }
        }
        
        if (gameData.phase === "river" && roundComplete) {
            console.log("River phase complete, advancing to showdown");
            await advancePhase();
            return;
        }
        
        if (roundComplete) {
            console.log("Round complete, advancing to next phase");
            await advancePhase();
            return;
        }
        
        if (nextPlayer === gameData.currentTurn) {
            console.warn("Next player is the same as current turn, forcing advance to next phase");
            await advancePhase();
            return;
        }
        
        // console.log(`Setting next player turn: ${nextPlayer}`);
        const gameRef = doc(db, "games", roomId);
        await updateDoc(gameRef, {
            currentTurn: nextPlayer
        });
    } catch (error) {
        console.error("Error advancing turn:", error);
    }
}


async function advancePhase() {
    if (!gameData) return;
  
    try {
      const gameRef = doc(db, "games", roomId);
      let nextPhase;
      let newCommunityCards = gameData.communityCards || [];
      const activePlayers = [];

      for (const playerId in gameData.players) {
        if (gameData.players[playerId].status !== "folded") {
          activePlayers.push(playerId);
        }
      }
  
      let firstActivePlayer = null;
      if (activePlayers.length > 0) {
        const orderedActivePlayers = [...activePlayers].sort((a, b) => {
          return (gameData.playerPositions[a] || 0) - (gameData.playerPositions[b] || 0);
        });
        firstActivePlayer = orderedActivePlayers[0];
      }
  
      switch (gameData.phase) {
        case "waiting":
          nextPhase = "preflop";
          if (isHost) {
            try {
              if (cardDealer) {
                await cardDealer.dealPlayerHands();
              } else {
                await dealCards();
              }
            } catch (error) {
              console.error("Error dealing player cards:", error);
            }
          }
          break;
  
        case "preflop":
          nextPhase = "flop";
          if (isHost) {
            try {
              newCommunityCards = cardDealer
                ? await cardDealer.dealCommunityCards(3, newCommunityCards) || []
                : generateCommunityCards(3, newCommunityCards);
            } catch (error) {
              console.error("Error dealing flop cards:", error);
              newCommunityCards = generateCommunityCards(3, newCommunityCards);
            }
          }
          break;
  
        case "flop":
          nextPhase = "turn";
          if (isHost) {
            try {
              newCommunityCards = cardDealer
                ? await cardDealer.dealCommunityCards(1, newCommunityCards) || []
                : generateCommunityCards(1, newCommunityCards);
            } catch (error) {
              console.error("Error dealing turn card:", error);
              newCommunityCards = generateCommunityCards(1, newCommunityCards);
            }
          }
          break;
  
        case "turn":
          nextPhase = "river";
          if (isHost) {
            try {
              newCommunityCards = cardDealer
                ? await cardDealer.dealCommunityCards(1, newCommunityCards) || []
                : generateCommunityCards(1, newCommunityCards);
            } catch (error) {
              console.error("Error dealing river card:", error);
              newCommunityCards = generateCommunityCards(1, newCommunityCards);
            }
          }
          break;
  
        case "river":
          nextPhase = "showdown";
          await handleShowdown();
          return;
  
        case "showdown":
          nextPhase = "ended";
          break;
  
        default:
          nextPhase = "waiting";
      }
  
      for (const playerId in gameData.players) {
        if (gameData.players[playerId].status !== "folded") {
          const playerRef = doc(db, "games", roomId, "players", playerId);
          await updateDoc(playerRef, {
            roundBet: 0,
            status: "waiting"
          });
        }
      }
  
      if (isHost) {
        const updateData = {
          phase: nextPhase,
          currentTurn: firstActivePlayer,
          currentCallAmount: 0, 
          communityCards: newCommunityCards
        };
        const firstPlayerObj = gameData.players[firstActivePlayer];
        console.log(`🔁 Next Phase: ${nextPhase}, First Player: ${firstPlayerObj?.name || firstActivePlayer}`);
        await updateDoc(gameRef, updateData);
  
        if (cardDealer && ["flop", "turn", "river"].includes(nextPhase)) {
          try {
            await cardDealer.verifyCardIntegrity();
          } catch (error) {
            console.warn("Card integrity check failed:", error);
          }
        }
      }
    } catch (error) {
      console.error("Error advancing phase:", error);
    }
  }
  

function generateCommunityCards(count, existingCards = []) {
    const newCards = [...(existingCards || [])];
    const existingValues = new Set();
    
    for (const card of newCards) {
      if (card && card.value && card.suit) {
        existingValues.add(`${card.value}-${card.suit}`);
      }
    }
    
    const suits = ["hearts", "diamonds", "clubs", "spades"];
    
    for (let i = 0; i < count; i++) {
      let card;
      let attempts = 0;
      const maxAttempts = 100; 
      do {
        const value = Math.floor(Math.random() * 13) + 2; // 2-14 (A=14)
        const suit = suits[Math.floor(Math.random() * suits.length)];
        card = { value, suit };
        attempts++;
        
        // To protect infinite loop
        if (attempts > maxAttempts) {
          console.warn("Too many attempts to generate unique card, breaking loop");
          break;
        }
      } while (existingValues.has(`${card.value}-${card.suit}`));
      
      existingValues.add(`${card.value}-${card.suit}`);
      newCards.push(card);
    }
    
    // console.log("Generated community cards:", newCards);
    return newCards;
}
  
  // Deal cards to players
  async function dealCards() {
    try {
      const playersRef = collection(db, "games", roomId, "players");
      const playersSnap = await getDocs(playersRef);
      
      const existingValues = new Set();
      const batch = writeBatch(db);
      
      // Deal 2 cards to each player
      playersSnap.forEach(doc => {
        const playerCards = [];
        const suits = ["hearts", "diamonds", "clubs", "spades"];
        
        for (let i = 0; i < 2; i++) {
          let card;
          do {
            const value = Math.floor(Math.random() * 13) + 2; // 2-14 (A=14)
            const suit = suits[Math.floor(Math.random() * suits.length)];
            card = { value, suit };
          } while (existingValues.has(`${card.value}-${card.suit}`));
          
          existingValues.add(`${card.value}-${card.suit}`);
          playerCards.push(card);
        }
        
        batch.update(doc.ref, { 
          cards: playerCards, 
          status: "waiting",
          revealed: false,
          handName: null
        });
      });
      
      await batch.commit();
      
      // Set first player's turn
      if (playersSnap.size > 0) {
        const gameRef = doc(db, "games", roomId);
        await updateDoc(gameRef, {
          currentTurn: playersSnap.docs[0].id
        });
      }
    } catch (error) {
      console.error("Error dealing cards:", error);
    }
}
  
// Handle showdown
async function handleShowdown() {
    if (!gameData) return;

    try {
        console.log("Starting showdown process...");
        
        // อัพเดตสถานะเกมเป็น showdown
        const gameRef = doc(db, "games", roomId);
        await updateDoc(gameRef, {
            phase: "showdown"
        });
        
        let activePlayers = [];
        
        for (const uid of Object.keys(gameData.players)) {
            const player = gameData.players[uid];

            const playerCards = player.cards;
            if (!playerCards || playerCards.length !== 2) {
                // console.error(`Player ${uid} has no cards during showdown`);
                continue; 
            }
            if (player.status !== "folded") {
                activePlayers.push({
                    id: playerId,
                    name: player.name,
                    cards: player.cards
                });
                
                const playerRef = doc(db, "games", roomId, "players", playerId);
                await updateDoc(playerRef, { revealed: true });
            }
        }
        
        if (activePlayers.length === 1) {
            // console.log("Only one active player remains: " + activePlayers[0].name);
            await declareWinner(activePlayers[0].id, "Last player standing");
            return;
        }
        
        // console.log(`${activePlayers.length} players remain for showdown evaluation`);
        
        const communityCards = gameData.communityCards || [];
        // console.log("Community cards:", communityCards);
        
        let bestHandRank = -1;
        let winners = [];
        
        for (const player of activePlayers) {
            const combinedCards = [...player.cards, ...communityCards];
            const handResult = evaluateHand(combinedCards);
            const handRank = handResult.rank;
            
            // console.log(`Player ${player.name} has: ${handResult.name} (rank ${handRank})`);
            
          
            const playerRef = doc(db, "games", roomId, "players", player.id);
            await updateDoc(playerRef, { handName: handResult.name });
            
            if (handRank > bestHandRank) {
                bestHandRank = handRank;
                winners = [player];
                // console.log(`New best hand: ${handResult.name} by ${player.name}`);
            } else if (handRank === bestHandRank) {
              
                winners.push(player);
                // console.log(`Tie for best hand with ${player.name}`);
            }
        }
        
        if (winners.length === 1) {
            console.log(`Winner declared: ${winners[0].name}`);
            
            const winnerHand = evaluateHand([...winners[0].cards, ...communityCards]).name;
            await declareWinner(winners[0].id, `Winning hand: ${winnerHand}`);
        } else {
            console.log(`Tie among ${winners.length} players. Splitting pot.`);
            const winnerIds = winners.map(w => w.id);
            await splitPot(winnerIds);
        }
    } catch (error) {
        console.error("Error handling showdown:", error);
        
        if (isHost) {
            alert("There was a problem determining the winner. Please try starting a new round.");
        }
    }
}

// Declare a winner
async function declareWinner(winnerId, reason) {
    try {
      // Get winner data
      const winnerRef = doc(db, "games", roomId, "players", winnerId);
      const winnerSnap = await getDoc(winnerRef);
      
      if (!winnerSnap.exists()) {
        console.error("Winner not found in database");
        return;
      }
      
      const winnerData = winnerSnap.data();
      
      // Award pot to winner
      const newMoney = winnerData.money + gameData.pot;
      await updateDoc(winnerRef, { money: newMoney });
      
      // Update game state
      const gameRef = doc(db, "games", roomId);
      await updateDoc(gameRef, {
        winnerDeclared: true,
        winnerName: winnerData.name,
        winnerId: winnerId,
        winnerHand: reason,
        phase: "ended"
      });
      
      // Show winner panel
      showWinnerPanel();
    } catch (error) {
      console.error("Error declaring winner:", error);
    }
  }
  
  // Split pot between multiple winners
  async function splitPot(winnerIds) {
    if (!winnerIds || winnerIds.length === 0) return;
    
    try {
      // Calculate split amount
      const splitAmount = Math.floor(gameData.pot / winnerIds.length);
      
      // Award split pot to each winner
      for (const winnerId of winnerIds) {
        const winnerRef = doc(db, "games", roomId, "players", winnerId);
        const winnerSnap = await getDoc(winnerRef);
        
        if (winnerSnap.exists()) {
          const winnerData = winnerSnap.data();
          const newMoney = winnerData.money + splitAmount;
          await updateDoc(winnerRef, { money: newMoney });
        }
      }
      
      // Get winner names
      const winnerNames = [];
      for (const winnerId of winnerIds) {
        if (gameData.players[winnerId]) {
          winnerNames.push(gameData.players[winnerId].name);
        }
      }
      
      // Update game state
      const gameRef = doc(db, "games", roomId);
      await updateDoc(gameRef, {
        winnerDeclared: true,
        winnerName: winnerNames.join(", "),
        winnerId: winnerIds.join(","),
        winnerHand: "Tie - Pot split",
        phase: "ended"
      });
      
      // Show winner panel
      showWinnerPanel();
    } catch (error) {
      console.error("Error splitting pot:", error);
    }
  }
  
function showWinnerPanel() {
    if (!gameData || !gameData.winnerDeclared) {
      console.log("No winner to display");
      return;
    }
    
    console.log("Showing winner panel");
    
    const winnerPanel = document.getElementById("winnerPanel");
    const winnerName = document.getElementById("winnerName");
    const winnerHand = document.getElementById("winnerHand");
    
    winnerName.textContent = gameData.winnerName || "Unknown";
    winnerHand.textContent = gameData.winnerHand || "";
    
    const winningCardsDiv = document.getElementById("winningCards");
    winningCardsDiv.innerHTML = "";
    
    if (gameData.winningCards && gameData.winningCards.length > 0) {
      for (const card of gameData.winningCards) {
        const cardDiv = document.createElement("div");
        cardDiv.className = `card ${getCardColor(card)}`;
        cardDiv.textContent = formatCard(card);
        winningCardsDiv.appendChild(cardDiv);
      }
    }
    
    winnerPanel.style.display = "flex";
}
  
// Close winner panel
function closeWinnerPanel() {
    document.getElementById("winnerPanel").style.display = "none";
}

function getCardColor(card) {
    if (!card) return "";
    
    if (card.suit === "hearts" || card.suit === "diamonds") {
      return "red-card";
    } else {
      return "black-card";
    }
}
  
// Start a new round
async function startNewRound() {
    if (!isHost) {
      alert("Only the host can start a new round");
      return;
    }

    if (isHost && typeof cardDealer !== 'undefined') {
        await cardDealer.dealPlayerHands();
    }
      
    try {
      const playersRef = collection(db, "games", roomId, "players");
      const playersSnap = await getDocs(playersRef);
      
      const batch = writeBatch(db);
      playersSnap.forEach(doc => {
        const player = doc.data();
        if (player.money <= 0) {
          batch.delete(doc.ref);
        }
      });
      await batch.commit();
      
      let newTablePositions = null;
      
      if (gameData && gameData.tablePositions && gameData.playerPositions) {
        const positionToPlayer = new Map();
        Object.keys(gameData.playerPositions || {}).forEach(playerId => {
          const position = gameData.playerPositions[playerId];
          positionToPlayer.set(position, playerId);
        });
        
        const positions = Array.from(positionToPlayer.keys()).sort((a, b) => a - b);
        const players = [];
        
        for (const position of positions) {
          const playerId = positionToPlayer.get(position);
          players.push(playerId);
        }
        
        if (players.length >= 2) {
          const currentDealerIndex = players.findIndex(id => id === gameData.tablePositions.dealer);
          
          if (currentDealerIndex !== -1) {
            const nextDealerIndex = (currentDealerIndex + 1) % players.length;
            const nextSBIndex = nextDealerIndex;
            const nextBBIndex = (nextDealerIndex + 1) % players.length;
            
            newTablePositions = {
              dealer: players[nextDealerIndex],
              smallBlind: players[nextSBIndex],
              bigBlind: players[nextBBIndex]
            };
          }
        }
      }
      const gameRef = doc(db, "games", roomId);
      const updateData = {
        phase: "waiting",
        pot: 0,
        currentTurn: "",
        currentCallAmount: 0,
        communityCards: [],
        winnerDeclared: false
      };
      
      if (newTablePositions) {
        updateData.tablePositions = newTablePositions;
      }
      
      await updateDoc(gameRef, updateData);
      
      const remainingPlayersSnap = await getDocs(playersRef);
      const playersBatch = writeBatch(db);
      
      remainingPlayersSnap.forEach(doc => {
        playersBatch.update(doc.ref, {
          bet: 0,
          roundBet: 0,
          status: "waiting",
          revealed: false,
          cards: [],
          handName: null
        });
      });
      
      await playersBatch.commit();
      
      closeWinnerPanel();
      
      autoStartGame();
      
      console.log("New round initialized and auto-starting...");
    } catch (error) {
      console.error("Error starting new round:", error);
      alert("Failed to start new round: " + error.message);
    }
}
  
  // Leave the room
  async function leaveRoom() {
    try {
      // Remove player from game
      const playerRef = doc(db, "games", roomId, "players", playerUID);
      await deleteDoc(playerRef);
      
      // Check if player is host
      const roomRef = doc(db, "rooms", roomId);
      const roomSnap = await getDoc(roomRef);
      
      if (roomSnap.exists() && roomSnap.data().hostUID === playerUID) {
        // Delete the room if host leaves
        await deleteDoc(roomRef);
      }
      
      // Clear localStorage
      localStorage.removeItem("joinedRoomId");
      localStorage.removeItem("joinedPlayerUID");
      
      // Redirect to home
      window.location.href = "index.html";
    } catch (error) {
      console.error("Error leaving room:", error);
      alert("Failed to leave room: " + error.message);
    }
  }
  
  // Security check to prevent tampering
  function checkTurn() {
    if (!gameData) return;
    
    document.getElementById("callBtn").disabled = !isMyTurn;
    document.getElementById("raiseBtn").disabled = !isMyTurn;
    document.getElementById("foldBtn").disabled = !isMyTurn;
  }
  
function evaluateHand(cards) {

    if (!cards || cards.length < 5) {
      return { rank: 0, name: "Invalid Hand" };
    }
    
    const sortedCards = [...cards].sort((a, b) => b.value - a.value);
    
    const valueCounts = {};
    for (const card of sortedCards) {
      valueCounts[card.value] = (valueCounts[card.value] || 0) + 1;
    }
    
    const suitCounts = {};
    for (const card of sortedCards) {
      suitCounts[card.suit] = (suitCounts[card.suit] || 0) + 1;
    }
    
    let flush = false;
    let flushSuit = null;
    
    for (const [suit, count] of Object.entries(suitCounts)) {
      if (count >= 5) {
        flush = true;
        flushSuit = suit;
        break;
      }
    }

    let flushCards = [];
    if (flush) {
      flushCards = sortedCards
        .filter(card => card.suit === flushSuit)
        .slice(0, 5);
    }
    
    let straight = false;
    let straightHighCard = null;
    
    for (let i = 0; i <= sortedCards.length - 5; i++) {
      if (
        sortedCards[i].value === sortedCards[i+1].value + 1 &&
        sortedCards[i+1].value === sortedCards[i+2].value + 1 &&
        sortedCards[i+2].value === sortedCards[i+3].value + 1 &&
        sortedCards[i+3].value === sortedCards[i+4].value + 1
      ) {
        straight = true;
        straightHighCard = sortedCards[i].value;
        break;
      }
    }
    
    if (!straight && sortedCards[0].value === 14) {
      const hasTwo = sortedCards.some(c => c.value === 2);
      const hasThree = sortedCards.some(c => c.value === 3);
      const hasFour = sortedCards.some(c => c.value === 4);
      const hasFive = sortedCards.some(c => c.value === 5);
      
      if (hasTwo && hasThree && hasFour && hasFive) {
        straight = true;
        straightHighCard = 5; 
      }
    }
    
    let straightFlush = false;
    if (flush && straight) {
      for (let i = 0; i <= flushCards.length - 5; i++) {
        if (
          flushCards[i].value === flushCards[i+1].value + 1 &&
          flushCards[i+1].value === flushCards[i+2].value + 1 &&
          flushCards[i+2].value === flushCards[i+3].value + 1 &&
          flushCards[i+3].value === flushCards[i+4].value + 1
        ) {
          straightFlush = true;
          break;
        }
      }
      
      if (!straightFlush && flushCards[0].value === 14) {
        const hasTwo = flushCards.some(c => c.value === 2 && c.suit === flushSuit);
        const hasThree = flushCards.some(c => c.value === 3 && c.suit === flushSuit);
        const hasFour = flushCards.some(c => c.value === 4 && c.suit === flushSuit);
        const hasFive = flushCards.some(c => c.value === 5 && c.suit === flushSuit);
        
        if (hasTwo && hasThree && hasFour && hasFive) {
          straightFlush = true;
        }
      }
    }
    
    const pairs = Object.entries(valueCounts).filter(([_, count]) => count === 2).length;
    const threeOfAKind = Object.values(valueCounts).some(count => count === 3);
    const fourOfAKind = Object.values(valueCounts).some(count => count === 4);
    
    let pairValues = [];
    let threeOfAKindValue = null;
    let fourOfAKindValue = null;
    
    for (const [value, count] of Object.entries(valueCounts)) {
      if (count === 2) {
        pairValues.push(parseInt(value));
      } else if (count === 3) {
        threeOfAKindValue = parseInt(value);
      } else if (count === 4) {
        fourOfAKindValue = parseInt(value);
      }
    }
    
    pairValues.sort((a, b) => b - a);
    const fullHouse = threeOfAKind && pairs > 0;
    let rank = 0;
    let name = "High Card";
    
    if (pairs === 1 && !threeOfAKind) {
      rank = 1;
      name = "Pair of " + formatValueName(pairValues[0]) + "s";
    } else if (pairs === 2) {
      rank = 2;
      name = "Two Pair: " + formatValueName(pairValues[0]) + "s and " + formatValueName(pairValues[1]) + "s";
    } else if (threeOfAKind && !fullHouse) {
      rank = 3;
      name = "Three of a Kind: " + formatValueName(threeOfAKindValue) + "s";
    } else if (straight && !flush) {
      rank = 4;
      name = straightHighCard === 5 && sortedCards[0].value === 14 ? "Five-High Straight" : formatValueName(straightHighCard) + "-High Straight";
    } else if (flush && !straight) {
      rank = 5;
      name = formatValueName(flushCards[0].value) + "-High Flush";
    } else if (fullHouse) {
      rank = 6;
      name = "Full House: " + formatValueName(threeOfAKindValue) + "s over " + formatValueName(pairValues[0]) + "s";
    } else if (fourOfAKind) {
      rank = 7;
      name = "Four of a Kind: " + formatValueName(fourOfAKindValue) + "s";
    } else if (straightFlush) {
      if (flushCards[0].value === 14 && flushCards[1].value === 13 && flushCards[2].value === 12 &&
          flushCards[3].value === 11 && flushCards[4].value === 10) {
        rank = 9;
        name = "Royal Flush";
      } else {
        rank = 8;
        name = formatValueName(flushCards[0].value) + "-High Straight Flush";
      }
    }
    
    return { rank, name };
  }
  
  function formatValueName(value) {
    switch (parseInt(value)) {
      case 14: return "Ace";
      case 13: return "King";
      case 12: return "Queen";
      case 11: return "Jack";
      case 10: return "Ten";
      case 9: return "Nine";
      case 8: return "Eight";
      case 7: return "Seven";
      case 6: return "Six";
      case 5: return "Five";
      case 4: return "Four";
      case 3: return "Three";
      case 2: return "Two";
      default: return value.toString();
    }
}

function autoStartGame() {
    console.log("Auto-starting game in 5 seconds...");
    
    setTimeout(async () => {
      try {
        if (gameData && gameData.phase === "waiting") {
          console.log("Auto-advancing to preflop phase");
          
          if (!gameData.players || Object.keys(gameData.players).length < 2) {
            console.error("Not enough players to start the game");
            return;
          }
          
          const SMALL_BLIND = 10;
          const BIG_BLIND = 20;
          
          const positionToPlayer = new Map();
          Object.keys(gameData.playerPositions || {}).forEach(playerId => {
            const position = gameData.playerPositions[playerId];
            positionToPlayer.set(position, playerId);
          });
          
          const orderedPlayers = [];
          const positions = Array.from(positionToPlayer.keys()).sort((a, b) => a - b);
          for (const position of positions) {
            const playerId = positionToPlayer.get(position);
            if (playerId) {
              orderedPlayers.push({
                id: playerId,
                data: gameData.players[playerId]
              });
            }
          }

          if (orderedPlayers.length < 2) {
            console.error("Not enough players to start the game");
            return;
          }
   
          const tablePositions = {
            dealer: orderedPlayers[0].id,         
            smallBlind: orderedPlayers[0].id,     
            bigBlind: orderedPlayers[1].id        
          };

          const smallBlindPlayer = orderedPlayers[0];
          const bigBlindPlayer = orderedPlayers[1];
          
          let firstPlayerIndex = 2 % orderedPlayers.length;
          let firstPlayerId = orderedPlayers[firstPlayerIndex].id;
          
          const gameRef = doc(db, "games", roomId);
    
          
        if (smallBlindPlayer.id) {
            const smallBlindRef = doc(db, "games", roomId, "players", smallBlindPlayer.id);
            await updateDoc(smallBlindRef, {
            bet: SMALL_BLIND,
            roundBet: SMALL_BLIND,
            money: (smallBlindPlayer.data.money || 10000) - SMALL_BLIND,
            status: "waiting"
            });
        }
   
        if (bigBlindPlayer.id) {
            const bigBlindRef = doc(db, "games", roomId, "players", bigBlindPlayer.id);
            await updateDoc(bigBlindRef, {
            bet: BIG_BLIND,
            roundBet: BIG_BLIND,
            money: (bigBlindPlayer.data.money || 10000) - BIG_BLIND,
            status: "waiting"
            });
        }
        
        // await updateDoc(gameRef, {
        //     phase: "preflop",
        //     currentTurn: firstPlayerId,
        //     currentCallAmount: BIG_BLIND,
        //     pot: SMALL_BLIND + BIG_BLIND,
        //     tablePositions: tablePositions
        // });

        // await advancePhase(); 

        await updateDoc(gameRef, {
            currentTurn: firstPlayerId,
            currentCallAmount: BIG_BLIND,
            pot: SMALL_BLIND + BIG_BLIND,
            tablePositions: tablePositions
        });
        await advancePhase();
          
          console.log("Game auto-started successfully with blinds");
          console.log("Dealer: " + tablePositions.dealer);
          console.log("Small Blind: $" + SMALL_BLIND + " by " + smallBlindPlayer.data.name);
          console.log("Big Blind: $" + BIG_BLIND + " by " + bigBlindPlayer.data.name);
          console.log("Total Pot: $" + (SMALL_BLIND + BIG_BLIND));
          // console.log("First Player to Act: " + firstPlayerId);
        } else {
          console.log("Not auto-starting game: either game data missing or phase not 'waiting'");
        }
      } catch (error) {
        console.error("Error auto-starting game:", error);
      }
    }, 1000); // 1 seconds delay
}

async function createNewRoom() {
    try {
      const roomRef = doc(db, "rooms", roomId);
      await setDoc(roomRef, {
        hostUID: playerUID,
        roomName: "Game Room",
        createdAt: new Date(),
        status: "active"
      });
      console.log("New room created");

      await createNewGame();
    } catch (error) {
      console.error("Error creating new room:", error);
    }
}
async function createNewGame() {
    try {
      const gameRef = doc(db, "games", roomId);
      await setDoc(gameRef, {
        phase: "waiting",
        pot: 0,
        currentTurn: "",
        currentCallAmount: 0,
        communityCards: [],
        winnerDeclared: false,
        players: {},
        playerPositions: {}
      });
      
      console.log("New game created");
      await initializePlayerPositions();
    } catch (error) {
      console.error("Error creating new game:", error);
    }
}
  
async function resetGame() {
    try {
      if (window.unsubscribeListeners) {
        window.unsubscribeListeners();
      }
      
      await createNewGame();
      setUpRealTimeListeners();
      
      console.log("Game has been reset");
    } catch (error) {
      console.error("Error resetting game:", error);
      alert("There was a problem resetting the game. Please refresh the page.");
    }
} 

function assignTablePositions() {
    if (!gameData || !gameData.playerPositions) return;
 
    const positionToPlayer = new Map();
    Object.keys(gameData.playerPositions || {}).forEach(playerId => {
        const position = gameData.playerPositions[playerId];
        positionToPlayer.set(position, playerId);
    });
    
    const positions = Array.from(positionToPlayer.keys()).sort((a, b) => a - b);

    const tablePositions = {
        dealer: null,    // Dealer 
        smallBlind: null, // Small Blind
        bigBlind: null   // Big Blind
    };

    if (positions.length > 0) {

        const dealerPosition = positions[0];
        tablePositions.dealer = positionToPlayer.get(dealerPosition);

        const sbIndex = 0;
        tablePositions.smallBlind = positionToPlayer.get(positions[sbIndex]);

        const bbIndex = 1 % positions.length;
        tablePositions.bigBlind = positionToPlayer.get(positions[bbIndex]);
    }

    if (isHost && gameData.phase === "waiting" || gameData.phase === "preflop" && !gameData.tablePositions) {
        const gameRef = doc(db, "games", roomId);
        updateDoc(gameRef, {
            tablePositions: tablePositions
        });
    }
    
    return tablePositions;
}