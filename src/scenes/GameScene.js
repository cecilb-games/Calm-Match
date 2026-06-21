import { Grid, BLOCKER } from '../game/Grid.js';
import {
  GRID_COLS, GRID_ROWS, GEM_SIZE, GRID_OFFSET_X, GRID_OFFSET_Y,
  POINTS_PER_GEM, themeForLevel, scoreTargetForLevel, movesForLevel,
  gemTypesForLevel, blockersForLevel, hintDelayForLevel, collectionTotalForLevel,
} from '../game/constants.js';

const STATE = { IDLE: 'idle', ANIMATING: 'animating', LOCKED: 'locked' };

export class GameScene extends Phaser.Scene {
  /** Registers this scene with Phaser under the key 'GameScene'. */
  constructor() {
    super({ key: 'GameScene' });
  }

  /**
   * Initialises per-run state from scene transition data.
   * Determines level type (score vs collection), move limit, and collection goals.
   * @param {{mode: string, level: number}} data - Scene start data.
   */
  init(data) {
    this.mode = data.mode || 'zen';
    this.level = data.level || 1;
    this.theme = themeForLevel(this.level);
    this.scoreTarget = scoreTargetForLevel(this.level);
    // Collection levels get 20% fewer moves than score levels at the same tier
    const baseMoves = movesForLevel(this.level);
    const moveLimit = (this.mode === 'level' && this.levelType === 'collection')
      ? Math.floor(baseMoves * 0.8)
      : baseMoves;
    this.movesLeft = this.mode === 'level' ? moveLimit : Infinity;
    this.gemTypes = gemTypesForLevel(this.level);
    this.blockerCount = this.mode === 'level' ? blockersForLevel(this.level) : 0;
    this.hintDelay = hintDelayForLevel(this.level);

    // Zen mode is always score-based. Level mode is randomly score or collection.
    if (this.mode === 'level') {
      this.levelType = Math.random() < 0.5 ? 'score' : 'collection';
    } else {
      this.levelType = 'score';
    }

    if (this.levelType === 'collection') {
      const numTargets = Math.random() < 0.5 ? 1 : 2;
      const total = collectionTotalForLevel(this.level);
      // Shuffle available types and pick numTargets
      const types = Array.from({ length: this.gemTypes }, (_, i) => i);
      for (let i = types.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [types[i], types[j]] = [types[j], types[i]];
      }
      if (numTargets === 1) {
        this.collectionGoal = [{ type: types[0], required: total, collected: 0 }];
      } else {
        // Split total across the two types — slightly uneven for variety
        const a = Math.floor(total / 2);
        const b = total - a;
        this.collectionGoal = [
          { type: types[0], required: a, collected: 0 },
          { type: types[1], required: b, collected: 0 },
        ];
      }
    } else {
      this.collectionGoal = null;
    }
  }

  /**
   * Builds the game board: draws blockers and gem sprites, sets up input,
   * saves level progress, and launches UIScene.
   */
  create() {
    this.cameras.main.setBackgroundColor(this.theme.bg);

    this.grid = new Grid({ gemTypes: this.gemTypes, blockerCount: this.blockerCount });
    this.gemSprites = [];
    this.blockerSprites = [];
    this.score = 0;
    this.state = STATE.IDLE;
    this.selected = null;
    this._hintTimer = null;
    this._hintTween = null;
    this._hintSprite = null;

    if (this.mode === 'level') {
      const saved = parseInt(localStorage.getItem('calm_level') || '1', 10);
      if (this.level > saved) localStorage.setItem('calm_level', this.level);
    }

    // Blockers drawn first so gems render on top
    this._drawBlockers();
    this._buildGemSprites();
    this._setupInput();
    this._startHintTimer();

    this.scene.launch('UIScene', {
      mode: this.mode,
      theme: this.theme,
      scoreTarget: this.scoreTarget,
      level: this.level,
      movesLeft: this.movesLeft,
      levelType: this.levelType,
      collectionGoal: this.collectionGoal,
    });
  }

  // ─── Grid visuals ──────────────────────────────────────────────────────────

