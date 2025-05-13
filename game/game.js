const zlib = require("zlib");
const {
  Enemy,
  Sniper,
  Dasher,
  Homing,
  VoidCrawler,
  Wall,
  Bullet,
  RecursiveBullet,
  ENEMY_TYPES,
  initializeGridWithMap,
  RecursiveBulletBoss,
} = require("./enemy");
const { Player } = require("./player");
const { Grid } = require("./grid");
const { EnemySpawner } = require("./enemySpawner");
const BinaryMapEncoder = require("./maps/BinaryMapEncoder");
const config = require("../server/config"); // Added for DEFAULT_MAP_ID

class Game {
  constructor(mapManager) {
    this.mapManager = mapManager;
    this.players = new Map();
    this.connections = new Map();
    this.mapEnemies = new Map();
    this.mapBullets = new Map();
    this.mapGrids = new Map();
    this.lastUpdateTime = Date.now();
    this.updateInterval = null;
    this._cachedPlayerIds = new Map();
    this._cachedEnemyIds = new Map();
    this._cachedBulletIds = new Map();
    this._playerIdCounter = 1;
    this._enemyIdCounter = 1;
    this._bulletIdCounter = 1;
    this._idMapNeedsUpdate = true;
    this._updateCounter = 0;
    this._unusedMapTimeout = 5;
    this._mapLastAccessed = new Map();

    this.enemySpawner = new EnemySpawner(
      this.mapManager,
      this.mapGrids,
      this.mapEnemies,
    );
  }

  async loadMapIfNeeded(mapId) {
    this._mapLastAccessed.set(mapId, Date.now());

    if (!this.mapGrids.has(mapId) || !this.mapEnemies.has(mapId)) {
      const map = this.mapManager.getMapById(mapId);
      if (!map) {
        console.error(`Failed to load map: ${mapId}. Map not found.`);
        return null;
      }

      console.log(`Loading map resources for ${mapId}...`);

      console.log(`Map ${mapId} teleporter methods available:`, {
        hasTeleporterManager: !!map.teleporterManager,
        hasGetTeleporterMethod: typeof map.getTeleporterByCode === "function",
      });

      if (map.teleporterManager) {
        console.log(
          `Teleporter codes for map ${mapId}:`,
          Array.from(map.teleporterManager.teleportersByCode.keys()),
        );
      }

      const grid = initializeGridWithMap(map);
      this.mapGrids.set(mapId, grid);

      this.mapEnemies.set(mapId, new Map());
      this.mapBullets.set(mapId, new Map());
      this.enemySpawner.spawnEnemiesForMap(mapId, map, grid);
      console.log(`Map resources for ${mapId} loaded.`);
      return map;
    }
    return this.mapManager.getMapById(mapId);
  }

  async addPlayer(player, connection, initialMapId = "map1") {
    player.currentMapId = initialMapId;
    await this.loadMapIfNeeded(initialMapId);

    this.players.set(player.id, player);
    this.connections.set(player.id, connection);

    this.broadcastNewPlayer(player);
    this._idMapNeedsUpdate = true;
  }

  removePlayer(playerId) {
    const player = this.players.get(playerId);
    if (player) {
      this.players.delete(playerId);
      this.connections.delete(playerId);
      this._cachedPlayerIds.delete(player.id);
      this._idMapNeedsUpdate = true;
      this.broadcastPlayerLeave(playerId, player.currentMapId);
    }
  }

  updatePlayerDirection(playerId, mouseX, mouseY) {
    const player = this.players.get(playerId);
    if (player) {
      player.setTarget(mouseX, mouseY);
    }
  }

  start() {
    this.updateInterval = setInterval(() => this.update(), 16);
  }

  stop() {
    clearInterval(this.updateInterval);
  }

