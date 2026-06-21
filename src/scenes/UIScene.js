export class UIScene extends Phaser.Scene {
  /** Registers this scene with Phaser under the key 'UIScene'. */
  constructor() {
    super({ key: 'UIScene' });
  }

  /**
   * Builds all HUD elements: score display, goal display, moves counter, combo indicator,
   * back button, level announcement, and GameScene event listener bindings.
   * @param {object} data - Data passed from GameScene.scene.launch().
   * @param {string} data.mode - 'zen' or 'level'.
   * @param {object} data.theme - Theme configuration.
   * @param {number} data.scoreTarget - Score needed to complete a score-type level.
   * @param {number} data.level - Current level number.
   * @param {number} data.movesLeft - Remaining moves (Infinity in zen mode).
   * @param {string} data.levelType - 'score' or 'collection'.
   * @param {object[]|null} data.collectionGoal - Collection goal descriptors, or null.
   */
  create(data) {
    this.mode = data.mode;
    this.theme = data.theme;
    this.scoreTarget = data.scoreTarget;
    this.level = data.level;
    this._movesLeft = data.movesLeft;
    this.levelType = data.levelType || 'score';
    // Keep a local copy of goals so we can update collected counts
    this.collectionGoal = data.collectionGoal
      ? data.collectionGoal.map(g => ({ ...g }))
      : null;

    const W = this.scale.width;
    this._score = 0;
    this._hi = parseInt(localStorage.getItem('calm_highscore') || '0', 10);

    const baseStyle = {
      fontFamily: 'system-ui, sans-serif',
      color: this.theme.uiText,
    };

    // ── Mode label ───────────────────────────────────────────────────────────
    const modeLabel = this.mode === 'zen' ? 'ZEN' : `LEVEL ${this.level}`;
    this.add.text(W / 2, 28, modeLabel, {
      ...baseStyle, fontSize: '14px', alpha: 0.5, letterSpacing: 6,
    }).setOrigin(0.5);

    // Challenge badge — sits just below the level label, amber, only for collection levels
    if (this.levelType === 'collection') {
      const badgeBg = this.add.graphics();
      badgeBg.fillStyle(0xf59e0b, 0.18);
      badgeBg.fillRoundedRect(W / 2 - 52, 36, 104, 18, 6);
      this.add.text(W / 2, 45, 'CHALLENGE', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '10px',
        fontStyle: 'bold',
        letterSpacing: 4,
        color: '#f59e0b',
      }).setOrigin(0.5);
    }

    // ── Score ────────────────────────────────────────────────────────────────
    // Collection levels get a smaller score + pushed down to leave room for the badge
    const scoreFontSize = this.levelType === 'collection' ? '26px' : '36px';
    const scoreY = this.levelType === 'collection' ? 72 : 65;
    this.scoreTxt = this.add.text(W / 2, scoreY, '0', {
      ...baseStyle, fontSize: scoreFontSize, fontStyle: 'bold',
    }).setOrigin(0.5);

    // ── Goal display (score vs collection) ───────────────────────────────────
    if (this.mode === 'zen') {
      this.hiTxt = this.add.text(W / 2, 105, `Best: ${this._hi}`, {
        ...baseStyle, fontSize: '16px', alpha: 0.45,
      }).setOrigin(0.5);

    } else if (this.levelType === 'score') {
      this.targetTxt = this.add.text(W / 2, 100, `Target: ${this.scoreTarget.toLocaleString()}`, {
        ...baseStyle, fontSize: '15px', alpha: 0.55,
      }).setOrigin(0.5);
      this.barBg = this.add.graphics();
      this.barFill = this.add.graphics();
      this._drawBar(0);

    } else {
      // Collection level counters
      this._buildCollectionUI();
    }

    // ── Moves counter (level mode only, top-right) ───────────────────────────
    if (this.mode === 'level') {
      this.movesTxt = this.add.text(W - 20, 20, '', {
        ...baseStyle, fontSize: '13px', fontStyle: 'bold', align: 'right',
      }).setOrigin(1, 0);
      this._updateMovesDisplay(this._movesLeft);
    }

    // ── Combo indicator ──────────────────────────────────────────────────────
    const comboY = this.levelType === 'collection' ? 152 : 140;
    this.comboTxt = this.add.text(W / 2, comboY, '', {
      ...baseStyle, fontSize: '22px', fontStyle: 'bold', color: '#ffffff', alpha: 0,
    }).setOrigin(0.5);
    this._comboBaseY = comboY;

    // ── Back button ──────────────────────────────────────────────────────────
    const back = this.add.text(28, 28, '←', {
      ...baseStyle, fontSize: '24px', alpha: 0.5,
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    back.on('pointerdown', () => {
      this.scene.stop('UIScene');
      this.scene.stop('GameScene');
      this.scene.start('MenuScene');
    });

    // ── Level announcement (fades out after 2.2 s) ───────────────────────────
    if (this.mode === 'level') this._showAnnouncement();

    // ── Event listeners ──────────────────────────────────────────────────────
    const gs = this.scene.get('GameScene');
    gs.events.on('scoreUpdate', this._onScore, this);
    gs.events.on('combo', this._onCombo, this);
    gs.events.on('levelComplete', this._onLevelComplete, this);
    gs.events.on('reshuffle', this._onReshuffle, this);
    gs.events.on('movesUpdate', this._onMovesUpdate, this);
    gs.events.on('gameOver', this._onGameOver, this);
    gs.events.on('collectionUpdate', this._onCollectionUpdate, this);
  }

  // ─── Collection UI ─────────────────────────────────────────────────────────

  /**
   * Builds the collection-mode HUD: a "COLLECT" label and per-goal colored gem counters.
   */
  _buildCollectionUI() {
    const W = this.scale.width;
    const goals = this.collectionGoal;
    const count = goals.length;
    const spacing = count === 1 ? 0 : 80;
    const centerX = W / 2;
    const y = 128;

    this.collectionCounterTxts = [];
    this.collectionCounterDots = [];

    // Small "COLLECT" label
    this.add.text(centerX, 97, 'COLLECT', {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '11px',
      letterSpacing: 5,
      color: '#f59e0b',
      alpha: 0.7,
    }).setOrigin(0.5);

    goals.forEach((goal, i) => {
      const x = centerX + (i - (count - 1) / 2) * spacing;
      const color = this.theme.gems[goal.type];
      const hex = '#' + color.toString(16).padStart(6, '0');

      // Colored dot indicator
      const dot = this.add.graphics();
      dot.fillStyle(color, 1);
      dot.fillCircle(x - 22, y + 2, 7);
      dot.fillStyle(0xffffff, 0.3);
      dot.fillCircle(x - 25, y, 3);
      this.collectionCounterDots.push(dot);

      // "collected / required" text
      const txt = this.add.text(x + (count === 1 ? -6 : 2), y, `0 / ${goal.required}`, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '20px',
        fontStyle: 'bold',
        color: hex,
      }).setOrigin(count === 1 ? 0.5 : 0, 0.5);
      this.collectionCounterTxts.push(txt);
    });
  }

  /**
   * Updates the collection counter texts to reflect the latest collected counts.
   * Plays a pop animation on each counter that changed.
   * @param {{type: number, required: number, collected: number}[]} goals
   */
  _updateCollectionCounters(goals) {
    goals.forEach((goal, i) => {
      const txt = this.collectionCounterTxts?.[i];
      if (!txt) return;
      const prev = parseInt(txt.text.split('/')[0].trim(), 10);
      if (goal.collected !== prev) {
        txt.setText(`${goal.collected} / ${goal.required}`);
        // Satisfying pop animation
        this.tweens.killTweensOf(txt);
        this.tweens.add({
          targets: txt,
          scaleX: 1.35,
          scaleY: 1.35,
          duration: 100,
          yoyo: true,
          ease: 'Power2',
        });
      }
    });
  }

  // ─── Level-start announcement ──────────────────────────────────────────────

  /**
   * Shows a full-screen overlay announcing the level objective.
   * Displays score target for score levels, or gem collection targets for collection levels.
   * Auto-fades after 2.2 seconds.
   */
  _showAnnouncement() {
    const W = this.scale.width;
    const H = this.scale.height;
    const items = [];

    const overlay = this.add.graphics();
    overlay.fillStyle(0x000000, 0.62);
    overlay.fillRect(0, 0, W, H);
    items.push(overlay);

    const baseStyle = {
      fontFamily: 'system-ui, sans-serif',
      color: '#ffffff',
    };

    if (this.levelType === 'score') {
      items.push(this.add.text(W / 2, H * 0.38, 'SCORE GOAL', {
        ...baseStyle, fontSize: '14px', letterSpacing: 8, alpha: 0.55,
      }).setOrigin(0.5));
      items.push(this.add.text(W / 2, H * 0.46, this.scoreTarget.toLocaleString(), {
        ...baseStyle, fontSize: '52px', fontStyle: 'bold',
      }).setOrigin(0.5));
      items.push(this.add.text(W / 2, H * 0.54, 'pts', {
        ...baseStyle, fontSize: '18px', alpha: 0.45,
      }).setOrigin(0.5));

    } else {
      // Amber "CHALLENGE LEVEL" banner
      const bannerBg = this.add.graphics();
      bannerBg.fillStyle(0xf59e0b, 0.22);
      bannerBg.fillRoundedRect(W / 2 - 110, H * 0.30, 220, 34, 10);
      items.push(bannerBg);
      items.push(this.add.text(W / 2, H * 0.317, 'CHALLENGE LEVEL', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '14px',
        fontStyle: 'bold',
        letterSpacing: 5,
        color: '#f59e0b',
      }).setOrigin(0.5));

      items.push(this.add.text(W / 2, H * 0.40, 'COLLECT', {
        ...baseStyle, fontSize: '13px', letterSpacing: 8, alpha: 0.5,
      }).setOrigin(0.5));

      const goals = this.collectionGoal;
      const count = goals.length;
      goals.forEach((goal, i) => {
        const x = W / 2 + (i - (count - 1) / 2) * 110;
        const y = H * 0.50;
        const color = this.theme.gems[goal.type];
        const hex = '#' + color.toString(16).padStart(6, '0');

        const dot = this.add.graphics();
        dot.fillStyle(color, 1);
        dot.fillCircle(x, y - 18, 14);
        dot.fillStyle(0xffffff, 0.3);
        dot.fillCircle(x - 5, y - 24, 5);
        items.push(dot);

        items.push(this.add.text(x, y + 4, `${goal.required}`, {
          ...baseStyle, fontSize: '32px', fontStyle: 'bold', color: hex,
        }).setOrigin(0.5));
        items.push(this.add.text(x, y + 32, 'needed', {
          ...baseStyle, fontSize: '12px', alpha: 0.4,
        }).setOrigin(0.5));
      });
    }

    // Auto-fade after 2.2 s
    this.time.delayedCall(2200, () => {
      this.tweens.add({
        targets: items,
        alpha: 0,
        duration: 350,
        ease: 'Power2',
        onComplete: () => items.forEach(o => o.destroy()),
      });
    });
  }

  // ─── Progress bar (score levels only) ──────────────────────────────────────

  /**
   * Redraws the score progress bar to the given fill ratio.
   * @param {number} ratio - Fill proportion between 0 and 1.
   */
  _drawBar(ratio) {
    const W = this.scale.width;
    const bw = W - 80, bh = 8, bx = 40, by = 116;
    this.barBg.clear();
    this.barBg.fillStyle(0xffffff, 0.1);
    this.barBg.fillRoundedRect(bx, by, bw, bh, 4);
    this.barFill.clear();
    this.barFill.fillStyle(this.theme.glow, 0.8);
    this.barFill.fillRoundedRect(bx, by, Math.max(0, bw * ratio), bh, 4);
  }

  // ─── Event handlers ────────────────────────────────────────────────────────

  /**
   * Updates the score display and, for zen mode, persists a new high score.
   * For score-type levels, also updates the progress bar.
   * @param {{score: number}} param
   */
  _onScore({ score }) {
    this._score = score;
    this.scoreTxt.setText(score.toLocaleString());

    if (this.mode === 'zen') {
      if (score > this._hi) {
        this._hi = score;
        localStorage.setItem('calm_highscore', score);
        this.hiTxt.setText(`Best: ${this._hi}`);
      }
    } else if (this.levelType === 'score' && this.barFill) {
      this._drawBar(Math.min(1, score / this.scoreTarget));
    }
  }

  /**
   * Displays the combo multiplier text and animates it upward before fading out.
   * Only shown for combos of 2 or higher.
   * @param {{combo: number}} param
   */
  _onCombo({ combo }) {
    if (combo < 2) return;
    this.comboTxt.setText(`x${combo} COMBO!`);
    this.comboTxt.setAlpha(1);
    this.tweens.add({
      targets: this.comboTxt,
      alpha: 0,
      y: this.comboTxt.y - 20,
      duration: 900,
      ease: 'Power2',
      onComplete: () => { this.comboTxt.setY(this._comboBaseY); },
    });
  }

  /**
   * Syncs local collection goal state and updates the counter displays.
   * @param {{goals: {type: number, required: number, collected: number}[]}} param
   */
  _onCollectionUpdate({ goals }) {
    // Sync local copy
    goals.forEach((g, i) => {
      if (this.collectionGoal[i]) this.collectionGoal[i].collected = g.collected;
    });
    this._updateCollectionCounters(goals);
  }

  /**
   * Stores the updated moves-left value and refreshes the moves display.
   * @param {{movesLeft: number}} param
   */
  _onMovesUpdate({ movesLeft }) {
    this._movesLeft = movesLeft;
    this._updateMovesDisplay(movesLeft);
  }

  /**
   * Refreshes the moves-remaining text. Turns red and pulses when 5 or fewer moves remain.
   * @param {number} movesLeft
   */
  _updateMovesDisplay(movesLeft) {
    if (!this.movesTxt) return;
    const label = movesLeft === 1 ? 'move' : 'moves';
    this.movesTxt.setText(`${movesLeft} ${label} left`);
    const critical = movesLeft <= 5;
    this.movesTxt.setColor(critical ? '#ff6b6b' : this.theme.uiText);
    if (critical && movesLeft > 0) {
      this.tweens.killTweensOf(this.movesTxt);
      this.tweens.add({
        targets: this.movesTxt,
        alpha: 0.3,
        duration: 180,
        yoyo: true,
        repeat: 1,
        onComplete: () => this.movesTxt.setAlpha(1),
      });
    }
  }

  /**
   * Shows the level-complete overlay with Next Level and Menu buttons.
   * @param {{level: number}} param
   */
  _onLevelComplete({ level }) {
    const W = this.scale.width;
    const H = this.scale.height;
    const overlay = this.add.graphics();
    overlay.fillStyle(0x000000, 0.55);
    overlay.fillRect(0, 0, W, H);

    this.add.text(W / 2, H * 0.38, 'LEVEL', {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '28px',
      color: this.theme.uiText,
      alpha: 0.6,
    }).setOrigin(0.5);

    this.add.text(W / 2, H * 0.45, 'COMPLETE!', {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '48px',
      fontStyle: 'bold',
      color: '#ffffff',
    }).setOrigin(0.5);

    this._makeModalBtn(W / 2, H * 0.58, 'NEXT LEVEL', () => {
      this.scene.stop('UIScene');
      this.scene.stop('GameScene');
      this.scene.start('GameScene', { mode: 'level', level: level + 1 });
    });
    this._makeModalBtn(W / 2, H * 0.68, 'MENU', () => {
      this.scene.stop('UIScene');
      this.scene.stop('GameScene');
      this.scene.start('MenuScene');
    });
  }

  /**
   * Shows the game-over overlay with final score or collection progress and retry/menu buttons.
   * @param {{score: number, level: number, levelType: string, collectionGoal: object[]|null}} param
   */
  _onGameOver({ score, level, levelType, collectionGoal }) {
    const W = this.scale.width;
    const H = this.scale.height;
    const overlay = this.add.graphics();
    overlay.fillStyle(0x000000, 0.65);
    overlay.fillRect(0, 0, W, H);

    if (levelType === 'collection') {
      this.add.text(W / 2, H * 0.25, 'CHALLENGE LEVEL', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '12px',
        fontStyle: 'bold',
        letterSpacing: 4,
        color: '#f59e0b',
        alpha: 0.85,
      }).setOrigin(0.5);
    }

    this.add.text(W / 2, H * 0.30, 'OUT OF MOVES', {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '26px',
      fontStyle: 'bold',
      color: '#ff6b6b',
    }).setOrigin(0.5);

    if (levelType === 'collection' && collectionGoal) {
      // Show collection progress per gem type
      const count = collectionGoal.length;
      collectionGoal.forEach((goal, i) => {
        const x = W / 2 + (i - (count - 1) / 2) * 110;
        const y = H * 0.42;
        const color = this.theme.gems[goal.type];
        const hex = '#' + color.toString(16).padStart(6, '0');

        const dot = this.add.graphics();
        dot.fillStyle(color, 1);
        dot.fillCircle(x, y - 14, 10);

        this.add.text(x, y + 6, `${goal.collected} / ${goal.required}`, {
          fontFamily: 'system-ui, sans-serif',
          fontSize: '22px',
          fontStyle: 'bold',
          color: hex,
        }).setOrigin(0.5);
      });

      this.add.text(W / 2, H * 0.53, `Score: ${score.toLocaleString()}`, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '16px',
        color: this.theme.uiText,
        alpha: 0.45,
      }).setOrigin(0.5);

    } else {
      this.add.text(W / 2, H * 0.40, score.toLocaleString(), {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '48px',
        fontStyle: 'bold',
        color: '#ffffff',
      }).setOrigin(0.5);

      this.add.text(W / 2, H * 0.48, `Target: ${this.scoreTarget.toLocaleString()}`, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '18px',
        color: this.theme.uiText,
        alpha: 0.5,
      }).setOrigin(0.5);
    }

    this._makeModalBtn(W / 2, H * 0.61, 'TRY AGAIN', () => {
      this.scene.stop('UIScene');
      this.scene.stop('GameScene');
      this.scene.start('GameScene', { mode: 'level', level });
    });
    this._makeModalBtn(W / 2, H * 0.72, 'MENU', () => {
      this.scene.stop('UIScene');
      this.scene.stop('GameScene');
      this.scene.start('MenuScene');
    });
  }

  /**
   * Briefly shows a "RESHUFFLING..." message in the HUD.
   */
  _onReshuffle() {
    const W = this.scale.width;
    const msg = this.add.text(W / 2, 160, 'RESHUFFLING...', {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '16px',
      color: '#ffffff',
      alpha: 0.7,
    }).setOrigin(0.5);
    this.time.delayedCall(1200, () => msg.destroy());
  }

  /**
   * Creates a modal-style rounded-rect button with a label and tap handler.
   * @param {number} x - Center x position.
   * @param {number} y - Center y position.
   * @param {string} label - Button text.
   * @param {Function} cb - Callback invoked on pointer-down.
   */
  _makeModalBtn(x, y, label, cb) {
    const W = 200, H = 48;
    const bg = this.add.graphics();
    bg.fillStyle(this.theme.ui, 0.9);
    bg.fillRoundedRect(x - W / 2, y - H / 2, W, H, 14);
    this.add.text(x, y, label, {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '18px',
      fontStyle: 'bold',
      color: '#ffffff',
    }).setOrigin(0.5);
    const zone = this.add.zone(x, y, W, H).setInteractive();
    zone.on('pointerdown', cb);
  }
}