  /**
   * Creates blocker sprites for every blocker cell in the grid.
   */
  _drawBlockers() {
    this.blockerSprites = [];
    for (let row = 0; row < GRID_ROWS; row++) {
      this.blockerSprites[row] = [];
      for (let col = 0; col < GRID_COLS; col++) {
        if (this.grid.isBlocker(row, col)) {
          this.blockerSprites[row][col] = this._createBlockerSprite(row, col);
        } else {
          this.blockerSprites[row][col] = null;
        }
      }
    }
  }

  /**
   * Creates and returns a stone-textured blocker graphic at the given grid position.
   * @param {number} row
   * @param {number} col
   * @returns {Phaser.GameObjects.Graphics}
   */
  _createBlockerSprite(row, col) {
    const { x, y } = this._gridToWorld(row, col);
    const g = this.add.graphics();
    const s = GEM_SIZE * 0.44;

    // Dark stone base
    g.fillStyle(0x23222e, 1);
    g.fillRoundedRect(x - s, y - s, s * 2, s * 2, 7);

    // Inner recessed face
    g.fillStyle(0x18171f, 1);
    g.fillRoundedRect(x - s + 4, y - s + 4, s * 2 - 8, s * 2 - 8, 5);

    // Crack lines
    g.lineStyle(1.5, 0x0c0b12, 1);
    g.beginPath();
    g.moveTo(x - s * 0.25, y - s * 0.55);
    g.lineTo(x + s * 0.05, y + s * 0.10);
    g.lineTo(x + s * 0.40, y - s * 0.15);
    g.strokePath();
    g.beginPath();
    g.moveTo(x + s * 0.05, y + s * 0.10);
    g.lineTo(x - s * 0.10, y + s * 0.50);
    g.strokePath();

    // Subtle top-left bevel highlight
    g.fillStyle(0xffffff, 0.05);
    g.fillRoundedRect(x - s + 2, y - s + 2, s * 2 - 4, s * 0.35, 4);

    return g;
  }

  /**
   * Creates gem sprites for every non-blocker cell in the grid.
   */
  _buildGemSprites() {
    this.gemSprites = [];
    for (let row = 0; row < GRID_ROWS; row++) {
      this.gemSprites[row] = [];
      for (let col = 0; col < GRID_COLS; col++) {
        if (this.grid.isBlocker(row, col)) {
          this.gemSprites[row][col] = null;
        } else {
          const type = this.grid.get(row, col);
          this.gemSprites[row][col] = this._createGemSprite(row, col, type);
        }
      }
    }
  }

  /**
   * Creates a gem graphics object at the given grid position and attaches row/col/type data.
   * @param {number} row
   * @param {number} col
   * @param {number} type - Gem type index.
   * @returns {Phaser.GameObjects.Graphics}
   */
  _createGemSprite(row, col, type) {
    const { x, y } = this._gridToWorld(row, col);
    const g = this.add.graphics();
    g.setPosition(x, y);
    this._drawGemGraphic(g, type);
    g.setData('row', row);
    g.setData('col', col);
    g.setData('type', type);
    return g;
  }

  /**
   * Clears and redraws a gem graphic in the current theme's style.
   * @param {Phaser.GameObjects.Graphics} g - Graphics object to draw into (origin at 0,0).
   * @param {number} type - Gem type index.
   * @param {number} [scale=1] - Uniform scale factor applied to the gem size.
   */
  _drawGemGraphic(g, type, scale = 1) {
    g.clear();
    const color = this.theme.gems[type];
    const glow = this.theme.glow;
    const s = GEM_SIZE * 0.5 * scale;

    // Soft glow halo
    g.fillStyle(glow, 0.13);
    g.fillCircle(0, 0, s * 1.15);

    // Outer shape
    g.fillStyle(color, 1);
    g.fillPoints(this._shapePoints(type, s * 0.88), true);

    // Inner lighter face
    g.fillStyle(0xffffff, 0.16);
    g.fillPoints(this._shapePoints(type, s * 0.52), true);

    // Highlight dot
    g.fillStyle(0xffffff, 0.38);
    const hOff = this._highlightOffset(type, s);
    g.fillCircle(hOff.x, hOff.y, s * 0.15);
  }