  update() {
    const currentTime = Date.now();
    this.lastUpdateTime = currentTime;

    if (this._updateCounter % 1800 === 0) {
      this.cleanupUnusedMaps();
    }

    for (const [playerId, player] of this.players) {
      const mapId = player.currentMapId;
      const map = this.mapManager.getMapById(mapId);
      const grid = this.mapGrids.get(mapId);

      if (mapId) {
        this._mapLastAccessed.set(mapId, currentTime);
      }

      if (!map || !grid) {
        console.warn(
          `Player ${playerId} on unloaded map ${mapId}. Skipping update.`,
        );
        continue;
      }
      player.update(map, this);
    }

    for (const [mapId, enemiesOnThisMap] of this.mapEnemies) {
      const map = this.mapManager.getMapById(mapId);
      const grid = this.mapGrids.get(mapId);
      if (!map || !grid) {
        console.warn(`Skipping enemy updates for unloaded map ${mapId}.`);
        continue;
      }

      this.currentMapId = mapId;

      for (const [enemyId, enemy] of enemiesOnThisMap) {
        if (enemy instanceof Sniper) {
          enemy.update(map, grid, this);
        } else if (enemy instanceof Dasher) {
          enemy.update(map, grid, this);
        } else if (enemy instanceof Homing) {
          enemy.update(map, grid, this);
        } else if (enemy instanceof VoidCrawler) {
          enemy.update(map, grid, this);
        } else if (enemy instanceof Wall) {
          enemy.update(map, grid, this);
        } else if (enemy instanceof RecursiveBulletBoss) {
          enemy.update(map, grid, this);
        } else {
          enemy.update(map, grid);
        }
      }

      const bulletsOnThisMap = this.mapBullets.get(mapId) || new Map();
      for (const [bulletId, bullet] of bulletsOnThisMap) {
        if (!bullet.isActive) {
          bullet.removeFromGrid(grid);
          bulletsOnThisMap.delete(bulletId);
          continue;
        }
        
        if (bullet.constructor && 
            (bullet.constructor.name === 'RecursiveBullet' || 
             (typeof bullet.id === 'string' && bullet.id.startsWith('recursive_bullet_')))) {
          bullet.update(map, grid, this);
        } else {
          bullet.update(map, grid);
        }
      }
    }

    this.checkCollisions();

    this.broadcastGameState();

    this._updateCounter++;

    if (this._updateCounter % 1000 === 0) {
      this.cleanupCachedIds();
    }
  }

  checkCollisions() {
    const playersByMap = new Map();
    for (const player of this.players.values()) {
      if (!playersByMap.has(player.currentMapId)) {
        playersByMap.set(player.currentMapId, []);
      }
      playersByMap.get(player.currentMapId).push(player);
    }

    for (const [mapId, playersOnThisMap] of playersByMap) {
      const grid = this.mapGrids.get(mapId);
      const enemiesOnThisMap = this.mapEnemies.get(mapId);
      const bulletsOnThisMap = this.mapBullets.get(mapId) || new Map();
      const currentMap = this.mapManager.getMapById(mapId);

      if (!grid || !enemiesOnThisMap || !currentMap) continue;

      for (const player of playersOnThisMap) {
        if (player.isDead) continue;

        const queryRadius = player.radius + 30;
        const nearbyEntities = grid.queryArea(player.x, player.y, queryRadius);
        let wasHit = false;

        for (const entityId of nearbyEntities) {
          const enemy = enemiesOnThisMap.get(entityId);
          if (!enemy) continue;

          const dx = player.x - enemy.x;
          const dy = player.y - enemy.y;
          const distSquared = dx * dx + dy * dy;
          const radiusSum = player.radius + enemy.radius;

          if (distSquared < radiusSum * radiusSum) {
            player.hitByEnemy();
            wasHit = true;
            break;
          }
        }

        if (!wasHit) {
          for (const entityId of nearbyEntities) {
            const bullet = bulletsOnThisMap.get(entityId);
            if (!bullet || !bullet.isActive) continue;

            const dx = player.x - bullet.x;
            const dy = player.y - bullet.y;
            const distSquared = dx * dx + dy * dy;
            const radiusSum = player.radius + bullet.radius;

            if (distSquared < radiusSum * radiusSum) {
              player.hitByEnemy();
              bullet.isActive = false;
              break;
            }
          }
        }
      }

      const alivePlayers = [];
      const deadPlayers = [];

      for (const player of playersOnThisMap) {
        if (player.isDead) {
          deadPlayers.push(player);
        } else {
          alivePlayers.push(player);
        }
      }

      if (deadPlayers.length > 0 && alivePlayers.length > 0) {
        for (const deadPlayer of deadPlayers) {
          const nearbyEntities = grid.queryArea(
            deadPlayer.x,
            deadPlayer.y,
            deadPlayer.radius * 2,
          );

          for (const alivePlayer of alivePlayers) {
            const dx = deadPlayer.x - alivePlayer.x;
            const dy = deadPlayer.y - alivePlayer.y;
            const distSquared = dx * dx + dy * dy;
            const radiusSum = deadPlayer.radius + alivePlayer.radius;

            if (distSquared < radiusSum * radiusSum) {
              deadPlayer.reviveByPlayer();
              break;
            }
          }
        }
      }
    }
  }

