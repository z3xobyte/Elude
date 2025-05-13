const { v4: uuidv4 } = require("uuid");
const SAT = require("sat"); // Import SAT.js library

class Player {
  constructor(x, y, radius, color, name = null) {
    this.id = uuidv4();
    this.name = name || `Player ${this.id.substring(0, 4)}`;
    this.x = x;
    this.y = y;
    this.radius = radius;
    this.color = color;
    this.originalColor = color;
    this.vx = 0;
    this.vy = 0;
    this.maxSpeed = 10;
    this.originalMaxSpeed = this.maxSpeed;
    this.targetX = x;
    this.targetY = y;
    this.lastUpdateTime = Date.now();
    this.input = null;
    this.dirX = 0;
    this.dirY = 0;
    this.angle = 0;
    this.distance = 0;
    this.mouseActive = false;
    this.d_x = 0;
    this.d_y = 0;
    this.slippery = false;
    this.collisionCache = new Map();
    this.MAX_COLLISION_CACHE_SIZE = 1000;
    this.COLLISION_CACHE_EVICTION_COUNT = 100;
    this.stuckCounter = 0;
    this.lastPosition = { x: x, y: y }; // Stores position at the START of an update tick
    this.isDead = false;
    this.currentMapId = null;
    this.needsToExitTeleporterArea = null;
    this.justTeleportedFlag = false;
    this.TELEPORT_GRACE_DURATION = 100;
    this.lastTeleportTimestamp = 0;
    this.collider = new SAT.Circle(new SAT.Vector(x, y), radius);
    this.response = new SAT.Response();
  }

  setInput(input) {
    this.input = input;
    this.setupInputHandlers();
  }

  setupInputHandlers() {
    if (!this.input) return;

    this.input.on("movement", (data) => {
      this.dirX = data.dirX;
      this.dirY = data.dirY;
      this.angle = data.angle;
      this.distance = data.distance;
      this.mouseActive = data.mouseActive;
      this.d_x = data.d_x;
      this.d_y = data.d_y;
    });

    this.input.on("movementUpdate", (data) => {
      this.d_x = data.d_x;
      this.d_y = data.d_y;
      this.angle = data.angle;
      this.slippery = data.slippery;
    });

    this.input.on("mousemove", (x, y) => {
      this.targetX = x;
      this.targetY = y;
    });
  }

  getTilesInBoundingBox(aabbX, aabbY, aabbWidth, aabbHeight, map) {
    const tiles = [];
    const tileSize = map.tileSize;

    const leftTile = Math.floor(aabbX / tileSize);
    const rightTile = Math.floor((aabbX + aabbWidth) / tileSize);
    const topTile = Math.floor(aabbY / tileSize);
    const bottomTile = Math.floor((aabbY + aabbHeight) / tileSize);

    for (let ty = topTile; ty <= bottomTile; ty++) {
      for (let tx = leftTile; tx <= rightTile; tx++) {
        if (tx >= 0 && tx < map.width && ty >= 0 && ty < map.height) {
          // Return tile world coordinates and dimensions
          tiles.push({
            tx,
            ty,
            x: tx * tileSize,
            y: ty * tileSize,
            width: tileSize,
            height: tileSize,
          });
        }
      }
    }
    return tiles;
  }