  /**
   * Returns polygon points for the given gem shape type and circumradius.
   * @param {number} type - Shape index (0=triangle, 1=diamond, 2=hexagon, 3=pentagon, 4=octagon, 5=star).
   * @param {number} r - Circumradius.
   * @returns {{x: number, y: number}[]}
   */
  _shapePoints(type, r) {
    switch (type) {
      case 0: return this._polyPoints(r, 3, -90);   // Triangle
      case 1: return this._diamondPoints(r);          // Diamond
      case 2: return this._polyPoints(r, 6, 0);      // Hexagon
      case 3: return this._polyPoints(r, 5, -90);    // Pentagon
      case 4: return this._polyPoints(r, 8, -22.5);  // Octagon
      case 5: return this._starPoints(r, 6);          // 6-pointed star
      default: return this._polyPoints(r, 6, 0);
    }
  }

  /**
   * Returns evenly-spaced polygon vertex points centred at the origin.
   * @param {number} r - Circumradius.
   * @param {number} sides - Number of polygon sides.
   * @param {number} [startAngleDeg=0] - Rotation offset in degrees.
   * @returns {{x: number, y: number}[]}
   */
  _polyPoints(r, sides, startAngleDeg = 0) {
    const pts = [];
    for (let i = 0; i < sides; i++) {
      const a = ((startAngleDeg + (360 / sides) * i) * Math.PI) / 180;
      pts.push({ x: Math.cos(a) * r, y: Math.sin(a) * r });
    }
    return pts;
  }

  /**
   * Returns four points forming an axis-aligned diamond (square rotated 45°).
   * @param {number} r - Half-width/height of the diamond.
   * @returns {{x: number, y: number}[]}
   */
  _diamondPoints(r) {
    const h = r * 0.88;
    return [{ x: 0, y: -h }, { x: h, y: 0 }, { x: 0, y: h }, { x: -h, y: 0 }];
  }

  /**
   * Returns alternating outer/inner vertex points forming a star polygon.
   * @param {number} r - Outer radius.
   * @param {number} points - Number of star points.
   * @returns {{x: number, y: number}[]}
   */
  _starPoints(r, points) {
    const inner = r * 0.42;
    const pts = [];
    for (let i = 0; i < points * 2; i++) {
      const a = ((i * (180 / points)) - 90) * Math.PI / 180;
      const rad = i % 2 === 0 ? r : inner;
      pts.push({ x: Math.cos(a) * rad, y: Math.sin(a) * rad });
    }
    return pts;
  }

  /**
   * Returns the x/y offset for a gem's highlight dot based on its shape type.
   * @param {number} type - Gem shape index.
   * @param {number} s - Gem half-size in pixels.
   * @returns {{x: number, y: number}}
   */
  _highlightOffset(type, s) {
    switch (type) {
      case 0: return { x: -s * 0.08, y: -s * 0.32 };
      case 1: return { x: -s * 0.18, y: -s * 0.22 };
      case 2: return { x: -s * 0.20, y: -s * 0.22 };
      case 3: return { x: -s * 0.18, y: -s * 0.25 };
      case 4: return { x: -s * 0.18, y: -s * 0.20 };
      case 5: return { x: -s * 0.10, y: -s * 0.28 };
      default: return { x: -s * 0.18, y: -s * 0.22 };
    }
  }

  /**
   * Converts grid coordinates to world (pixel) position at the gem's centre.
   * @param {number} row
   * @param {number} col
   * @returns {{x: number, y: number}}
   */
  _gridToWorld(row, col) {
    return {
      x: GRID_OFFSET_X + col * GEM_SIZE + GEM_SIZE / 2,
      y: GRID_OFFSET_Y + row * GEM_SIZE + GEM_SIZE / 2,
    };
  }

  // ─── Input ─────────────────────────────────────────────────────────────────

  /**
   * Attaches the pointer-down input handler to the scene.
   */
  _setupInput() {
    this.input.on('pointerdown', this._onPointerDown, this);
  }

