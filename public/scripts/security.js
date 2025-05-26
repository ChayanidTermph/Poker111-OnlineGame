// security.js - Anti-Cheating System for Poker Game
import {
    db,
    doc,
    collection,
    getDoc,
    setDoc,
    updateDoc,
    writeBatch,
    auth
  } from './firebase-config.js';
  
 
  class SecurityService {
    constructor(roomId, playerUID) {
      this.roomId = roomId;
      this.playerUID = playerUID;
      this.authChecked = false;
      this.lastActionTimestamp = Date.now();
      this.actionLog = [];
      this.suspiciousActivityCount = 0;
    }
  
    async initialize() {
      // Set up security log in Firebase
      const securityLogRef = doc(db, "security_logs", this.roomId);
      const logExists = await getDoc(securityLogRef);
      
      if (!logExists.exists()) {
        await setDoc(securityLogRef, {
          roomId: this.roomId,
          created: new Date(),
          logs: [],
          suspiciousActivities: {},
          bannedPlayers: []
        });
      }
      
      // Add connection record
      this.logAction("CONNECT", { browser: navigator.userAgent });
      
      // Set up page visibility detection
      document.addEventListener('visibilitychange', () => {
        this.handleVisibilityChange();
      });
      
      // Set up network monitoring
      window.addEventListener('online', () => this.logAction("NETWORK_CHANGE", { status: "online" }));
      window.addEventListener('offline', () => this.logAction("NETWORK_CHANGE", { status: "offline" }));
      
      // Start periodic checks
      this.startPeriodicChecks();
      
      return this;
    }

    async verifyAuth() {
      if (this.authChecked) return true;
      
      // Check if player exists in the game
      const playerRef = doc(db, "games", this.roomId, "players", this.playerUID);
      const playerSnap = await getDoc(playerRef);
      
      if (!playerSnap.exists()) {
        this.logAction("AUTH_FAIL", { reason: "Player not found in game" });
        return false;
      }
      
      // Check if room exists
      const roomRef = doc(db, "rooms", this.roomId);
      const roomSnap = await getDoc(roomRef);
      
      if (!roomSnap.exists()) {
        this.logAction("AUTH_FAIL", { reason: "Room not found" });
        return false;
      }
      
      // Check if auth matches
      const user = auth.currentUser;
      if (!user || user.uid !== this.playerUID) {
        this.logAction("AUTH_FAIL", { reason: "UID mismatch" });
        return false;
      }
      
      // Check if player is banned
      const securityLogRef = doc(db, "security_logs", this.roomId);
      const securityLog = await getDoc(securityLogRef);
      
      if (securityLog.exists()) {
        const bannedPlayers = securityLog.data().bannedPlayers || [];
        if (bannedPlayers.includes(this.playerUID)) {
          this.logAction("AUTH_FAIL", { reason: "Player is banned" });
          return false;
        }
      }
      
      this.authChecked = true;
      this.logAction("AUTH_SUCCESS", {});
      return true;
    }

    async verifyGameAction(action, data) {
      // Verify auth first
      if (!await this.verifyAuth()) {
        return false;
      }
      
      // Get current game state
      const gameRef = doc(db, "games", this.roomId);
      const gameSnap = await getDoc(gameRef);
      
      if (!gameSnap.exists()) {
        this.logAction("ACTION_BLOCKED", { action, reason: "Game not found" });
        return false;
      }
      
      const gameData = gameSnap.data();
      
      // Check if it's player's turn
      if (gameData.currentTurn !== this.playerUID) {
        this.logAction("ACTION_BLOCKED", { action, reason: "Not player's turn" });
        return false;
      }
      
      // Check for rate limiting (preventing rapid actions)
      const now = Date.now();
      if (now - this.lastActionTimestamp < 500) { // 500ms minimum between actions
        this.suspiciousActivityCount++;
        this.logAction("RATE_LIMIT", { action, timeSinceLastAction: now - this.lastActionTimestamp });
        
        if (this.suspiciousActivityCount > 5) {
          await this.flagSuspiciousActivity("Too many rapid actions");
        }
        
        return false;
      }
      
      this.lastActionTimestamp = now;
      
      // Log the action
      this.logAction("GAME_ACTION", { action, data });
      
      // Action specific validation
      switch (action) {
        case "CALL":
          return this.verifyCallAction(gameData, data);
        case "RAISE":
          return this.verifyRaiseAction(gameData, data);
        case "FOLD":
          return true; // Fold is always valid if it's player's turn
        default:
          return false;
      }
    }

    async verifyCallAction(gameData, data) {
      // Get player data
      const playerRef = doc(db, "games", this.roomId, "players", this.playerUID);
      const playerSnap = await getDoc(playerRef);
      
      if (!playerSnap.exists()) return false;
      
      const playerData = playerSnap.data();
      
      // Calculate amount to call
      const currentCall = gameData.currentCallAmount || 0;
      const playerBet = playerData.roundBet || 0;
      const toCall = currentCall - playerBet;
      
      // Check if player has enough money
      if (toCall > playerData.money) {
        this.logAction("ACTION_BLOCKED", { 
          action: "CALL", 
          reason: "Not enough money",
          required: toCall,
          available: playerData.money
        });
        return false;
      }
      
      return true;
    }

    async verifyRaiseAction(gameData, data) {
      // Get player data
      const playerRef = doc(db, "games", this.roomId, "players", this.playerUID);
      const playerSnap = await getDoc(playerRef);
      
      if (!playerSnap.exists()) return false;
      
      const playerData = playerSnap.data();
      
      // Validate raise amount
      const raiseAmount = data.amount;
      
      if (!raiseAmount || isNaN(raiseAmount) || raiseAmount <= 0) {
        this.logAction("ACTION_BLOCKED", { 
          action: "RAISE", 
          reason: "Invalid raise amount",
          amount: raiseAmount
        });
        return false;
      }
      
      // Calculate minimum raise
      const currentCall = gameData.currentCallAmount || 0;
      const playerBet = playerData.roundBet || 0;
      const toCall = currentCall - playerBet;
      const minRaise = Math.max(20, toCall * 2);
      
      // Check minimum raise amount
      if (raiseAmount < minRaise) {
        this.logAction("ACTION_BLOCKED", { 
          action: "RAISE", 
          reason: "Raise below minimum",
          minimum: minRaise,
          attempted: raiseAmount
        });
        return false;
      }
      
      // Check if player has enough money
      if (raiseAmount > playerData.money) {
        this.logAction("ACTION_BLOCKED", { 
          action: "RAISE", 
          reason: "Not enough money",
          required: raiseAmount,
          available: playerData.money
        });
        return false;
      }
      
      return true;
    }

    handleVisibilityChange() {
      if (document.hidden) {
        this.logAction("TAB_HIDDEN", {});
      } else {
        this.logAction("TAB_VISIBLE", {});
      }
    }
    
    async logAction(actionType, actionData) {
      try {
        const logEntry = {
          timestamp: new Date(),
          playerUID: this.playerUID,
          actionType,
          actionData,
          userAgent: navigator.userAgent
        };
        
        // Add to local log
        this.actionLog.push(logEntry);
        
        // Add to Firebase log (batching to reduce writes)
        if (this.actionLog.length >= 5 || actionType.includes("FAIL") || actionType.includes("BLOCKED")) {
          const securityLogRef = doc(db, "security_logs", this.roomId);
          
          // Get current log
          const currentLog = await getDoc(securityLogRef);
          if (currentLog.exists()) {
            const logs = currentLog.data().logs || [];
            const updatedLogs = [...logs, ...this.actionLog];
            
            // Keep only the last 1000 entries to prevent excessive storage
            const trimmedLogs = updatedLogs.slice(-1000);
            
            await updateDoc(securityLogRef, {
              logs: trimmedLogs
            });
            
            // Clear local log after writing to Firebase
            this.actionLog = [];
          }
        }
      } catch (error) {
        console.error("Error logging security action:", error);
      }
    }
    
    /**
     * Flag suspicious activity for review
     */
    async flagSuspiciousActivity(reason) {
      try {
        const securityLogRef = doc(db, "security_logs", this.roomId);
        const securityLog = await getDoc(securityLogRef);
        
        if (securityLog.exists()) {
          const suspiciousActivities = securityLog.data().suspiciousActivities || {};
          
          suspiciousActivities[this.playerUID] = {
            reason,
            timestamp: new Date(),
            count: (suspiciousActivities[this.playerUID]?.count || 0) + 1
          };
          
          await updateDoc(securityLogRef, {
            suspiciousActivities
          });
          
          // Auto-ban after multiple flags
          if (suspiciousActivities[this.playerUID].count >= 3) {
            await this.banPlayer();
          }
        }
      } catch (error) {
        console.error("Error flagging suspicious activity:", error);
      }
    }
    
    /**
     * Ban a player from the game
     */
    async banPlayer() {
      try {
        const securityLogRef = doc(db, "security_logs", this.roomId);
        const securityLog = await getDoc(securityLogRef);
        
        if (securityLog.exists()) {
          const bannedPlayers = securityLog.data().bannedPlayers || [];
          
          if (!bannedPlayers.includes(this.playerUID)) {
            bannedPlayers.push(this.playerUID);
            
            await updateDoc(securityLogRef, {
              bannedPlayers
            });
            
            // Remove player from game
            const playerRef = doc(db, "games", this.roomId, "players", this.playerUID);
            await updateDoc(playerRef, {
              status: "banned"
            });
            
            // Redirect player
            alert("You have been banned from this game due to suspicious activity.");
            window.location.href = "index.html";
          }
        }
      } catch (error) {
        console.error("Error banning player:", error);
      }
    }

    startPeriodicChecks() {
      setInterval(() => {
        this.verifyGameState();
      }, 30000); // Check every 30 seconds
    }
    

    async verifyGameState() {
      try {
        // Get current game state
        const gameRef = doc(db, "games", this.roomId);
        const gameSnap = await getDoc(gameRef);
        
        if (!gameSnap.exists()) return;
        
        const gameData = gameSnap.data();
        
        // Check for pot consistency
        const playersRef = collection(db, "games", this.roomId, "players");
        const playersSnap = await getDocs(playersRef);
        
        let totalBets = 0;
        playersSnap.forEach(doc => {
          totalBets += doc.data().bet || 0;
        });
        
        // If pot doesn't match total bets, log suspicious activity
        if (Math.abs(totalBets - gameData.pot) > 1) { // Allow for rounding errors
          this.logAction("INCONSISTENT_STATE", {
            type: "pot_mismatch",
            calculatedTotal: totalBets,
            reportedPot: gameData.pot
          });
        }
      } catch (error) {
        console.error("Error verifying game state:", error);
      }
    }
  }
  
  export default SecurityService;