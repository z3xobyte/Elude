export class Renderer {
  constructor(ctx) {
    this.ctx = ctx;
    this.backgroundPattern = null;
    this.offscreenCanvas = document.createElement("canvas");
    this.offscreenCtx = this.offscreenCanvas.getContext("2d");
    this.tileRenderCache = new Map();
    this.lastCamera = { x: 0, y: 0, width: 0, height: 0, zoomFactor: 0 };
    this.dirtyCache = true;
    this.arrowSize = 20;

    this.tile_colors = ["#333333", "#ffffff", "#d3d3d3", "#fff17b", "#d3d3d3"];
    this.default_tile_color = "#333333";

    this.setCanvasDimensions();

    window.addEventListener("resize", this.handleResize.bind(this));

    this.enableHardwareAcceleration(this.ctx);
    this.enableHardwareAcceleration(this.offscreenCtx);

    this.spatialGrid = new Map();
    this.cellSize = 256;
  }

  _hexToRgb(hex) {
    if (!hex || !hex.startsWith("#")) return null;
    hex = hex.slice(1);
    let r, g, b;
    if (hex.length === 3) {
        r = parseInt(hex[0] + hex[0], 16);
        g = parseInt(hex[1] + hex[1], 16);
        b = parseInt(hex[2] + hex[2], 16);
    } else if (hex.length === 6) {
        r = parseInt(hex.substring(0, 2), 16);
        g = parseInt(hex.substring(2, 4), 16);
        b = parseInt(hex.substring(4, 6), 16);
    } else {
        return null; 
    }
    if (isNaN(r) || isNaN(g) || isNaN(b)) return null;
    return { r, g, b };
  }

  handleResize() {
    if (this.resizeTimeout) {
      clearTimeout(this.resizeTimeout);
    }

    this.resizeTimeout = setTimeout(() => {
      this.setCanvasDimensions();
      this.lastCamera.width = 0;
      this.lastCamera.height = 0;
      this.dirtyCache = true;
    }, 100);
  }

  setCanvasDimensions() {
    if (this.ctx.canvas.parentElement) {
      const parent = this.ctx.canvas.parentElement;
      const styles = window.getComputedStyle(parent);
      const width = parseInt(styles.width, 10);
      const height = parseInt(styles.height, 10);

      this.ctx.canvas.width = width;
      this.ctx.canvas.height = height;
      this.offscreenCanvas.width = width;
      this.offscreenCanvas.height = height;
    }
  }

  enableHardwareAcceleration(context) {
    context.imageSmoothingEnabled = false;

    if (context === this.ctx) {
      context.canvas.style.transform = "translateZ(0)";
      context.canvas.style.backfaceVisibility = "hidden";
      context.canvas.style.position = "absolute";
      context.canvas.style.width = "100%";
      context.canvas.style.height = "100%";

      if (
        !context.canvas.parentElement ||
        window.getComputedStyle(context.canvas.parentElement).position ===
          "static"
      ) {
        context.canvas.style.top = "0";
        context.canvas.style.left = "0";
      }
    }
  }

  updateSpatialGrid(entities, entityType) {
    for (const cell of this.spatialGrid.values()) {
      if (cell[entityType]) {
        cell[entityType] = [];
      }
    }

    if (!entities || entities.size === 0) return;

    for (const [id, entity] of entities) {
      if (!entity) continue;

      const cellX = Math.floor(entity.x / this.cellSize);
      const cellY = Math.floor(entity.y / this.cellSize);
      const cellKey = `${cellX},${cellY}`;

      if (!this.spatialGrid.has(cellKey)) {
        this.spatialGrid.set(cellKey, {
          players: [],
          enemies: [],
          bullets: [],
        });
      }

      const cell = this.spatialGrid.get(cellKey);
      if (!cell[entityType]) {
        cell[entityType] = [];
      }
      cell[entityType].push({ id, entity });
    }
  }

  getVisibleEntities(entityType, camera) {
    const visibleEntities = new Map();

    const startCellX = Math.floor(
      (camera.x - camera.width / 2) / this.cellSize,
    );
    const endCellX = Math.floor(
      (camera.x + camera.width * 1.5) / this.cellSize,
    );
    const startCellY = Math.floor(
      (camera.y - camera.height / 2) / this.cellSize,
    );
    const endCellY = Math.floor(
      (camera.y + camera.height * 1.5) / this.cellSize,
    );

    for (let cellX = startCellX; cellX <= endCellX; cellX++) {
      for (let cellY = startCellY; cellY <= endCellY; cellY++) {
        const cellKey = `${cellX},${cellY}`;
        const cell = this.spatialGrid.get(cellKey);

        if (cell && cell[entityType]) {
          for (const { id, entity } of cell[entityType]) {
            visibleEntities.set(id, entity);
          }
        }
      }
    }

    return visibleEntities;
  }

  renderMap(map, mapWidth, mapHeight, tileSize, camera) {
    if (!map || !Array.isArray(map) || map.length === 0) {
      return;
    }

    const cameraChanged =
      this.lastCamera.x !== camera.x ||
      this.lastCamera.y !== camera.y ||
      this.lastCamera.width !== camera.width ||
      this.lastCamera.height !== camera.height ||
      this.lastCamera.zoomFactor !== camera.zoomFactor;

    const forceRedraw = !this.frameCount || this.frameCount < 5;
    this.frameCount = (this.frameCount || 0) + 1;

    if (cameraChanged || this.dirtyCache || forceRedraw) {
      this.lastCamera = { ...camera };

      this.offscreenCtx.fillStyle = this.tile_colors[0];
      this.offscreenCtx.fillRect(
        0,
        0,
        this.offscreenCanvas.width,
        this.offscreenCanvas.height,
      );

      const borderFraction = 1.5 / 40;

      const visibleMinX = Math.max(0, Math.floor(camera.x / tileSize) - 2);
      const visibleMaxX = Math.min(mapWidth -1 , Math.ceil((camera.x + camera.width) / tileSize) + 2);
      const visibleMinY = Math.max(0, Math.floor(camera.y / tileSize) - 2);
      const visibleMaxY = Math.min(mapHeight -1, Math.ceil((camera.y + camera.height) / tileSize) + 2);
      
      for (let y = visibleMinY; y <= visibleMaxY; y++) {
        if (!map[y]) continue;
        for (let x = visibleMinX; x <= visibleMaxX; x++) {
          if (map[y][x] === undefined) continue;
          
          const tileType = map[y][x];
          const color = this.tile_colors[tileType] || this.default_tile_color;

          const worldX = x * tileSize;
          const worldY = y * tileSize;
          if (worldX + tileSize < camera.x || worldX > camera.x + camera.width ||
              worldY + tileSize < camera.y || worldY > camera.y + camera.height) {
          }

          const screenPos = camera.worldToScreen(worldX, worldY);
          const screenSize = tileSize * camera.zoomFactor;

          this.offscreenCtx.fillStyle = color + "b0";
          this.offscreenCtx.fillRect(
            Math.floor(screenPos.x),
            Math.floor(screenPos.y),
            Math.ceil(screenSize),
            Math.ceil(screenSize)
          );

          const borderVisualSize = screenSize * borderFraction;
          this.offscreenCtx.fillStyle = color;
          this.offscreenCtx.fillRect(
            Math.floor(screenPos.x + borderVisualSize),
            Math.floor(screenPos.y + borderVisualSize),
            Math.ceil(screenSize - 2 * borderVisualSize),
            Math.ceil(screenSize - 2 * borderVisualSize)
          );

          if (camera.zoomFactor < 1.0) {
            const zoomOutOverlayAlpha = Math.max(0, Math.min(1, 1 - camera.zoomFactor * camera.zoomFactor));
            if (zoomOutOverlayAlpha > 0.01) {
                const rgbColor = this._hexToRgb(color);
                if (rgbColor) {
                    this.offscreenCtx.fillStyle = `rgba(${rgbColor.r},${rgbColor.g},${rgbColor.b},${zoomOutOverlayAlpha})`;
                    this.offscreenCtx.fillRect(
                        Math.floor(screenPos.x),
                        Math.floor(screenPos.y),
                        Math.ceil(screenSize),
                        Math.ceil(screenSize)
                    );
                }
            }
          }
        }
      }
      this.dirtyCache = false;
    }

    this.ctx.clearRect(0, 0, this.ctx.canvas.width, this.ctx.canvas.height);
    this.ctx.drawImage(this.offscreenCanvas, 0, 0);
  }

  renderPlayers(players, camera) {
    if (!players || players.size === 0) return;

    this.updateSpatialGrid(players, "players");

    const visiblePlayers = this.getVisibleEntities("players", camera);
    if (visiblePlayers.size === 0) return;

    const colorGroups = new Map();
    const currentPlayer = this.getCurrentPlayer(players);

    for (const [, player] of visiblePlayers) {
      if (!player) continue;
      const screenPos = camera.worldToScreen(player.x, player.y);
      const color = player.color || "white";
      if (!colorGroups.has(color)) {
        colorGroups.set(color, []);
      }
      colorGroups.get(color).push({
        x: screenPos.x,
        y: screenPos.y,
        radius: player.radius,
        isDead: player.isDead,
        name: player.name,
      });
    }

    const deadPlayerStrokePath = new Path2D();
    let hasAnyDeadPlayers = false;

    for (const [color, playersToDraw] of colorGroups) {
      this.ctx.fillStyle = color;
      const livingPlayerFillPath = new Path2D();
      const livingPlayerStrokePath = new Path2D();
      let hasLivingInGroup = false;

      for (const p of playersToDraw) {
        if (!p.isDead) {
          livingPlayerFillPath.moveTo(p.x + p.radius, p.y);
          livingPlayerFillPath.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
          livingPlayerStrokePath.moveTo(p.x + p.radius, p.y);
          livingPlayerStrokePath.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
          hasLivingInGroup = true;
        } else {
          deadPlayerStrokePath.moveTo(p.x + p.radius, p.y);
          deadPlayerStrokePath.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
          hasAnyDeadPlayers = true;
        }
      }

      if (hasLivingInGroup) {
        this.ctx.fill(livingPlayerFillPath);
        this.ctx.strokeStyle = "#bdbdbd";
        this.ctx.lineWidth = 2;
        this.ctx.stroke(livingPlayerStrokePath);
      }
    }

    if (hasAnyDeadPlayers) {
      this.ctx.strokeStyle = "#800000";
      this.ctx.lineWidth = 2;
      this.ctx.stroke(deadPlayerStrokePath);
    }
    this.ctx.lineWidth = 1;

    this.ctx.textAlign = "center";
    this.ctx.font = 'bold 16px "Baloo Paaji 2", Arial, Helvetica, sans-serif';
    this.ctx.textBaseline = "bottom";

    for (const [, playersToDraw] of colorGroups) {
      for (const p of playersToDraw) {
        if (p.name) {
          const textX = p.x;
          const textY = p.y - p.radius - 5;
          
          this.ctx.lineWidth = 2;
          this.ctx.strokeStyle = "#bdbdbd";
          this.ctx.strokeText(p.name, textX, textY);

          this.ctx.fillStyle = "#FFFFFF";
          this.ctx.fillText(p.name, textX, textY);
        }
      }
    }

    if (currentPlayer && !currentPlayer.isDead) {
      this.renderDirectionArrows(players, currentPlayer, camera);
    }
  }

  getCurrentPlayer(players) {
    for (const [id, player] of players) {
      if (window.game && window.game.playerId === id) {
        return player;
      }
    }
    return null;
  }

  renderDirectionArrows(players, currentPlayer, camera) {
    const padding = 50;
    const centerX = this.ctx.canvas.width / 2;
    const centerY = this.ctx.canvas.height / 2;

    for (const [id, player] of players) {
      if ((window.game && window.game.playerId === id) || !player.isDead) {
        continue;
      }

      const screenPos = camera.worldToScreen(player.x, player.y);

      const isVisible = !(
        screenPos.x < -player.radius ||
        screenPos.y < -player.radius ||
        screenPos.x > this.ctx.canvas.width + player.radius ||
        screenPos.y > this.ctx.canvas.height + player.radius
      );

      if (!isVisible) {
        const dx = player.x - currentPlayer.x;
        const dy = player.y - currentPlayer.y;
        const angle = Math.atan2(dy, dx);

        let arrowX, arrowY;

        const minX = padding;
        const maxX = this.ctx.canvas.width - padding;
        const minY = padding;
        const maxY = this.ctx.canvas.height - padding;

        const dirX = Math.cos(angle);
        const dirY = Math.sin(angle);

        let t = Infinity;
        if (Math.abs(dirX) > 1e-6) {
          let t_candidate_x1 = (minX - centerX) / dirX;
          let t_candidate_x2 = (maxX - centerX) / dirX;
          if (t_candidate_x1 > 0) t = Math.min(t, t_candidate_x1);
          if (t_candidate_x2 > 0) t = Math.min(t, t_candidate_x2);
        }
        if (Math.abs(dirY) > 1e-6) {
          let t_candidate_y1 = (minY - centerY) / dirY;
          let t_candidate_y2 = (maxY - centerY) / dirY;
          if (t_candidate_y1 > 0) t = Math.min(t, t_candidate_y1);
          if (t_candidate_y2 > 0) t = Math.min(t, t_candidate_y2);
        }

        arrowX = centerX + dirX * t;
        arrowY = centerY + dirY * t;

        arrowX = Math.max(minX, Math.min(maxX, arrowX));
        arrowY = Math.max(minY, Math.min(maxY, arrowY));

        this.drawArrow(arrowX, arrowY, angle, player.color || "#FF0000");
      }
    }
  }

  drawArrow(x, y, angle, color) {
    this.ctx.save();
    this.ctx.translate(x, y);
    this.ctx.rotate(angle);

    this.ctx.beginPath();
    this.ctx.moveTo(this.arrowSize * 0.8, 0);
    this.ctx.lineTo(-this.arrowSize / 2, this.arrowSize * 0.7);
    this.ctx.lineTo(-this.arrowSize / 2, -this.arrowSize * 0.7);
    this.ctx.closePath();

    this.ctx.strokeStyle = color;
    this.ctx.lineWidth = 2;
    this.ctx.stroke();

    this.ctx.restore();
  }

  renderEnemies(enemies, previousEnemies, lerpAmount, camera) {
    if (!enemies || enemies.size === 0) return;

    this.updateSpatialGrid(enemies, "enemies");

    const visibleEnemies = this.getVisibleEntities("enemies", camera);
    if (visibleEnemies.size === 0) return;

    this.ctx.lineWidth = 3;

    const typeBatches = new Map();

    for (const [id, enemy] of visibleEnemies) {
      if (!enemy) continue;

      let x, y;
      if ("prevX" in enemy && "prevY" in enemy) {
        x = enemy.prevX + (enemy.x - enemy.prevX) * lerpAmount;
        y = enemy.prevY + (enemy.y - enemy.prevY) * lerpAmount;
      } else {
        const previousEnemy = previousEnemies.get(id);
        if (previousEnemy) {
          x = previousEnemy.x + (enemy.x - previousEnemy.x) * lerpAmount;
          y = previousEnemy.y + (enemy.y - previousEnemy.y) * lerpAmount;
        } else {
          x = enemy.x;
          y = enemy.y;
        }
      }

      const screenPos = camera.worldToScreen(x, y);

      const fillColor = enemy.type === 2 ? "#a05353" : enemy.color || "#808080";
      const strokeColor = enemy.outlineColor || "#666666";
      const batchKey = `${fillColor}|${strokeColor}`;

      if (!typeBatches.has(batchKey)) {
        typeBatches.set(batchKey, {
          fillColor,
          strokeColor,
          enemies: [],
        });
      }

      typeBatches.get(batchKey).enemies.push({
        x: screenPos.x,
        y: screenPos.y,
        radius: enemy.radius,
      });
    }

    for (const [, batch] of typeBatches) {
      this.ctx.fillStyle = batch.fillColor;
      this.ctx.beginPath();
      for (const enemy of batch.enemies) {
        this.ctx.moveTo(enemy.x + enemy.radius, enemy.y);
        this.ctx.arc(enemy.x, enemy.y, enemy.radius, 0, Math.PI * 2);
      }
      this.ctx.fill();

      this.ctx.strokeStyle = batch.strokeColor;
      this.ctx.beginPath();
      for (const enemy of batch.enemies) {
        this.ctx.moveTo(enemy.x + enemy.radius, enemy.y);
        this.ctx.arc(enemy.x, enemy.y, enemy.radius, 0, Math.PI * 2);
      }
      this.ctx.stroke();
    }

    this.ctx.lineWidth = 1;
  }

  renderBullets(bullets, previousBullets, lerpAmount, camera) {
    if (!bullets || bullets.size === 0) return;

    this.updateSpatialGrid(bullets, "bullets");

    const visibleBullets = this.getVisibleEntities("bullets", camera);
    if (visibleBullets.size === 0) return;

    this.ctx.lineWidth = 2;

    const bulletPositions = [];

    for (const [id, bullet] of visibleBullets) {
      if (!bullet) continue;

      let x, y;
      if ("prevX" in bullet && "prevY" in bullet) {
        x = bullet.prevX + (bullet.x - bullet.prevX) * lerpAmount;
        y = bullet.prevY + (bullet.y - bullet.prevY) * lerpAmount;
      } else {
        const previousBullet = previousBullets.get(id);
        if (previousBullet) {
          x = previousBullet.x + (bullet.x - previousBullet.x) * lerpAmount;
          y = previousBullet.y + (bullet.y - previousBullet.y) * lerpAmount;
        } else {
          x = bullet.x;
          y = bullet.y;
        }
      }

      const screenPos = camera.worldToScreen(x, y);
      bulletPositions.push({
        x: screenPos.x,
        y: screenPos.y,
        radius: bullet.radius,
      });
    }

    if (bulletPositions.length > 0) {
      this.ctx.fillStyle = "#a05353";
      this.ctx.beginPath();
      for (const bullet of bulletPositions) {
        this.ctx.moveTo(bullet.x + bullet.radius, bullet.y);
        this.ctx.arc(bullet.x, bullet.y, bullet.radius, 0, Math.PI * 2);
      }
      this.ctx.fill();

      this.ctx.strokeStyle = "#000";
      this.ctx.beginPath();
      for (const bullet of bulletPositions) {
        this.ctx.moveTo(bullet.x + bullet.radius, bullet.y);
        this.ctx.arc(bullet.x, bullet.y, bullet.radius, 0, Math.PI * 2);
      }
      this.ctx.stroke();
    }

    this.ctx.lineWidth = 1;
  }

  renderGridLines(
    map,
    mapWidth,
    mapHeight,
    tileSize,
    camera,
    targetCtx = this.ctx,
  ) {
  }
}