  update(map, gameInstance) {
    const grid = gameInstance.mapGrids.get(this.currentMapId);
    if (!grid) return;

    const currentTime = Date.now();
    const actualDeltaTimeMs = currentTime - this.lastUpdateTime;
    let deltaTimeFactor = actualDeltaTimeMs / 16.67;

    // Clamp deltaTimeFactor to prevent excessive movement in a single frame
    const MAX_DELTA_TIME_FACTOR = 3; // Allow up to 3x normal frame movement
    if (deltaTimeFactor > MAX_DELTA_TIME_FACTOR) {
      deltaTimeFactor = MAX_DELTA_TIME_FACTOR;
    }
    this.lastUpdateTime = currentTime;

    if (this.isDead) {
      this.vx = 0;
      this.vy = 0;
      return;
    }

    this.lastPosition.x = this.x;
    this.lastPosition.y = this.y;

    if (
      this.justTeleportedFlag &&
      currentTime - this.lastTeleportTimestamp > this.TELEPORT_GRACE_DURATION
    ) {
      this.justTeleportedFlag = false;
    }

    let collisionHappenedThisFrame = false;

    if (this.justTeleportedFlag) {
      this.vx = 0;
      this.vy = 0;
      this.collider.pos.x = this.x;
      this.collider.pos.y = this.y;
    } else {
      if (this.input) {
        this.vx = this.d_x * this.maxSpeed;
        this.vy = this.d_y * this.maxSpeed;
      } else {
        const dxToTarget = this.targetX - this.x;
        const dyToTarget = this.targetY - this.y;
        const distanceToTargetSq =
          dxToTarget * dxToTarget + dyToTarget * dyToTarget;

        if (distanceToTargetSq > 1) {
          const distanceToTarget = Math.sqrt(distanceToTargetSq);
          const speedFactor = Math.min(distanceToTarget / 150, 1);

          const dirXToTarget = dxToTarget / distanceToTarget;
          const dirYToTarget = dyToTarget / distanceToTarget;
          this.vx = dirXToTarget * this.maxSpeed * speedFactor;
          this.vy = dirYToTarget * this.maxSpeed * speedFactor;
        } else {
          this.x = this.targetX;
          this.y = this.targetY;
          this.vx = 0;
          this.vy = 0;
        }
      }

      const intendedMoveDx = this.vx * deltaTimeFactor;
      const intendedMoveDy = this.vy * deltaTimeFactor;

      this.x += intendedMoveDx;
      this.y += intendedMoveDy;

      this.collider.pos.x = this.x;
      this.collider.pos.y = this.y;

      const broadphaseBoxX =
        Math.min(this.lastPosition.x, this.x) - this.radius;
      const broadphaseBoxY =
        Math.min(this.lastPosition.y, this.y) - this.radius;
      const broadphaseWidth =
        Math.abs(this.x - this.lastPosition.x) + this.radius * 2;
      const broadphaseHeight =
        Math.abs(this.y - this.lastPosition.y) + this.radius * 2;

      const potentialTiles = this.getTilesInBoundingBox(
        broadphaseBoxX,
        broadphaseBoxY,
        broadphaseWidth,
        broadphaseHeight,
        map,
      );

      let collisionHappenedThisFrame = false;

      for (const tile of potentialTiles) {
        if (map.isWall(tile.tx, tile.ty)) {
          const tilePolygon = new SAT.Box(
            new SAT.Vector(tile.x, tile.y),
            tile.width,
            tile.height,
          ).toPolygon();

          this.response.clear();

          const collided = SAT.testCirclePolygon(
            this.collider,
            tilePolygon,
            this.response,
          );

          if (collided) {
            collisionHappenedThisFrame = true;

            const overlapV = this.response.overlapV;

            this.x -= overlapV.x;
            this.y -= overlapV.y;

            this.collider.pos.x = this.x;
            this.collider.pos.y = this.y;

            if (Math.abs(overlapV.x) > 0.001) {
              this.vx = 0;
            }

            if (Math.abs(overlapV.y) > 0.001) {
              this.vy = 0;
            }
          }
        }
      }

      if (this.input && collisionHappenedThisFrame) {
        this.input.setSlippery(false);
      }
    }

    if (this.needsToExitTeleporterArea) {
      if (this.currentMapId !== this.needsToExitTeleporterArea.mapId) {
        this.needsToExitTeleporterArea = null;
      } else {
        const exitAreaPolygon = new SAT.Box(
          new SAT.Vector(
            this.needsToExitTeleporterArea.x,
            this.needsToExitTeleporterArea.y,
          ),
          this.needsToExitTeleporterArea.width,
          this.needsToExitTeleporterArea.height,
        ).toPolygon();

        if (!SAT.testCirclePolygon(this.collider, exitAreaPolygon)) {
          this.needsToExitTeleporterArea = null;
        }
      }
    }

    if (!this.needsToExitTeleporterArea && !this.justTeleportedFlag) {
      // Get current tile based on player's center
      const playerTileX = Math.floor(this.x / map.tileSize);
      const playerTileY = Math.floor(this.y / map.tileSize);

      // Check if the map indicates this tile is a teleporter
      if (map.isTeleporter && map.isTeleporter(playerTileX, playerTileY)) {
        const teleporter = map.getTeleporter(playerTileX, playerTileY);

        // First, try to find a direct teleporter link (new format)
        let useDirectLink = false;
        
        if (map.teleporterLinks && map.teleporterLinks.length > 0) {
          // Extract current map index (map1 -> 0, map2 -> 1, etc.)
          const currentMapId = this.currentMapId;
          const currentMapIndex = parseInt(currentMapId.replace(/[^0-9]/g, '')) - 1;
          
          // Check if there's a direct link for this teleporter
          for (const link of map.teleporterLinks) {
            const [fromMapIndex, fromX, fromY] = link.fromKey.split(',').map(Number);
            if (fromMapIndex === currentMapIndex && fromX === playerTileX && fromY === playerTileY) {
              // Found a direct link - use it through gameInstance.handlePlayerTeleport
              if (gameInstance && typeof gameInstance.handlePlayerTeleport === "function") {
                this.justTeleportedFlag = true;
                this.lastTeleportTimestamp = currentTime;
                gameInstance.handlePlayerTeleport(this.id, { 
                  tileX: playerTileX, 
                  tileY: playerTileY,
                  // No code or mapId needed for direct links - the game will find them
                });
                useDirectLink = true;
                break;
              }
            }
          }
        }
        
        // If no direct link was found or used, try the traditional teleporter system
        if (!useDirectLink && teleporter && teleporter.code) {
          // Create SAT polygon for the teleporter
          const teleporterWorldX = teleporter.tileX * map.tileSize;
          const teleporterWorldY = teleporter.tileY * map.tileSize;
          const teleporterWidth = teleporter.width || map.tileSize;
          const teleporterHeight = teleporter.height || map.tileSize;

          const teleporterPolygon = new SAT.Box(
            new SAT.Vector(teleporterWorldX, teleporterWorldY),
            teleporterWidth,
            teleporterHeight,
          ).toPolygon();

          this.response.clear();
          if (
            SAT.testCirclePolygon(
              this.collider,
              teleporterPolygon,
              this.response,
            )
          ) {
            // Collision detected with this teleporter
            if (
              gameInstance &&
              typeof gameInstance.handlePlayerTeleport === "function"
            ) {
              this.justTeleportedFlag = true;
              this.lastTeleportTimestamp = currentTime;
              gameInstance.handlePlayerTeleport(this.id, teleporter);
            }
          }
        }
      }
    }
  }