  async handlePlayerTeleport(playerId, teleporterUsed) {
    const player = this.players.get(playerId);
    if (!player) return;

    const currentMapId = player.currentMapId;
    const map = this.mapManager.maps[currentMapId];
    if (!map) return;

    const tileX = Math.floor(player.x / map.tileSize);
    const tileY = Math.floor(player.y / map.tileSize);

    if (!teleporterUsed && map.isTeleporter && map.isTeleporter(tileX, tileY)) {
      teleporterUsed = map.getTeleporter(tileX, tileY);
    }

    // Try the direct teleporter link first (new format)
    try {
      // Extract current map index (map1 -> 0, map2 -> 1, etc.)
      const currentMapIndex = parseInt(currentMapId.replace(/[^0-9]/g, '')) - 1;
      
      if (map.teleporterLinks && map.teleporterLinks.length > 0) {
        // Find a teleporter link that matches the current position
        const link = map.teleporterLinks.find(link => {
          const [fromMapIndex, fromX, fromY] = link.fromKey.split(',').map(Number);
          return fromMapIndex === currentMapIndex && fromX === tileX && fromY === tileY;
        });
        
        if (link) {
          // We found a direct link
          console.log(`[GAME] Using direct teleporter link for player ${playerId.substring(0, 8)}`);
          
          const [toMapIndex, toX, toY] = link.toKey.split(',').map(Number);
          const destinationMapId = `map${toMapIndex + 1}`;
          
          // Prepare a temporary teleporter object for the destination
          const targetTeleporter = { 
            tileX: toX, 
            tileY: toY,
            code: `link_${link.fromKey}_to_${link.toKey}`
          };
          
          // Load the destination map
          const destinationMap = await this.loadMapIfNeeded(destinationMapId);
          if (!destinationMap) {
            console.error(`[GAME] Teleport failed: Destination map ${destinationMapId} could not be loaded.`);
            return;
          }
          
          // Calculate the destination position
          const newX = targetTeleporter.tileX * destinationMap.tileSize + destinationMap.tileSize / 2;
          const newY = targetTeleporter.tileY * destinationMap.tileSize + destinationMap.tileSize / 2;
          
          // Move the player
          const oldMapId = player.currentMapId;
          player.x = newX;
          player.y = newY;
          player.currentMapId = destinationMapId;
          
          if (player.collider) {
            player.collider.pos.x = newX;
            player.collider.pos.y = newY;
          }
          
          // Set teleporter exit area to prevent immediate re-teleportation
          player.needsToExitTeleporterArea = {
            id: targetTeleporter.code,
            x: targetTeleporter.tileX * destinationMap.tileSize,
            y: targetTeleporter.tileY * destinationMap.tileSize,
            width: destinationMap.tileSize,
            height: destinationMap.tileSize,
            mapId: destinationMapId,
          };
          
          console.log(`[GAME] Player ${playerId.substring(0, 8)} teleported from ${oldMapId} to ${destinationMapId} at (${newX}, ${newY}) via direct link`);
          
          // Send map change to the player
          this.sendMapChangeToPlayer(player, playerId, destinationMap, destinationMapId);
          this._idMapNeedsUpdate = true;
          return;
        }
      }
    } catch (error) {
      console.error(`[GAME] Error processing teleporter link:`, error);
      // Continue with traditional teleporter handling
    }

    // Fallback to the traditional code-based teleporter system
    if (!teleporterUsed || !teleporterUsed.code) {
      return;
    }

    const teleporterCode = teleporterUsed.code;

    console.log(
      `[GAME] Handling teleport for player ${playerId.substring(0, 8)} with code: ${teleporterCode}`,
    );

    if (!teleporterCode) {
      console.log(
        `[GAME] Player ${playerId.substring(0, 8)} used a teleporter with no code. Ignoring.`,
      );
      return;
    }
    let destinationMapId = null;
    for (const [mapId, map] of Object.entries(this.mapManager.maps)) {
      if (
        mapId !== currentMapId &&
        map &&
        typeof map.getTeleporterByCode === "function"
      ) {
        const teleporter = map.getTeleporterByCode(teleporterCode);
        if (teleporter) {
          destinationMapId = mapId;
          break;
        }
      }
    }

    if (!destinationMapId) {
      console.log(
        `[GAME] Player ${playerId.substring(0, 8)} used teleporter with code ${teleporterCode} on ${currentMapId}, but no destination map found.`,
      );
      return;
    }

    const destinationMap = await this.loadMapIfNeeded(destinationMapId);

    console.log(`[GAME] Destination map loaded:`, {
      mapId: destinationMapId,
      mapExists: !!destinationMap,
      hasTeleporterManager: destinationMap
        ? !!destinationMap.teleporterManager
        : false,
      hasTeleporterMethod: destinationMap
        ? typeof destinationMap.getTeleporterByCode === "function"
        : false,
    });

    if (
      !destinationMap ||
      typeof destinationMap.getTeleporterByCode !== "function"
    ) {
      console.error(
        `[GAME] Teleport failed for player ${playerId.substring(0, 8)}: Destination map ${destinationMapId} could not be loaded or is invalid.`,
      );
      return;
    }
    const targetTeleporter = destinationMap.getTeleporterByCode(teleporterCode);
    if (!targetTeleporter) {
      console.error(
        `[GAME] Teleport failed for player ${playerId.substring(0, 8)}: No teleporter with code ${teleporterCode} found on map ${destinationMapId}.`,
      );
      return;
    }
    const newX =
      targetTeleporter.tileX * destinationMap.tileSize +
      destinationMap.tileSize / 2;
    const newY =
      targetTeleporter.tileY * destinationMap.tileSize +
      destinationMap.tileSize / 2;
    const oldMapId = player.currentMapId;
    player.x = newX;
    player.y = newY;
    player.currentMapId = destinationMapId;
    if (player.collider) {
      player.collider.pos.x = newX;
      player.collider.pos.y = newY;
    }

    if (targetTeleporter) {
      const targetTeleporterWorldX =
        targetTeleporter.tileX * destinationMap.tileSize;
      const targetTeleporterWorldY =
        targetTeleporter.tileY * destinationMap.tileSize;
      const targetTeleporterWidth =
        targetTeleporter.width || destinationMap.tileSize; // Assumes targetTeleporter might have its own width/height
      const targetTeleporterHeight =
        targetTeleporter.height || destinationMap.tileSize; // Otherwise, defaults to map tileSize

      player.needsToExitTeleporterArea = {
        id: targetTeleporter.code, // Use the teleporter's code as an identifier
        x: targetTeleporterWorldX,
        y: targetTeleporterWorldY,
        width: targetTeleporterWidth,
        height: targetTeleporterHeight,
        mapId: destinationMapId,
      };
    }

    console.log(
      `[GAME] Player ${playerId.substring(0, 8)} teleported from ${oldMapId} to ${destinationMapId} at (${newX}, ${newY}) via teleporter with code ${teleporterCode}`,
    );
    
    // Send map change to the player
    this.sendMapChangeToPlayer(player, playerId, destinationMap, destinationMapId);
    this._idMapNeedsUpdate = true;
  }
  
