# BMS-GATOR

A compact, fast, **BattleTech** helper for table or VTT: browse mechs, read Tech Readouts, and compute **G.A.T.O.R.** target numbers without rules-flipping.

[![Play BMS-GATOR](https://img.shields.io/badge/%E2%96%B6%EF%B8%8F%20Play%20BMS--GATOR-0b63f6?style=for-the-badge)](https://nevar530.github.io/BMS-GATOR/)
![HTML5](https://img.shields.io/badge/HTML5-E34F26?logo=html5&logoColor=fff)
![CSS3](https://img.shields.io/badge/CSS3-1572B6?logo=css3&logoColor=fff)
![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?logo=javascript&logoColor=000)
![License: MIT](https://img.shields.io/badge/Code-MIT-brightgreen)
![License: CC BY-NC-SA 4.0](https://img.shields.io/badge/Data-CC%20BY--NC--SA%204.0-orange)

---

## What it does

- **Mech Browser** — Search the included manifest and load a mech JSON instantly.
- **Overview** — Quick stats (movement, tonnage, key weapons) and a heat bar.
- **Tech Readout (sub-tabs)**  
  - *Chassis & Systems* — tonnage, engine, sinks, movement, role, weapons list.  
  - *Armor & Internals* — per-location armor (front/rear) + internal structure.  
  - *Equipment by Location* — compact breakdown per body location.  
  - *Lore & History* — overview, capabilities, deployment, history.
- **G.A.T.O.R. Calculator** (sub-tabs) — G, A, T, O, R, and **Dice/TN** panel:
  Gunnery, attacker/target movement, terrain/heat/cover, range & minimums, and a dice roller.

All UI is designed to be **touch-friendly**, **no-scrollbar**, and **embed-sized**.

---

## Quick start

**Play online:**  
👉 https://nevar530.github.io/BMS-GATOR/

**Run locally (no build tools):**
```bash
git clone https://github.com/nevar530/BMS-GATOR.git
cd BMS-GATOR
# open index.html in a browser