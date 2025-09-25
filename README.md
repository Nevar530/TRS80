# TRS:80  
## Technical Readout System:80  

> A compact, fast **BattleTech** helper for table or VTT.  
Browse mechs, read Tech Readouts, and compute **G.A.T.O.R.** target numbers — all without flipping through rulebooks.  

[![Play TRS:80](https://img.shields.io/badge/%E2%96%B6%EF%B8%8F%20Play%20TRS:80-0b63f6?style=for-the-badge)](https://nevar530.github.io/TRS80/)  
![License: MIT](https://img.shields.io/badge/Code-MIT-brightgreen)  
![License: CC BY-NC-SA 4.0](https://img.shields.io/badge/Data-CC%20BY--NC--SA%204.0-orange)  

---

## ✦ Features

- **Mech Browser** — search the manifest and instantly load any mech JSON  
- **Overview Panel** — quick stats (movement, tonnage, key weapons) + heat bar  
- **Tech Readout Tabs**  
  - *Chassis & Systems* — tonnage, engine, sinks, role, weapons list  
  - *Armor & Internals* — per-location armor & structure  
  - *Equipment by Location* — compact breakdown per body location  
  - *Lore & History* — overview, deployment, flavor text  
- **G.A.T.O.R. Calculator** — Gunnery, Attacker/Target movement, Terrain, Other modifiers, Range + Dice roller  
- **Touch-Friendly UI** — runs great on tablets and embed windows, no scrollbars  

---

## 🚀 Quick Start

- **Play instantly in your browser**  
  👉 **[Launch TRS:80](https://nevar530.github.io/TRS80/)**  

- **Offline use**  
  1. Download this repo as a ZIP or clone it.  
  2. Open `index.html` in any modern browser (Chrome, Firefox, Edge, Safari).  
  3. That’s it — no installs, no build tools.  

Runs virtually **anywhere HTML does**: Windows, macOS, Linux, tablets, even a USB stick.  

---

## 🎲 How to Use TRS:80 in Your Games

TRS:80 is a fast **Classic BattleTech** companion — no Alpha Strike values (yet).  
It’s designed to help you browse, filter, and compare mechs before and during play:

- **Pick your ride:** Search by name (e.g. “Archer”) to instantly see *all variants* in the manifest.  
- **Narrow the field with filters:**  
  - **BV range** — balance your lance by staying within a target Battle Value budget.  
  - **Role** — find the right mix (Missile Boat, Skirmisher, Brawler, Scout) to cover the battlefield.  
  - **Tonnage** — fill weight brackets (Light/Medium/Heavy/Assault) when organizing by classic lance structure.  
  - **Rules Level / Era** — filter by Tech Base or time period to stay “by the book.”  
- **Compare loadouts:** Check movement, armor, and weapon layouts side by side to decide which variant fits your force.  
- **Prep your game:** Once you pick a variant, look it up in Flechs Sheets (for digital record sheets) **or** fill out a paper record sheet if you’re playing old-school.  
- **In-game helper:** Use the built-in G.A.T.O.R. calculator and dice roller to speed up target number math during play.  
- **Lore on tap:** Need quick background on a chassis? Jump into the Tech Readout tabs for flavor text and deployment history.

### 🛠️ Go-to Filters When Building a Lance
- **BV first** if you want fair matchups between players.  
- **Role + Tonnage** if you’re aiming for a classic lance composition (e.g. 1 Scout, 1 Skirmisher, 1 Missile Boat, 1 Brawler).  
- **Rules Level/Era** if you’re sticking to a campaign, time period, or tech restriction.

TRS:80 helps you cut through the noise of endless variants so you can focus on building forces that are both fun and balanced.

---

## ⚙️ Tech Stack

- Pure **HTML / CSS / JavaScript** (no frameworks, no dependencies)  
- Uses **MegaMek mech JSON data** (CC BY-NC-SA 4.0)  
- Designed to be **lightweight, offline-capable, and fast**  

---

## 🔗 Related Tools

- **[BATTLETECH // Mobile Skirmish](https://nevar530.github.io/Battletech-Mobile-Skirmish/)**  
  A browser-based **hex map skirmish tool** for quick games.  
  🎲 Mechs, pilots, terrain, LOS, Firebase online play, and more.  

---

## 🛠️ For Modders & Devs

- Data lives in `/data` (`manifest.json`, mech JSONs, weapons, BV)  
- UI is all in `index.html` + `style.css` + `script.js`  
- No build step: edit → refresh → done  
- Forkable and hackable — add your own mechs, filters, or house rules  

---

## 🛈 Attribution

- **Mech data** © MegaMek Data, licensed under [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/)  
- **BattleTech**, **BattleMech**, **’Mech**, **AeroTech** are trademarks of their respective owners  
- This is a **non-commercial, fan-made tool**, not affiliated with or endorsed by Topps, Catalyst Game Labs, or Microsoft  