  // Helper method to send map change to a player
  sendMapChangeToPlayer(player, playerId, destinationMap, destinationMapId) {
    const connection = this.connections.get(playerId);
    if (!connection || connection.readyState !== 1) return;
    
    const enemiesOnNewMap = this.mapEnemies.get(destinationMapId) || new Map();
    const serializedEnemies = Array.from(enemiesOnNewMap.values()).map((e) =>
      e.serialize(),
    );

    const bulletsOnNewMap = this.mapBullets.get(destinationMapId) || new Map();
    const serializedBullets = Array.from(bulletsOnNewMap.values())
      .filter((b) => b.isActive)
      .map((b) => b.serialize());

    try {
      const mapData = {
        width: destinationMap.width,
        height: destinationMap.height,
        tileSize: destinationMap.tileSize,
        map: destinationMap.tiles,
        teleporterCodes: destinationMap.teleporterCodes,
        teleporterLinks: destinationMap.teleporterLinks,
        enemyConfig: destinationMap.enemyConfig,
      };

      const optimizedMapData = BinaryMapEncoder.encodeForNetwork(mapData);
      connection.send(optimizedMapData);

      const mapChangeData = {
        type: "mapChange",
        newMapId: destinationMapId,
        mapWidth: destinationMap.width,
        mapHeight: destinationMap.height,
        tileSize: destinationMap.tileSize,
        enemyTypes: ENEMY_TYPES,
        enemies: serializedEnemies,
        bullets: serializedBullets,
        playerData: player.serialize(),
      };

      // Send mapChangeData immediately
      const message = JSON.stringify(mapChangeData);
      const compressed = zlib.gzipSync(message);
      connection.send(compressed);
      console.log(
        `[GAME] Map change message sent to player ${playerId.substring(0, 8)}`,
      );
    } catch (e) {
      console.error("Failed to send optimized map data:", e);

      const mapChangeData = {
        type: "mapChange",
        newMapId: destinationMapId,
        map: destinationMap.tiles,
        mapWidth: destinationMap.width,
        mapHeight: destinationMap.height,
        tileSize: destinationMap.tileSize,
        enemyTypes: ENEMY_TYPES,
        enemies: serializedEnemies,
        bullets: serializedBullets,
        playerData: player.serialize(),
      };
      const message = JSON.stringify(mapChangeData);
      connection.send(message);
      console.log(
        `[GAME] Traditional map data sent to player ${playerId.substring(0, 8)} (fallback)`,
      );
    }
  }

