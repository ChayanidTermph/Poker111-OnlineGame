import {
    db,
    auth,
    doc,
    collection,
    getDoc,
    getDocs,
    setDoc,
    updateDoc,
    onSnapshot,
    deleteDoc,
    writeBatch
  } from './firebase-config.js';
  
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-auth.js";

let playerName = "";
let playerUID = null;
let currentRoomId = null;
let isHost = false;
  
onAuthStateChanged(auth, (user) => {
    if (user) {
      playerUID = user.uid;
      console.log("Signed in as:", playerUID);
    }
});
  
  // --- Save name ---
function saveName() {
    const input = document.getElementById('playerName');
    playerName = input.value.trim();
    if (!playerName) return alert("Please enter your name.");
  
    document.getElementById('screen-name').classList.add('hidden');
    document.getElementById('screen-menu').classList.remove('hidden');
    document.getElementById('welcomeText').textContent = `Welcome, ${playerName}!`;
  }
  
  document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("saveNameBtn").addEventListener("click", saveName);
});
  
// --- Navigation ---
window.goToCreateRoom = function () {
    document.getElementById('screen-menu').classList.add('hidden');
    document.getElementById('screen-create').classList.remove('hidden');
    document.getElementById('welcomeCreate').textContent = `Welcome, ${playerName}!`;
};
  
window.goToJoinRoom = function () {
    document.getElementById('screen-menu').classList.add('hidden');
    document.getElementById('screen-join').classList.remove('hidden');
    document.getElementById('welcomeJoin').textContent = `Welcome, ${playerName}!`;
};
  
window.goBackToMenu = function () {
    document.getElementById('screen-create').classList.add('hidden');
    document.getElementById('screen-join').classList.add('hidden');
    document.getElementById('screen-menu').classList.remove('hidden');
};
  
window.goBackToName = function () {
    document.getElementById('screen-menu').classList.add('hidden');
    document.getElementById('screen-name').classList.remove('hidden');
};
  
// --- Create Room ---
window.createRoomInFirebase = async function () {
    const roomId = Math.random().toString(36).substring(2, 8);
    const roomRef = doc(db, "rooms", roomId);
    const roomData = {
      hostUID: playerUID,
      status: 'waiting',
      createdAt: new Date()
    };
  
    try {
      await setDoc(roomRef, roomData);
      await setDoc(doc(db, "games", roomId, "players", playerUID), {
        name: playerName,
        money: 10000,
        bet: 0,
        roundBet: 0,
        status: "waiting",
        revealed: false
      });
  
      showLobby(roomId, true);
    } catch (error) {
      console.error("Error creating room:", error);
    }
  };
  
// --- Join Room ---
window.joinRoomFromFirebase = async function () {
    const roomId = document.getElementById('roomIdInput').value.trim();
    if (!roomId) return alert("Please enter a Room ID.");
  
    const roomRef = doc(db, "rooms", roomId);
    const roomSnap = await getDoc(roomRef);
    if (!roomSnap.exists()) return alert("Room not found!");
  
    const playersCol = collection(db, "games", roomId, "players");
    const playersSnap = await getDocs(playersCol);
  
    if (playersSnap.size >= 4) {
      return alert("Room is full (maximum 4 players).");
    }
  
    const playerRef = doc(playersCol, playerUID);
    const playerSnap = await getDoc(playerRef);
  
    if (!playerSnap.exists()) {
      await setDoc(playerRef, {
        name: playerName,
        money: 10000,
        bet: 0,
        roundBet: 0,
        status: "waiting",
        revealed: false
      });
    }
  
    const roomData = roomSnap.data();
    const isHost = roomData.hostUID === playerUID;
    showLobby(roomId, isHost);

    localStorage.setItem("joinedRoomId", roomId);
    localStorage.setItem("joinedPlayerUID", playerUID);
};
  
