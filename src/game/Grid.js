import { GRID_COLS, GRID_ROWS } from './constants.js';

export const BLOCKER = -2;

export class Grid {
  /**
   * Creates a new Grid instance.
   * @param {object} [options={}]
   * @param {number} [options.gemTypes=4] - Number of distinct gem colors in play.
   * @param {number} [options.blockerCount=0] - Number of immovable blocker tiles to place.
   */
  constructor({ gemTypes = 4, blockerCount = 0 } = {}) {
    this.gemTypes = gemTypes;
    this.blockerCount = blockerCount;
    this.cells = [];
    this.init();
  }

  /**
   * Fully resets the grid: re-places blockers and fills gem cells,
   * retrying until no initial matches exist.
   */
  init() {
    const blockerSet = this._placeBlockers();
    let attempts = 0;
    do {
      this.cells = [];
      for (let row = 0; row < GRID_ROWS; row++) {
        this.cells[row] = [];
        for (let col = 0; col < GRID_COLS; col++) {
          this.cells[row][col] = blockerSet.has(`${row},${col}`) ? BLOCKER : this._randomGem();
        }
      }
      if (++attempts > 200) break;
    } while (this.findMatches().length > 0);
  }

  /**
   * Keeps blockers in their current positions and randomises only the gem cells.
   * Retries until the board has no pre-existing matches and has at least one valid move.
   */
  reshuffleGems() {
    const blockerSet = this._currentBlockerSet();
    let attempts = 0;
    do {
      for (let row = 0; row < GRID_ROWS; row++) {
        for (let col = 0; col < GRID_COLS; col++) {
          if (this.cells[row][col] !== BLOCKER) {
            this.cells[row][col] = this._randomGem();
          }
        }
      }
      if (++attempts > 200) break;
    } while (this.findMatches().length > 0 || !this.hasValidMoves());
  }

  /**
   * Returns true if the cell at (row, col) contains a blocker.
   * @param {number} row
   * @param {number} col
   * @returns {boolean}
   */
  isBlocker(row, col) {
    return row >= 0 && row < GRID_ROWS && col >= 0 && col < GRID_COLS
      && this.cells[row][col] === BLOCKER;
  }

  /**
   * Returns the gem type at (row, col), or -1 if the coordinates are out of bounds.
   * @param {number} row
   * @param {number} col
   * @returns {number}
   */
  get(row, col) {
    if (row < 0 || row >= GRID_ROWS || col < 0 || col >= GRID_COLS) return -1;
    return this.cells[row][col];
  }

  /**
   * Sets the gem type at (row, col).
   * @param {number} row
   * @param {number} col
   * @param {number} type - Gem type index, or -1 for empty.
   */
  set(row, col, type) {
    this.cells[row][col] = type;
  }

  /**
   * Swaps the contents of two cells.
   * @param {number} r1
   * @param {number} c1
   * @param {number} r2
   * @param {number} c2
   */
  swap(r1, c1, r2, c2) {
    const tmp = this.cells[r1][c1];
    this.cells[r1][c1] = this.cells[r2][c2];
    this.cells[r2][c2] = tmp;
  }

  /**
   * Returns true if the two cells are orthogonally adjacent (not diagonal).
   * @param {number} r1
   * @param {number} c1
   * @param {number} r2
   * @param {number} c2
   * @returns {boolean}
   */
  isAdjacent(r1, c1, r2, c2) {
    const dr = Math.abs(r1 - r2);
    const dc = Math.abs(c1 - c2);
    return (dr === 1 && dc === 0) || (dr === 0 && dc === 1);
  }

  /**
   * Finds all cells that are part of a horizontal or vertical match of 3 or more.
   * Skips blocker and empty cells.
   * @returns {{row: number, col: number}[]} Array of matched cell coordinates.
   */
  findMatches() {
    const matched = new Set();

    // Horizontal — skip any cell with value < 0 (empty or blocker)
    for (let row = 0; row < GRID_ROWS; row++) {
      let start = 0;
      while (start < GRID_COLS) {
        const v = this.cells[row][start];
        if (v < 0) { start++; continue; }
        let end = start + 1;
        while (end < GRID_COLS && this.cells[row][end] === v) end++;
        if (end - start >= 3) {
          for (let c = start; c < end; c++) matched.add(`${row},${c}`);
        }
        start = end;
      }
    }

    // Vertical
    for (let col = 0; col < GRID_COLS; col++) {
      let start = 0;
      while (start < GRID_ROWS) {
        const v = this.cells[start][col];
        if (v < 0) { start++; continue; }
        let end = start + 1;
        while (end < GRID_ROWS && this.cells[end][col] === v) end++;
        if (end - start >= 3) {
          for (let r = start; r < end; r++) matched.add(`${r},${col}`);
        }
        start = end;
      }
    }

    return [...matched].map(key => {
      const [row, col] = key.split(',').map(Number);
      return { row, col };
    });
  }

  /**
   * Sets all matched cells to empty (-1).
   * @param {{row: number, col: number}[]} matches - Coordinates of cells to clear.
   */
  clearMatches(matches) {
    for (const { row, col } of matches) {
      this.cells[row][col] = -1;
    }
  }