  /**
   * Handles tap/click input: selects, deselects, or attempts a swap based on current state.
   * Resets the hint timer on every tap.
   * @param {Phaser.Input.Pointer} pointer
   */
  _onPointerDown(pointer) {
    if (this.state !== STATE.IDLE) return;

    // Any tap clears the hint and resets the timer
    this._clearHint();
    this._startHintTimer();

    const col = Math.floor((pointer.x - GRID_OFFSET_X) / GEM_SIZE);
    const row = Math.floor((pointer.y - GRID_OFFSET_Y) / GEM_SIZE);

    if (col < 0 || col >= GRID_COLS || row < 0 || row >= GRID_ROWS) {
      this._deselect();
      return;
    }

    // Blockers are not selectable
    if (this.grid.isBlocker(row, col)) {
      this._deselect();
      return;
    }

    if (!this.selected) {
      this._select(row, col);
    } else {
      const { row: sr, col: sc } = this.selected;
      if (sr === row && sc === col) {
        this._deselect();
      } else if (this.grid.isAdjacent(sr, sc, row, col)) {
        this._deselect();
        if (this.grid.isBlocker(row, col)) return; // can't swap with a blocker
        this._trySwap(sr, sc, row, col);
      } else {
        this._deselect();
        this._select(row, col);
      }
    }
  }

  /**
   * Marks the gem at (row, col) as selected and starts a pulse tween and selection ring.
   * @param {number} row
   * @param {number} col
   */
  _select(row, col) {
    this.selected = { row, col };
    const sprite = this.gemSprites[row][col];
    this.tweens.add({
      targets: sprite,
      scaleX: 1.15,
      scaleY: 1.15,
      duration: 120,
      yoyo: true,
      repeat: -1,
    });
    this.selectionRing = this.add.graphics();
    const { x, y } = this._gridToWorld(row, col);
    this.selectionRing.lineStyle(2.5, this.theme.glow, 0.85);
    this.selectionRing.strokeCircle(x, y, GEM_SIZE * 0.48);
  }

  /**
   * Clears the current selection, stopping any pulse tween and removing the selection ring.
   */
  _deselect() {
    if (!this.selected) return;
    const { row, col } = this.selected;
    const sprite = this.gemSprites[row]?.[col];
    if (sprite) { this.tweens.killTweensOf(sprite); sprite.setScale(1); }
    this.selectionRing?.destroy();
    this.selectionRing = null;
    this.selected = null;
  }

  // ─── Swap & match logic ────────────────────────────────────────────────────

  /**
   * Animates a swap between two gems and either resolves matches or reverses the swap if invalid.
   * Deducts a move only when the swap produces a match.
   * @param {number} r1
   * @param {number} c1
   * @param {number} r2
   * @param {number} c2
   */
  _trySwap(r1, c1, r2, c2) {
    this.state = STATE.ANIMATING;
    const s1 = this.gemSprites[r1][c1];
    const s2 = this.gemSprites[r2][c2];
    const pos1 = this._gridToWorld(r1, c1);
    const pos2 = this._gridToWorld(r2, c2);

    this._animateSwap(s1, s2, pos1, pos2, () => {
      this.grid.swap(r1, c1, r2, c2);
      this.gemSprites[r1][c1] = s2;
      this.gemSprites[r2][c2] = s1;

      const matches = this.grid.findMatches();
      if (matches.length === 0) {
        // No match — swap back, no move deducted
        this._animateSwap(s1, s2, pos2, pos1, () => {
          this.grid.swap(r1, c1, r2, c2);
          this.gemSprites[r1][c1] = s1;
          this.gemSprites[r2][c2] = s2;
          this.state = STATE.IDLE;
        });
      } else {
        // Valid match — deduct a move now
        if (this.mode === 'level') {
          this.movesLeft = Math.max(0, this.movesLeft - 1);
          this.events.emit('movesUpdate', { movesLeft: this.movesLeft });
        }
        this._resolveMatches(1);
      }
    });
  }

  /**
   * Checks whether moves are exhausted and the level goal is unmet; emits 'gameOver' if so.
   * Otherwise transitions state back to IDLE and restarts the hint timer.
   */
  _checkMovesExhausted() {
    const goalMet = this.levelType === 'collection'
      ? this._isCollectionComplete()
      : this.score >= this.scoreTarget;

    if (this.mode === 'level' && this.movesLeft === 0 && !goalMet) {
      this.state = STATE.LOCKED;
      this.time.delayedCall(300, () => {
        this.events.emit('gameOver', {
          score: this.score,
          level: this.level,
          levelType: this.levelType,
          collectionGoal: this.collectionGoal,
        });
      });
    } else {
      this.state = STATE.IDLE;
      this._startHintTimer();
    }
  }