  async forcePlayerToMapPosition(playerId, targetMapId, targetX, targetY) {
    const player = this.players.get(playerId);
    if (!player) {
      console.warn(`forcePlayerToMapPosition: Player ${playerId} not found.`);
      return;
    }

    const connection = this.connections.get(playerId);
    // If connection is null, player state is updated, but client won't receive direct mapChange.
    // This might be okay if player is reconnecting.

    const oldMapId = player.currentMapId;
    const mapChanged = oldMapId !== targetMapId;

    // Update player's core position and stop movement.
    // Other properties (isDead, color) are assumed to be set by player.reset() before this call.
    player.x = targetX;
    player.y = targetY;
    player.vx = 0; 
    player.vy = 0;
    if (player.collider) { 
        player.collider.pos.x = targetX;
        player.collider.pos.y = targetY;
    }

    if (mapChanged) {
      // Player is changing maps
      if (oldMapId) {
        this.broadcastPlayerLeave(playerId, oldMapId);
      }

      player.currentMapId = targetMapId; // Set new mapId first

      try {
        await this.loadMapIfNeeded(targetMapId);
      } catch (error) {
        console.error(`forcePlayerToMapPosition: Failed to load target map ${targetMapId} for player ${playerId}:`, error);
        if (connection && connection.readyState === 1) {
            connection.close(1011, 'Server error: Target map for reset could not be loaded.');
        }
        // Consider implications: player.currentMapId is targetMapId, but map failed to load.
        // This could lead to issues if not handled (e.g., revert currentMapId or kick player).
        return;
      }
      
      const targetMap = this.mapManager.getMapById(targetMapId);

      if (!targetMap) {
        console.error(`forcePlayerToMapPosition: Target map ${targetMapId} data not found after attempting load for player ${playerId}.`);
        if (connection && connection.readyState === 1) {
          connection.close(1011, 'Server error: Target map data unavailable after load.');
        }
        return;
      }

      // Send mapChange message to the specific player if connected
      if (connection && connection.readyState === 1) {
        const enemiesOnNewMap = this.mapEnemies.get(targetMapId) || new Map();
        const serializedEnemies = Array.from(enemiesOnNewMap.values()).map(e => e.serialize());
        
        const mapChangeData = {
          type: 'mapChange',
          newMapId: targetMapId,
          map: targetMap.tiles,
          mapWidth: targetMap.width,
          mapHeight: targetMap.height,
          tileSize: targetMap.tileSize,
          enemyTypes: ENEMY_TYPES,
          enemies: serializedEnemies,
          playerData: player.serialize(), // Includes new position and mapId
        };
        const message = JSON.stringify(mapChangeData);
        try {
            const compressed = zlib.gzipSync(message);
            connection.send(compressed);
        } catch (e) {
            console.error(`forcePlayerToMapPosition: Failed to compress or send mapChange to ${playerId}:`, e);
        }
      }

      this.broadcastNewPlayer(player); // Announce player on the new map
      this._idMapNeedsUpdate = true; // Flag for ID map regeneration

    } else {
      // Player stays on the same map, only position changes.
      // The command handler (for /reset) will send a 'respawn' message to this client.
      // Regular broadcastGameState will inform other players of the position change.
    }
  }

