// card-dealer.js - Secure Card Distribution System
import {
    db,
    doc,
    collection,
    getDoc,
    getDocs,
    setDoc,
    updateDoc,
    writeBatch,
    auth
  } from './firebase-config.js';
  

  class CardDealer {
    constructor(roomId) {
      this.roomId = roomId;
      this.deckSeed = null;
      this.cardsDealt = 0;
      this.deck = [];
    }
    

    async initialize() {
      // Generate a cryptographically secure random seed
      const seed = new Uint32Array(4);
      window.crypto.getRandomValues(seed);
      this.deckSeed = Array.from(seed).join('-');
      
      // Save the seed to Firebase (only accessible to the host)
      const gameRef = doc(db, "games", this.roomId);
      const gameSnap = await getDoc(gameRef);
      
      if (!gameSnap.exists()) {
        console.error("Game not found");
        return false;
      }
      
      await updateDoc(gameRef, {
        deckSeed: this.deckSeed,
        deckVersion: Date.now() // Version to prevent reusing same seed
      });
      
      // Create the shuffled deck
      this.createShuffledDeck();
      
      return true;
    }
    
   
    async loadSeed() {
      const gameRef = doc(db, "games", this.roomId);
      const gameSnap = await getDoc(gameRef);
      
      if (!gameSnap.exists()) {
        console.error("Game not found");
        return false;
      }
      
      const gameData = gameSnap.data();
      
      if (!gameData.deckSeed) {
        console.error("Deck seed not found");
        return false;
      }
      
      this.deckSeed = gameData.deckSeed;
      this.createShuffledDeck();
      
      return true;
    }
    
    createShuffledDeck() {
      // Create a standard 52-card deck
      const suits = ["hearts", "diamonds", "clubs", "spades"];
      const values = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]; // 11=J, 12=Q, 13=K, 14=A
      
      // Initialize deck
      this.deck = [];
      for (const suit of suits) {
        for (const value of values) {
          this.deck.push({ suit, value });
        }
      }
      
      // Shuffle the deck using Fisher-Yates algorithm with seeded RNG
      const rng = this.createSeededRNG(this.deckSeed);
      for (let i = this.deck.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [this.deck[i], this.deck[j]] = [this.deck[j], this.deck[i]];
      }
      
      // Reset cards dealt counter
      this.cardsDealt = 0;
    }
    
    createSeededRNG(seed) {
        // Examine seed before use
        if (!seed) {
            console.warn("No seed provided, using default seed");
            seed = "12345-67890-11111-22222";
        }
        
        // Simple xorshift128+ implementation
        const seedValues = seed.split('-').map(s => parseInt(s));
        let s0 = seedValues[0] || 0xDEADBEEF;
        let s1 = seedValues[1] || 0x41C64E6D;
        let s2 = seedValues[2] || 0x6073;
        let s3 = seedValues[3] || 0x12345678;
        
        return function() {
            // xorshift128+ algorithm
            let t = s0;
            const s = s1;
            s0 = s2;
            s1 = s3;
            t ^= t << 11;
            t ^= t >>> 8;
            s3 = t ^ s ^ (s >>> 19) ^ (t >>> 19);
            return (s3 >>> 0) / 0x100000000;
        };
    }
    
  
    dealCards(count) {
      if (this.cardsDealt + count > this.deck.length) {
        console.error("Not enough cards in deck");
        return null;
      }
      
      const cards = this.deck.slice(this.cardsDealt, this.cardsDealt + count);
      this.cardsDealt += count;
      
      return cards;
    }
    

    async dealPlayerHands() {
      // Get all players
      const playersRef = collection(db, "games", this.roomId, "players");
      const playersSnap = await getDocs(playersRef);
      
      if (playersSnap.empty) {
        console.error("No players found");
        return false;
      }
      
      // Reset deck for new round
      await this.initialize();
      
      const batch = writeBatch(db);
      
      // Deal 2 cards to each player
      playersSnap.forEach(playerDoc => {
        const playerCards = this.dealCards(2);
        
        if (playerCards) {
          batch.update(playerDoc.ref, {
            cards: playerCards,
            status: "waiting",
            revealed: false,
            handName: null
          });
        }
      });
      
      await batch.commit();
      return true;
    }
    
    async dealCommunityCards(count, existingCards = []) {
      if (count <= 0) return existingCards;
      
      // First load current seed to ensure consistency
      await this.loadSeed();
      
      // Adjust the cardsDealt counter based on existing community cards and player cards
      const playersRef = collection(db, "games", this.roomId, "players");
      const playersSnap = await getDocs(playersRef);
      
      // Calculate how many cards have been dealt already
      this.cardsDealt = playersSnap.size * 2 + existingCards.length;
      
      // Deal new community cards
      const newCards = this.dealCards(count);
      const updatedCards = [...existingCards, ...newCards];
      
      // Update game with new community cards
      const gameRef = doc(db, "games", this.roomId);
      await updateDoc(gameRef, {
        communityCards: updatedCards
      });
      
      return updatedCards;
    }
    

    async verifyCardIntegrity() {
        try {
            // Load current seed
            const seedLoaded = await this.loadSeed();
            
            if (!seedLoaded) {
                console.error("Failed to load seed for verification");
                return false;
            }
            
            // Get current game state
            const gameRef = doc(db, "games", this.roomId);
            const gameSnap = await getDoc(gameRef);
            
            if (!gameSnap.exists()) return false;
            
            const gameData = gameSnap.data();
            const communityCards = gameData.communityCards || [];
            
            // Get all players and their cards
            const playersRef = collection(db, "games", this.roomId, "players");
            const playersSnap = await getDocs(playersRef);
            
            // Recreate the deck with the same seed
            this.createShuffledDeck();
            
            if (playersSnap.empty) {
                console.warn("No players found for card integrity check");
                return true;
            }
            
            // Skip past the player cards
            this.cardsDealt = playersSnap.size * 2;
            
            // Check if community cards exist before trying to deal
            if (communityCards.length === 0) {
                console.log("No community cards to verify");
                return true;
            }
            
            // Deal the expected community cards
            const expectedCommunityCards = this.dealCards(communityCards.length);
            
            if (!expectedCommunityCards) {
                console.error("Could not deal expected community cards");
                return false;
            }
            
            // Compare expected vs. actual community cards
            for (let i = 0; i < communityCards.length; i++) {
                if (communityCards[i].suit !== expectedCommunityCards[i].suit ||
                    communityCards[i].value !== expectedCommunityCards[i].value) {
                    console.error("Community card mismatch detected!");
                    return false;
                }
            }
            
            return true;
        } catch (error) {
            console.error("Error verifying card integrity:", error);
            return false;
        }
    }
  }
  
  export default CardDealer;