  /**
   * Returns true if all collection goals have been met.
   * @returns {boolean}
   */
  _isCollectionComplete() {
    return this.collectionGoal?.every(g => g.collected >= g.required) ?? false;
  }

  /**
   * Tweens two sprites to each other's world positions and calls onComplete when both finish.
   * @param {Phaser.GameObjects.Graphics} s1
   * @param {Phaser.GameObjects.Graphics} s2
   * @param {{x: number, y: number}} pos1 - Target position for s1.
   * @param {{x: number, y: number}} pos2 - Target position for s2.
   * @param {Function} onComplete
   */
  _animateSwap(s1, s2, pos1, pos2, onComplete) {
    let done = 0;
    const check = () => { if (++done === 2) onComplete(); };
    this.tweens.add({ targets: s1, x: pos2.x, y: pos2.y, duration: 180, ease: 'Power2', onComplete: check });
    this.tweens.add({ targets: s2, x: pos1.x, y: pos1.y, duration: 180, ease: 'Power2', onComplete: check });
  }

  /**
   * Recursively resolves all matches on the board: scores points, plays burst effects,
   * clears matched cells, applies gravity, and loops until no matches remain.
   * @param {number} combo - Current combo multiplier (starts at 1, increments each cascade).
   */
  _resolveMatches(combo) {
    const matches = this.grid.findMatches();
    if (matches.length === 0) {
      if (!this.grid.hasValidMoves()) {
        this._reshuffle();
      } else {
        this._checkMovesExhausted();
      }
      return;
    }

    this.events.emit('combo', { combo });

    const points = matches.length * POINTS_PER_GEM * combo;
    this.score += points;
    this.events.emit('scoreUpdate', { score: this.score });

    // Per-gem effects and collection tracking (must happen before clearMatches)
    let collectionChanged = false;
    for (const { row, col } of matches) {
      const { x, y } = this._gridToWorld(row, col);
      const type = this.grid.get(row, col);
      const color = this.theme.gems[type];

      if (this.levelType === 'collection') {
        const goal = this.collectionGoal.find(g => g.type === type);
        if (goal && goal.collected < goal.required) {
          goal.collected++;
          collectionChanged = true;
          this._collectionBurst(x, y, color);
        } else {
          this._burst(x, y, color);
        }
      } else {
        this._burst(x, y, color);
      }
    }

    if (collectionChanged) {
      this.events.emit('collectionUpdate', { goals: this.collectionGoal });
    }

    this.grid.clearMatches(matches);

    const toDestroy = [];
    for (const { row, col } of matches) {
      const sprite = this.gemSprites[row][col];
      if (sprite) toDestroy.push(sprite);
      this.gemSprites[row][col] = null;
    }

    let fadeDone = 0;
    const afterFade = () => {
      if (++fadeDone < toDestroy.length) return;
      toDestroy.forEach(s => s.destroy());
      this._applyGravityAnimated(combo);
    };

    if (toDestroy.length === 0) { this._applyGravityAnimated(combo); return; }

    for (const sprite of toDestroy) {
      this.tweens.add({
        targets: sprite,
        scaleX: 1.4, scaleY: 1.4, alpha: 0,
        duration: 200, ease: 'Power2',
        onComplete: afterFade,
      });
    }

    // Level complete check — works for both types
    if (this.mode === 'level') {
      const complete = this.levelType === 'collection'
        ? this._isCollectionComplete()
        : this.score >= this.scoreTarget;
      if (complete && this.state !== STATE.LOCKED) {
        this.time.delayedCall(600, () => {
          this.state = STATE.LOCKED;
          this.events.emit('levelComplete', { level: this.level });
        });
      }
    }
  }