  broadcastGameState() {
    this._updateCounter++;
    const needsFullIdMapForAll =
      this._idMapNeedsUpdate || this._updateCounter < 5;

    if (needsFullIdMapForAll) {
      this._cachedPlayerIds.clear();
      this._cachedEnemyIds.clear();
      this._cachedBulletIds.clear();
      this._playerIdCounter = 1;
      this._enemyIdCounter = 1;
      this._bulletIdCounter = 1;

      for (const player of this.players.values()) {
        if (!this._cachedPlayerIds.has(player.id)) {
          this._cachedPlayerIds.set(player.id, this._playerIdCounter++);
        }
      }
      for (const enemiesOnMap of this.mapEnemies.values()) {
        for (const enemy of enemiesOnMap.values()) {
          if (!this._cachedEnemyIds.has(enemy.id)) {
            this._cachedEnemyIds.set(enemy.id, this._enemyIdCounter++);
          }
        }
      }
      for (const bulletsOnMap of this.mapBullets.values()) {
        for (const bullet of bulletsOnMap.values()) {
          if (!this._cachedBulletIds.has(bullet.id)) {
            this._cachedBulletIds.set(bullet.id, this._bulletIdCounter++);
          }
        }
      }
    }

    for (const [currentConnectionPlayerId, connection] of this.connections) {
      if (connection.readyState !== 1) continue;

      let mapIdToBroadcast;
      const activePlayer = this.players.get(currentConnectionPlayerId);

      if (activePlayer) {
        mapIdToBroadcast = activePlayer.currentMapId;
      } else {
        // This connection is a spectator (in this.connections but not yet in this.players)
        mapIdToBroadcast = config.DEFAULT_MAP_ID;
      }
      
      if (!mapIdToBroadcast) {
          // This might happen if DEFAULT_MAP_ID is somehow not set or an active player has no currentMapId
          console.warn(`No mapIdToBroadcast determined for connection ${currentConnectionPlayerId}. Active player: ${!!activePlayer}`);
          continue;
      }

      const playersOnThisMap = [];
      for (const p of this.players.values()) { // Iterate all fully active players
        if (p.currentMapId === mapIdToBroadcast) {
          playersOnThisMap.push(p);
        }
      }

      const enemiesToSerialise = this.mapEnemies.get(mapIdToBroadcast) || new Map();
      const bulletsToSerialise = this.mapBullets.get(mapIdToBroadcast) || new Map();
      
      const gameState = {
        t: "u",
        p: playersOnThisMap.map((p_data) => [ // p_data is a player object from playersOnThisMap
          this._cachedPlayerIds.get(p_data.id) || p_data.id,
          Math.round(p_data.x),
          Math.round(p_data.y),
          p_data.isDead ? 1 : 0,
          p_data.name,
        ]),
        e: Array.from(enemiesToSerialise.values()).map((e_data) => [
          this._cachedEnemyIds.get(e_data.id) || e_data.id,
          e_data.type,
          Math.round(e_data.x),
          Math.round(e_data.y),
          e_data.radius,
        ]),
        b: Array.from(bulletsToSerialise.values())
          .filter((b_data) => b_data.isActive)
          .map((b_data) => [
            this._cachedBulletIds.get(b_data.id) || b_data.id,
            Math.round(b_data.x),
            Math.round(b_data.y),
            b_data.radius,
          ]),
      };

      if (needsFullIdMapForAll) {
        gameState.idMap = { p: {}, e: {}, b: {} };
        // Populate idMap based on entities on mapIdToBroadcast
        for (const p_data of playersOnThisMap) {
          const shortId = this._cachedPlayerIds.get(p_data.id);
          if (shortId) gameState.idMap.p[shortId] = p_data.id;
        }
        for (const e_data of enemiesToSerialise.values()) {
          const shortId = this._cachedEnemyIds.get(e_data.id);
          if (shortId) gameState.idMap.e[shortId] = e_data.id;
        }
        for (const b_data of bulletsToSerialise.values()) {
          if (!b_data.isActive) continue;
          const shortId = this._cachedBulletIds.get(b_data.id);
          if (shortId) gameState.idMap.b[shortId] = b_data.id;
        }
      }

      const message = JSON.stringify(gameState);
      try {
        const compressed = zlib.gzipSync(message);
        connection.send(compressed);
      } catch (e) {
        console.error("Failed to compress and send game state to " + currentConnectionPlayerId + ":", e);
      }
    }
    if (needsFullIdMapForAll) {
      this._idMapNeedsUpdate = false;
    }
  }

