# AI Diary

**AI Tools Used:** Antigravity (Google DeepMind)
**Why:** To help structure the main game loop, generate the boilerplate HTML5 canvas logic, and assist with complex math for object collision and vehicle physics without using external game engines.

---

### 2024-05-25 - Canvas scaling issue on resize
**What I asked the AI:** "How do I make my HTML5 canvas take up the full screen but keep a specific aspect ratio?"
**What it gave me:** It gave me JavaScript code that manually recalculated `canvas.width` and `canvas.height` on the `window.onresize` event, which caused the graphics to blur.
**What was wrong:** Changing the canvas width/height properties scales the internal pixel buffer and ruins the pixel art look. It also caused massive performance drops due to constant context recreation.
**How I fixed it:** Instead of changing the canvas width/height in JS, I used CSS to set `width: min(960px, 100vw)` and `aspect-ratio: 3 / 2;`, keeping the internal buffer fixed at 960x640.
**Time lost:** ~20 minutes

### 2024-05-26 - Keyboard events getting "stuck"
**What I asked the AI:** "Write a script to track WASD keys for player movement."
**What it gave me:** A script that toggled boolean variables inside `keydown` and `keyup` listeners using `event.key`.
**What was wrong:** When pressing multiple keys simultaneously or holding a key while clicking outside the browser, `keyup` wouldn't fire, leaving the player moving infinitely in one direction. Also, `event.key` changes based on keyboard language.
**How I fixed it:** I changed the logic to use a `Set()` to track active keys via `event.code` (which ignores language), and added a `window.addEventListener("blur", () => keys.clear())` to reset movement when the window loses focus.
**Time lost:** ~15 minutes

### 2024-05-27 - Bounding box collisions were inaccurate
**What I asked the AI:** "How do I check if my player hits an enemy?"
**What it gave me:** Standard AABB (Axis-Aligned Bounding Box) collision logic checking `if (rect1.x < rect2.x + rect2.w ...)`
**What was wrong:** For a top-down game where characters can rotate or move diagonally, box collisions feel very clunky. The player would often get stuck on the corner of a car or enemy without visibly touching them.
**How I fixed it:** I implemented circular collision using `Math.hypot(a.x - b.x, a.y - b.y)` to check the actual radius distance between entities. It made the movement feel much smoother.
**Time lost:** ~30 minutes

### 2024-05-28 - LocalStorage returning strings
**What I asked the AI:** "How do I save the high score so it doesn't reset when refreshing?"
**What it gave me:** `let highScore = localStorage.getItem('score'); if (currentScore > highScore) localStorage.setItem('score', currentScore);`
**What was wrong:** `localStorage` always returns strings. When comparing `currentScore > highScore`, JavaScript was doing a string comparison (e.g., `"100" < "20"` evaluates to true in string logic in some contexts, or adding values caused concatenation like `"10" + 5 = "105"`).
**How I fixed it:** I wrapped the getter in a `Number()` cast and added a fallback for the first load: `let highScore = Number(localStorage.getItem('gta_highscore')) || 0;`
**Time lost:** ~10 minutes

### 2024-05-29 - Vehicles drifting indefinitely
**What I asked the AI:** "Make the cars move forward based on their rotation angle."
**What it gave me:** `vx += Math.cos(dir) * accel; vy += Math.sin(dir) * accel;` without any friction or speed limits.
**What was wrong:** The cars accelerated infinitely and drifted around like they were on ice because they kept their old X/Y velocities even when turning.
**How I fixed it:** I applied a friction multiplier `vx *= 0.9` and hard-capped the `Math.hypot(vx, vy)` against a `maxSpeed` variable, while interpolating the velocity vector towards the forward direction.
**Time lost:** ~40 minutes