  /**
   * Applies gravity to the grid and animates gems falling to their new positions.
   * Spawns new gems for empty slots, then calls _resolveMatches for the next cascade.
   * @param {number} combo - Combo counter passed through from _resolveMatches.
   */
  _applyGravityAnimated(combo) {
    const moves = this.grid.applyGravity();
    if (moves.length === 0) {
      this.time.delayedCall(200, () => this._resolveMatches(combo + 1));
      return;
    }

    let animCount = 0;
    const onDone = () => {
      if (++animCount < moves.length) return;
      this.time.delayedCall(80, () => this._resolveMatches(combo + 1));
    };

    // Snapshot sprite positions before reassigning
    const snap = this.gemSprites.map(r => [...r]);

    for (const move of moves) {
      const { fromRow, col, toRow, type, isNew } = move;
      const { x, y: toY } = this._gridToWorld(toRow, col);

      if (isNew) {
        // fromRow = segStart - spawnOffset (may be negative for top segment,
        // or a small positive for segments below a blocker)
        const startY = fromRow >= 0
          ? this._gridToWorld(fromRow, col).y   // spawn near the blocker above
          : GRID_OFFSET_Y - Math.abs(fromRow) * GEM_SIZE; // spawn above grid

        const sprite = this.add.graphics();
        sprite.setPosition(x, startY);
        this._drawGemGraphic(sprite, type);
        this.gemSprites[toRow][col] = sprite;
        this.tweens.add({
          targets: sprite,
          y: toY,
          duration: 240 + toRow * 16,
          ease: 'Bounce.easeOut',
          onComplete: onDone,
        });
      } else {
        const sprite = snap[fromRow][col];
        if (!sprite) { animCount++; onDone(); continue; }
        this.gemSprites[toRow][col] = sprite;
        if (fromRow !== toRow) this.gemSprites[fromRow][col] = null;
        this.tweens.add({
          targets: sprite,
          y: toY,
          duration: 200 + (toRow - fromRow) * 30,
          ease: 'Power2',
          onComplete: onDone,
        });
      }
    }
  }

  // ─── Reshuffle ─────────────────────────────────────────────────────────────

  /**
   * Fades out all gems, reshuffles the grid, rebuilds sprites, and fades back in.
   * Emits the 'reshuffle' event for the UI.
   */
  _reshuffle() {
    this.events.emit('reshuffle');
    this.state = STATE.ANIMATING;

    const gemList = this.gemSprites.flat().filter(Boolean);
    this.tweens.add({
      targets: gemList,
      alpha: 0,
      duration: 300,
      onComplete: () => {
        gemList.forEach(s => s.destroy());
        this.grid.reshuffleGems(); // keep blockers, reshuffle only gems
        this._buildGemSprites();
        const newGems = this.gemSprites.flat().filter(Boolean);
        newGems.forEach(s => s.setAlpha(0));
        this.tweens.add({
          targets: newGems,
          alpha: 1,
          duration: 400,
          onComplete: () => {
            this.state = STATE.IDLE;
            this._startHintTimer();
          },
        });
      },
    });
  }

  // ─── Hint system ───────────────────────────────────────────────────────────

  /**
   * Cancels any existing hint timer and starts a new one using the level's hint delay.
   */
  _startHintTimer() {
    if (this._hintTimer) { this._hintTimer.remove(false); this._hintTimer = null; }
    if (!this.hintDelay) return; // no hints for this level
    this._hintTimer = this.time.delayedCall(this.hintDelay, this._showHint, [], this);
  }