  // Check if player collides with a wall (useful for external checks)
  collidesWithWall(wall) {
    // Create SAT polygon for the wall
    const wallPolygon = new SAT.Box(
      new SAT.Vector(wall.x, wall.y),
      wall.width,
      wall.height,
    ).toPolygon();

    // Reset response object
    this.response.clear();

    // Test collision
    return SAT.testCirclePolygon(this.collider, wallPolygon, this.response);
  }

  setTarget(x, y) {
    this.targetX = x;
    this.targetY = y;
  }

  getPosition() {
    return { x: this.x, y: this.y };
  }

  hitByEnemy() {
    if (!this.isDead) {
      this.isDead = true;
      this.color = "#FF0000";
      this.maxSpeed = 0; // Also zero out velocities
      this.vx = 0;
      this.vy = 0;
    }
  }

  reviveByPlayer() {
    if (this.isDead) {
      this.isDead = false;
      this.color = this.originalColor;
      this.maxSpeed = this.originalMaxSpeed;
    }
  }

  reset() {
    this.isDead = false;
    this.color = this.originalColor || "#FFFFFF";
    this.maxSpeed = this.originalMaxSpeed;
    this.vx = 0;
    this.vy = 0;
    this.stuckCounter = 0;
    this.mouseActive = false;
    this.dirX = 0;
    this.dirY = 0;
    this.d_x = 0;
    this.d_y = 0;
    this.collisionCache.clear();
    // Reset new teleporter states
    this.needsToExitTeleporterArea = null;
    this.justTeleportedFlag = false;
    this.lastTeleportTimestamp = 0;
    // Update SAT collider position
    this.collider.pos.x = this.x;
    this.collider.pos.y = this.y;
  }

  serialize() {
    return {
      id: this.id,
      x: this.x,
      y: this.y,
      radius: this.radius,
      color: this.color,
      isDead: this.isDead,
      currentMapId: this.currentMapId,
      name: this.name,
    };
  }
}

module.exports = { Player };