  broadcastNewPlayer(newPlayer) {
    const messageData = {
      type: "newPlayer",
      player: newPlayer.serialize(),
    };
    const message = JSON.stringify(messageData);
    const compressed = zlib.gzipSync(message);

    for (const [playerId, connection] of this.connections) {
      const existingPlayer = this.players.get(playerId);
      if (
        existingPlayer &&
        existingPlayer.id !== newPlayer.id &&
        existingPlayer.currentMapId === newPlayer.currentMapId
      ) {
        if (connection.readyState === 1) {
          connection.send(compressed);
        }
      }
    }
  }

  broadcastPlayerLeave(leftPlayerId, mapIdOfLeftPlayer) {
    const messageData = {
      type: "playerLeave",
      playerId: leftPlayerId,
    };
    const message = JSON.stringify(messageData);
    const compressed = zlib.gzipSync(message);

    for (const [playerId, connection] of this.connections) {
      const existingPlayer = this.players.get(playerId);
      if (existingPlayer && existingPlayer.currentMapId === mapIdOfLeftPlayer) {
        if (connection.readyState === 1) {
          connection.send(compressed);
        }
      }
    }
  }

  cleanupUnusedMaps() {
    const currentTime = Date.now();
    const activeMapIds = new Set();

    for (const player of this.players.values()) {
      if (player.currentMapId) {
        activeMapIds.add(player.currentMapId);
      }
    }

    for (const [mapId, lastAccessed] of this._mapLastAccessed.entries()) {
      if (activeMapIds.has(mapId)) continue;

      const secondsSinceLastAccess = (currentTime - lastAccessed) / 1000;
      if (secondsSinceLastAccess > this._unusedMapTimeout) {
        console.log(
          `Cleaning up unused map: ${mapId} (unused for ${Math.floor(secondsSinceLastAccess)} seconds)`,
        );

        if (this.mapGrids.has(mapId)) {
          const grid = this.mapGrids.get(mapId);
          grid.clear();
          this.mapGrids.delete(mapId);
        }

        if (this.mapEnemies.has(mapId)) {
          this.mapEnemies.delete(mapId);
        }

        if (this.mapBullets.has(mapId)) {
          this.mapBullets.delete(mapId);
        }

        this._mapLastAccessed.delete(mapId);
      }
    }
  }
  cleanupCachedIds() {
    for (const [id, shortId] of this._cachedPlayerIds.entries()) {
      if (!this.players.has(id)) {
        this._cachedPlayerIds.delete(id);
      }
    }

    const activeEnemyIds = new Set();
    for (const enemiesMap of this.mapEnemies.values()) {
      for (const enemyId of enemiesMap.keys()) {
        activeEnemyIds.add(enemyId);
      }
    }

    for (const [id] of this._cachedEnemyIds.entries()) {
      if (!activeEnemyIds.has(id)) {
        this._cachedEnemyIds.delete(id);
      }
    }

    const activeBulletIds = new Set();
    for (const bulletsMap of this.mapBullets.values()) {
      for (const bulletId of bulletsMap.keys()) {
        activeBulletIds.add(bulletId);
      }
    }

    for (const [id] of this._cachedBulletIds.entries()) {
      if (!activeBulletIds.has(id)) {
        this._cachedBulletIds.delete(id);
      }
    }
  }
}

module.exports = { Game };
