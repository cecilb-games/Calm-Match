// Traci's game

export const GRID_COLS = 8;
export const GRID_ROWS = 8;
export const GEM_SIZE = 52;
export const POINTS_PER_GEM = 50;

export const GRID_OFFSET_X = (480 - GRID_COLS * GEM_SIZE) / 2;
export const GRID_OFFSET_Y = 180;

// 4 rotating color themes — each has 6 gem colors (types 0-3 always present, 4 added L5+, 5 added L9+)
export const THEMES = [
  {
    name: 'Lavender',
    bg: 0x1a1a2e,
    gems: [0xa78bfa, 0x60a5fa, 0x34d399, 0xf472b6, 0xfbbf24, 0xfb7185],
    glow: 0xddd6fe,
    ui: 0x7c3aed,
    uiText: '#e0d7ff',
  },
  {
    name: 'Ocean',
    bg: 0x0f2027,
    gems: [0x06b6d4, 0x3b82f6, 0x10b981, 0x8b5cf6, 0xf472b6, 0xfbbf24],
    glow: 0xa5f3fc,
    ui: 0x0284c7,
    uiText: '#bae6fd',
  },
  {
    name: 'Twilight',
    bg: 0x16101f,
    gems: [0xc084fc, 0xf0abfc, 0xa78bfa, 0xe2c97e, 0x67e8f9, 0xfca5a5],
    glow: 0xf5d0fe,
    ui: 0x7e22ce,
    uiText: '#f3e8ff',
  },
  {
    name: 'Forest',
    bg: 0x0a1628,
    gems: [0x22c55e, 0x84cc16, 0x14b8a6, 0x6366f1, 0xf59e0b, 0xec4899],
    glow: 0xbbf7d0,
    ui: 0x15803d,
    uiText: '#dcfce7',
  },
];

/**
 * Returns the theme object for the given level, cycling through the THEMES array.
 * @param {number} level - The current game level.
 * @returns {object} Theme configuration object.
 */
export function themeForLevel(level) {
  return THEMES[(level - 1) % THEMES.length];
}

/**
 * Returns the score required to complete the given level.
 * @param {number} level
 * @returns {number}
 */
export function scoreTargetForLevel(level) {
  return 20000 + (level - 10) * 1000;
}

/**
 * Returns the number of moves allowed for the given level.
 * @param {number} level
 * @returns {number}
 */
export function movesForLevel(level) {
  if (level <= 3)  return 25;
  if (level <= 6)  return 22;
  if (level <= 10) return 20;
  if (level <= 20) return 18;
  return 15;
}

/**
 * Returns the number of gem types active for the given level (4 base, grows to 6).
 * @param {number} level
 * @returns {number}
 */
export function gemTypesForLevel(level) {
  if (level <= 4) return 4;
  if (level <= 8) return 5;
  return 6;
}

/**
 * Returns the number of immovable blocker tiles to place for the given level.
 * @param {number} level
 * @returns {number}
 */
export function blockersForLevel(level) {
  if (level <= 5)  return 0;
  if (level <= 10) return 3;
  if (level <= 20) return 5;
  return 8;
}

/**
 * Returns the total gems required across all target types for collection levels.
 * Interpolates linearly within each difficulty tier.
 * @param {number} level
 * @returns {number}
 */
export function collectionTotalForLevel(level) {
  if (level <= 4)  return Math.round(25 + (level - 1) * (10 / 3));   // 25→35
  if (level <= 10) return Math.round(35 + (level - 5) * (15 / 5));   // 35→50
  if (level <= 20) return Math.round(50 + (level - 11) * (20 / 9));  // 50→70
  return Math.min(100, 70 + (level - 21) * 3);                        // 70→100
}

/**
 * Returns milliseconds of inactivity before a hint pulse is shown, or null to disable hints.
 * @param {number} level
 * @returns {number|null}
 */
export function hintDelayForLevel(level) {
  if (level <= 4)  return 8000;
  if (level <= 10) return 12000;
  if (level <= 20) return 20000;
  return null;
}
