import { THEMES, themeForLevel } from '../game/constants.js';

export class MenuScene extends Phaser.Scene {
  /** Registers this scene with Phaser under the key 'MenuScene'. */
  constructor() {
    super({ key: 'MenuScene' });
  }

  /**
   * Builds the menu UI: background, title text, gem preview, mode buttons, and high score.
   * Reads the current level and theme from localStorage to style the scene accordingly.
   */
  create() {
    const W = this.scale.width;
    const H = this.scale.height;
    const level = parseInt(localStorage.getItem('calm_level') || '1', 10);
    const theme = themeForLevel(level);

    this.cameras.main.setBackgroundColor(theme.bg);

    // Title
    this.add.text(W / 2, H * 0.22, 'CALM', {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '72px',
      fontStyle: 'bold',
      color: theme.uiText,
      alpha: 0.9,
    }).setOrigin(0.5);

    this.add.text(W / 2, H * 0.31, 'MATCH', {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '36px',
      letterSpacing: 14,
      color: theme.uiText,
      alpha: 0.5,
    }).setOrigin(0.5);

    // Gem preview
    this._drawGemPreview(W / 2, H * 0.48, theme);

    // Buttons
    this._makeButton(W / 2, H * 0.65, 'ZEN MODE', theme, () => {
      this.scene.start('GameScene', { mode: 'zen', level: 1 });
    });

    this._makeButton(W / 2, H * 0.77, `LEVEL MODE  (Lv ${level})`, theme, () => {
      this.scene.start('GameScene', { mode: 'level', level });
    });

    // High score
    const hi = localStorage.getItem('calm_highscore') || '0';
    this.add.text(W / 2, H * 0.90, `Best: ${hi}`, {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '20px',
      color: theme.uiText,
      alpha: 0.4,
    }).setOrigin(0.5);
  }

  /**
   * Draws a horizontal row of gem shapes centered at (cx, cy) using the theme's gem colors.
   * @param {number} cx - Center x position.
   * @param {number} cy - Center y position.
   * @param {object} theme - Theme object containing gem colors and glow color.
   */
  _drawGemPreview(cx, cy, theme) {
    const size = 38;
    const gap = 12;
    const total = theme.gems.length;
    const startX = cx - ((total - 1) * (size + gap)) / 2;
    theme.gems.forEach((color, i) => {
      const x = startX + i * (size + gap);
      this._drawGem(x, cy, size, color, theme.glow, i);
    });
  }

  /**
   * Draws a single gem graphic with a glow, filled shape body, and a highlight dot.
   * @param {number} x - Center x position.
   * @param {number} y - Center y position.
   * @param {number} size - Diameter of the gem in pixels.
   * @param {number} color - Fill color as a hex integer.
   * @param {number} glowColor - Glow halo color as a hex integer.
   * @param {number} [type=0] - Shape type index (0=triangle, 1=diamond, 2=hexagon, 3=pentagon).
   */
  _drawGem(x, y, size, color, glowColor, type = 0) {
    const g = this.add.graphics();
    const r = size * 0.44;
    // Glow
    g.fillStyle(glowColor, 0.18);
    g.fillCircle(x, y, size * 0.78);
    // Shape body
    g.fillStyle(color, 1);
    g.fillPoints(this._shapePoints(type, r, x, y), true);
    // Highlight
    g.fillStyle(0xffffff, 0.28);
    g.fillCircle(x - size * 0.1, y - size * 0.2, size * 0.1);
  }

  /**
   * Returns an array of {x, y} points defining the polygon for a given gem shape type.
   * @param {number} type - Shape type (0=triangle, 1=diamond, 2=hexagon, 3=pentagon).
   * @param {number} r - Circumradius of the shape.
   * @param {number} [ox=0] - X offset for the shape center.
   * @param {number} [oy=0] - Y offset for the shape center.
   * @returns {{x: number, y: number}[]} Array of polygon vertex points.
   */
  _shapePoints(type, r, ox = 0, oy = 0) {
    const poly = (sides, startDeg) => {
      const pts = [];
      for (let i = 0; i < sides; i++) {
        const a = ((startDeg + (360 / sides) * i) * Math.PI) / 180;
        pts.push({ x: ox + Math.cos(a) * r, y: oy + Math.sin(a) * r });
      }
      return pts;
    };
    switch (type) {
      case 0: return poly(3, -90);                    // Triangle
      case 1: return [                                 // Diamond (square 45°)
        { x: ox,     y: oy - r * 0.88 },
        { x: ox + r * 0.88, y: oy     },
        { x: ox,     y: oy + r * 0.88 },
        { x: ox - r * 0.88, y: oy     },
      ];
      case 2: return poly(6, 0);                      // Hexagon
      case 3: return poly(5, -90);                    // Pentagon
      default: return poly(6, 0);
    }
  }

  /**
   * Creates an interactive rounded-rect button with a label and pointer event handlers.
   * @param {number} x - Center x position.
   * @param {number} y - Center y position.
   * @param {string} label - Text displayed on the button.
   * @param {object} theme - Theme object used for the button background color.
   * @param {Function} callback - Function called when the button is pressed.
   */
  _makeButton(x, y, label, theme, callback) {
    const W = 260, H = 54;
    const bg = this.add.graphics();
    bg.fillStyle(theme.ui, 0.85);
    bg.fillRoundedRect(x - W / 2, y - H / 2, W, H, 16);

    const txt = this.add.text(x, y, label, {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '20px',
      fontStyle: 'bold',
      color: '#ffffff',
    }).setOrigin(0.5);

    const zone = this.add.zone(x, y, W, H).setInteractive();
    zone.on('pointerover', () => { bg.setAlpha(1); });
    zone.on('pointerout', () => { bg.setAlpha(0.85); });
    zone.on('pointerdown', callback);
  }
}