  /**
   * Finds the first valid move and applies a pulse tween to that gem as a hint.
   * Only runs when the scene state is IDLE.
   */
  _showHint() {
    if (this.state !== STATE.IDLE) return;
    const move = this.grid.findFirstValidMove();
    if (!move) return;
    const sprite = this.gemSprites[move.row][move.col];
    if (!sprite) return;
    this._hintSprite = sprite;
    this._hintTween = this.tweens.add({
      targets: sprite,
      scaleX: 1.22,
      scaleY: 1.22,
      alpha: 0.65,
      duration: 550,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  /**
   * Cancels the hint timer, stops the hint tween, and resets the hinted gem's scale and alpha.
   */
  _clearHint() {
    if (this._hintTimer) { this._hintTimer.remove(false); this._hintTimer = null; }
    if (this._hintTween) { this._hintTween.stop(); this._hintTween = null; }
    if (this._hintSprite) {
      this._hintSprite.setScale(1).setAlpha(1);
      this._hintSprite = null;
    }
  }

  // ─── Particles ─────────────────────────────────────────────────────────────

  /**
   * Plays a dramatic multi-layer burst effect for collecting a required gem:
   * particle spray, white flash, expanding rings, and a full-screen color pulse.
   * @param {number} x - World x position.
   * @param {number} y - World y position.
   * @param {number} color - Gem color as a hex integer.
   */
  _collectionBurst(x, y, color) {
    // Large particle spray (double count, bigger, farther)
    const count = 18;
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + Math.random() * 0.3;
      const p = this.add.graphics();
      p.fillStyle(color, 1);
      p.fillCircle(0, 0, Phaser.Math.Between(4, 9));
      p.setPosition(x, y);
      const dist = Phaser.Math.Between(45, 90);
      this.tweens.add({
        targets: p,
        x: x + Math.cos(angle) * dist,
        y: y + Math.sin(angle) * dist,
        alpha: 0,
        scaleX: 0.15,
        scaleY: 0.15,
        duration: Phaser.Math.Between(420, 680),
        ease: 'Power2',
        onComplete: () => p.destroy(),
      });
    }

    // Bright white flash circle that punches out
    const flash = this.add.graphics();
    flash.fillStyle(0xffffff, 0.92);
    flash.fillCircle(x, y, GEM_SIZE * 0.48);
    this.tweens.add({
      targets: flash,
      scaleX: 2.8,
      scaleY: 2.8,
      alpha: 0,
      duration: 280,
      ease: 'Power3',
      onComplete: () => flash.destroy(),
    });

    // Colored outer ring — wide, fast
    const ring1 = this.add.graphics();
    ring1.lineStyle(3.5, color, 1);
    ring1.strokeCircle(x, y, 14);
    this.tweens.add({
      targets: ring1,
      scaleX: 5.5,
      scaleY: 5.5,
      alpha: 0,
      duration: 520,
      ease: 'Power2',
      onComplete: () => ring1.destroy(),
    });

    // White inner ring — delayed slightly
    const ring2 = this.add.graphics();
    ring2.lineStyle(2, 0xffffff, 0.85);
    ring2.strokeCircle(x, y, 10);
    this.tweens.add({
      targets: ring2,
      scaleX: 3.8,
      scaleY: 3.8,
      alpha: 0,
      delay: 70,
      duration: 380,
      ease: 'Power2',
      onComplete: () => ring2.destroy(),
    });

    // Full-screen color pulse
    this._screenPulse(color);
  }

  /**
   * Briefly overlays the entire screen with a translucent color flash.
   * @param {number} color - Flash color as a hex integer.
   */
  _screenPulse(color) {
    const W = this.scale.width;
    const H = this.scale.height;
    const flash = this.add.graphics();
    flash.fillStyle(color, 0.16);
    flash.fillRect(0, 0, W, H);
    this.tweens.add({
      targets: flash,
      alpha: 0,
      duration: 320,
      ease: 'Power2',
      onComplete: () => flash.destroy(),
    });
  }

  /**
   * Plays a small particle burst and expanding ring at the given position.
   * @param {number} x - World x position.
   * @param {number} y - World y position.
   * @param {number} color - Particle color as a hex integer.
   */
  _burst(x, y, color) {
    const count = 8;
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      const p = this.add.graphics();
      p.fillStyle(color, 0.9);
      p.fillCircle(0, 0, Phaser.Math.Between(3, 6));
      p.setPosition(x, y);
      const dist = Phaser.Math.Between(22, 48);
      this.tweens.add({
        targets: p,
        x: x + Math.cos(angle) * dist,
        y: y + Math.sin(angle) * dist,
        alpha: 0, scaleX: 0.3, scaleY: 0.3,
        duration: Phaser.Math.Between(320, 520),
        ease: 'Power2',
        onComplete: () => p.destroy(),
      });
    }
    const ring = this.add.graphics();
    ring.lineStyle(2, this.theme.glow, 0.7);
    ring.strokeCircle(x, y, 10);
    this.tweens.add({
      targets: ring,
      scaleX: 2.8, scaleY: 2.8, alpha: 0,
      duration: 380, ease: 'Power2',
      onComplete: () => ring.destroy(),
    });
  }
}