// --- Show Lobby ---
window.showLobby = function (roomId, hostFlag) {
    currentRoomId = roomId;
    isHost = hostFlag;
  
    document.getElementById('screen-create').classList.add('hidden');
    document.getElementById('screen-join').classList.add('hidden');
    document.getElementById('screen-lobby').classList.remove('hidden');
    document.getElementById("currentPlayerName").textContent = playerName;
    document.getElementById('lobbyRoomId').textContent = roomId;
    document.getElementById('startGameBtn').style.display = hostFlag ? 'inline-block' : 'none';
  
    const roomRef = doc(db, "rooms", roomId);
    const playersCol = collection(db, "games", roomId, "players");
  
    let roomData = null;
  
    const unsubRoom = onSnapshot(roomRef, (docSnap) => {
        if (!docSnap.exists()) {
            alert("Room has been closed by the host.");
            window.location.href = "/index.html";
            return;
        }

        roomData = docSnap.data(); // Store latest room data
        if (!roomData) return;

        if (roomData.status === "playing") {
            unsubRoom();
            setTimeout(() => {
                // Fix: Use relative path and ensure correct URL format
                const url = `/tableroom.html?roomId=${roomId}&player=${playerUID}`;
                console.log("Redirecting to:", url);
                window.location.href = url;
            }, 1000);
        }
    });
  
    const unsubPlayers = onSnapshot(playersCol, (snap) => {
      const list = document.getElementById('playerList');
      list.innerHTML = '';
      snap.forEach((docSnap) => {
        const data = docSnap.data();
        const isHostPlayer = roomData && docSnap.id === roomData.hostUID;
        const li = document.createElement('li');
        li.textContent = `${data.name}${isHostPlayer ? " 👑" : ""}`;
        list.appendChild(li);
      });
  
      document.getElementById("startGameBtn").disabled = snap.size < 2;
      document.getElementById("startGameBtn").style.opacity = snap.size < 2 ? 0.5 : 1;
      document.getElementById("lobbyNote").textContent =
        snap.size < 2 ? "Waiting for more players..." : "Ready to start!";
    });
};
  
  
// --- Start Game ---
window.startGame = async function () {
    try {
      const roomRef = doc(db, "rooms", currentRoomId);
      const roomSnap = await getDoc(roomRef);
      const roomData = roomSnap.data();
  
      const gameRef = doc(db, "games", currentRoomId);
      const playersSnap = await getDocs(collection(db, "games", currentRoomId, "players"));
  
      const playersData = {};
      const positions = {};
  
      let i = 1;
      playersSnap.forEach(docSnap => {
        playersData[docSnap.id] = {
          ...docSnap.data(),
          bet: 0,
          roundBet: 0,
          status: "waiting",
          revealed: false
        };
        positions[docSnap.id] = i++;
      });
  
      await setDoc(gameRef, {
        phase: "waiting",
        pot: 0,
        currentTurn: "",
        currentCallAmount: 0,
        communityCards: [],
        players: playersData,
        playerPositions: positions,
        winnerDeclared: false,
        roomId: currentRoomId,
        createdAt: new Date()
      });
  
      await updateDoc(roomRef, { status: "playing" });
  
      setTimeout(() => {
        const url = `/tableroom.html?roomId=${currentRoomId}&player=${playerUID}`;
        window.location.href = url;
      }, 500);
    } catch (error) {
      console.error("Error starting game:", error);
      alert("Failed to start game: " + error.message);
    }
};
  
// --- Leave Room ---
window.leaveRoom = async function () {
    if (!currentRoomId || !playerUID) return;
  
    const roomRef = doc(db, "rooms", currentRoomId);
    const playerRef = doc(db, "games", currentRoomId, "players", playerUID);
    const playersColRef = collection(db, "games", currentRoomId, "players");
    const gameDocRef = doc(db, "games", currentRoomId);
  
    try {
      await deleteDoc(playerRef);
  
      const remainingPlayersSnap = await getDocs(playersColRef);
  
      if (remainingPlayersSnap.empty) {
        const batch = writeBatch(db);
        batch.delete(roomRef);
        batch.delete(gameDocRef);
        remainingPlayersSnap.forEach(docSnap => {
          batch.delete(docSnap.ref);
        });
        await batch.commit();
        console.log("Room and game deleted due to no players left.");
      } else {
        const roomSnap = await getDoc(roomRef);
        if (roomSnap.exists()) {
          const data = roomSnap.data();
          if (data.hostUID === playerUID) {
            await deleteDoc(roomRef);
            console.log("Host left, room deleted.");
          }
        }
      }
    } catch (err) {
      console.error("Error leaving room:", err);
    }
  
    location.reload();
};