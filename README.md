# ♠️ Poker Online Game – ITCS461 Project

This is a secure online **Texas Hold’em Poker** game developed as a course project for **ITCS461 – Computer and Communication Security** at the **Faculty of Information and Communication Technology, Mahidol University**.

## 🎯 Project Objective

The main goal of this project is to design and implement a secure, real-time, and fair multiplayer poker game using web technologies. It emphasizes principles of secure communication, user authentication, and game integrity to align with security practices taught in ITCS461.

## 🛡️ Key Features

- ✅ Real-time multiplayer gameplay (up to 4 players per room)
- 🔒 Anonymous Firebase Authentication with unique UID per player
- 🔁 Game synchronization using **Firebase Firestore**
- 🃏 Full Texas Hold’em rules: Pre-flop, Flop, Turn, River, Showdown
- 💬 Countdown-based turn timer with auto-fold if time runs out
- 🧠 Secure betting logic (fold, call, raise with limit enforcement)
- 🎨 Clear UI with visible player cards, turn indicators, and pot display
- 🔁 Continuous game rounds with automatic resets
- 🔐 Firestore Security Rules for authenticated access only

## 🧱 Tech Stack

- **Frontend:** HTML, CSS, JavaScript
- **Backend & Realtime Sync:** Firebase Firestore
- **Authentication:** Firebase Authentication (Anonymous)
- **Hosting (optional):** Firebase Hosting / GitHub Pages

## 📁 Project Structure
Poker1111/
├── index.html # Lobby & room join screen
├── playroom.html # Main game screen
├── lobby.js # Room creation & player join logic
├── playroom.js # Core gameplay logic & Firestore sync
├── game-ui.js # UI rendering and updates
├── game-actions.js # Player actions: fold, call, raise
├── firebase.js # Firebase configuration
├── style.css # UI styling
└── /assets # Card images and UI assets


## 🚀 How to Run the Game

1. Clone the repository:
   ```bash
   git clone https://github.com/ChayanidTermph/Poker1111.git
   cd Poker1111

2. Setup Firebase:

- Create a Firebase project in Firebase Console

- Enable Firestore and Anonymous Authentication

- Add your Firebase config in firebase.js

3. Launch the app:

- Open index.html in a browser

- Create a room or join an existing room

- Start the game and play!

## 🔐 Security Considerations
- Players are assigned unique UIDs using Firebase Auth to prevent identity spoofing.

- All actions are validated and written by a single host controller to prevent cheating.

- Firestore rules restrict data access to authenticated users only.

## 📚 Course Information
- Course: ITCS461 – Computer and Communication Security

- Faculty: Faculty of Information and Communication Technology

- University: Mahidol University

- Semester: 2 / 2024

## 👩‍💻 Developer
- Name: Chayanid Termphaiboon, Thitapa Singtho, Papopporn Thongnarintr, Panussaya Jittangtong

- GitHub: ChayanidTermph, ClionDroid, PeakPapopporn, Bampanus

- Project Timeline: April 2025

## 📌 Future Improvements
- Edit showing winner interface

- Add chat system between players

- Support for more than 4 players

- Mobile responsive UI

- Support for reconnection after disconnection

- Improved hand evaluator and ranking visualizations

## 🔗 Repository:
https://github.com/ChayanidTermph/Poker1111

Enjoy playing Poker securely! 🃏💻