  /**
   * Applies gravity column by column, treating blockers as walls between segments.
   * Each contiguous non-blocker run in a column is handled independently.
   * @returns {{fromRow: number, col: number, toRow: number, type: number, isNew?: boolean}[]} Move descriptors.
   */
  applyGravity() {
    const moves = [];
    for (let col = 0; col < GRID_COLS; col++) {
      let segStart = -1;
      for (let row = 0; row <= GRID_ROWS; row++) {
        const atEnd = row === GRID_ROWS || this.cells[row][col] === BLOCKER;
        if (atEnd) {
          if (segStart !== -1) {
            this._gravitySegment(col, segStart, row - 1, moves);
            segStart = -1;
          }
        } else {
          if (segStart === -1) segStart = row;
        }
      }
    }
    return moves;
  }

  /**
   * Applies gravity within a single contiguous non-blocker column segment.
   * Packs existing gems to the bottom and fills empty slots with new random gems.
   * @param {number} col - Column index.
   * @param {number} segStart - First row of the segment.
   * @param {number} segEnd - Last row of the segment.
   * @param {{fromRow: number, col: number, toRow: number, type: number, isNew?: boolean}[]} moves - Array to push move descriptors into.
   */
  _gravitySegment(col, segStart, segEnd, moves) {
    // Pack existing gems to the bottom of the segment
    let writeRow = segEnd;
    for (let row = segEnd; row >= segStart; row--) {
      const cell = this.cells[row][col];
      if (cell >= 0) {
        if (writeRow !== row) {
          moves.push({ fromRow: row, col, toRow: writeRow, type: cell });
          this.cells[writeRow][col] = cell;
          this.cells[row][col] = -1;
        }
        writeRow--;
      }
    }
    // Fill empty slots at the top of the segment with new gems.
    // fromRow encodes where this gem spawns: segStart - spawnOffset puts it
    // at or above the row just above the segment (the blocker or off-screen).
    let spawnOffset = 1;
    for (let row = writeRow; row >= segStart; row--) {
      const type = this._randomGem();
      moves.push({ fromRow: segStart - spawnOffset, col, toRow: row, type, isNew: true });
      spawnOffset++;
      this.cells[row][col] = type;
    }
  }

  /**
   * Returns true if there is at least one valid swap that would produce a match.
   * @returns {boolean}
   */
  hasValidMoves() {
    for (let row = 0; row < GRID_ROWS; row++) {
      for (let col = 0; col < GRID_COLS; col++) {
        if (this.cells[row][col] < 0) continue;
        if (col + 1 < GRID_COLS && this.cells[row][col + 1] >= 0) {
          this.swap(row, col, row, col + 1);
          const m = this.findMatches();
          this.swap(row, col, row, col + 1);
          if (m.length > 0) return true;
        }
        if (row + 1 < GRID_ROWS && this.cells[row + 1][col] >= 0) {
          this.swap(row, col, row + 1, col);
          const m = this.findMatches();
          this.swap(row, col, row + 1, col);
          if (m.length > 0) return true;
        }
      }
    }
    return false;
  }

  /**
   * Returns the grid coordinates of one gem involved in the first valid swap, or null if none exist.
   * @returns {{row: number, col: number}|null}
   */
  findFirstValidMove() {
    for (let row = 0; row < GRID_ROWS; row++) {
      for (let col = 0; col < GRID_COLS; col++) {
        if (this.cells[row][col] < 0) continue;
        if (col + 1 < GRID_COLS && this.cells[row][col + 1] >= 0) {
          this.swap(row, col, row, col + 1);
          const m = this.findMatches();
          this.swap(row, col, row, col + 1);
          if (m.length > 0) return { row, col };
        }
        if (row + 1 < GRID_ROWS && this.cells[row + 1][col] >= 0) {
          this.swap(row, col, row + 1, col);
          const m = this.findMatches();
          this.swap(row, col, row + 1, col);
          if (m.length > 0) return { row, col };
        }
      }
    }
    return null;
  }

  // ─── Private helpers ───────────────────────────────────────────────────────

  /**
   * Returns a random gem type index in [0, gemTypes).
   * @returns {number}
   */
  _randomGem() {
    return Math.floor(Math.random() * this.gemTypes);
  }

  /**
   * Randomly selects blocker positions, avoiding the top 2 rows and the bottom row.
   * Uses a Fisher-Yates shuffle to pick from valid candidates.
   * @returns {Set<string>} Set of "row,col" strings identifying blocker positions.
   */
  _placeBlockers() {
    const set = new Set();
    if (this.blockerCount === 0) return set;
    // Valid positions: avoid top 2 rows and the very bottom row
    const candidates = [];
    for (let row = 2; row < GRID_ROWS - 1; row++) {
      for (let col = 0; col < GRID_COLS; col++) {
        candidates.push(`${row},${col}`);
      }
    }
    // Fisher-Yates shuffle
    for (let i = candidates.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
    }
    for (let i = 0; i < Math.min(this.blockerCount, candidates.length); i++) {
      set.add(candidates[i]);
    }
    return set;
  }

  /**
   * Returns a Set of "row,col" strings for all current blocker positions on the grid.
   * @returns {Set<string>}
   */
  _currentBlockerSet() {
    const set = new Set();
    for (let row = 0; row < GRID_ROWS; row++) {
      for (let col = 0; col < GRID_COLS; col++) {
        if (this.cells[row][col] === BLOCKER) set.add(`${row},${col}`);
      }
    }
    return set;
  }
}
