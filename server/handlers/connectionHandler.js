const zlib = require('zlib');
const { Player } = require('../../game/player');
const { ENEMY_TYPES } = require('../../game/enemy');
const config = require('../config');
const { handlePlayerMessage } = require('./messageHandler');

async function handleNewConnection(ws, req, game, broadcast) {
  // Create a player object in a "pending" state. It has an ID but is not yet in the game.
  const player = new Player(0, 0, 25, "#FFFFFF"); // x, y are temporary, name will be set later

  try {
    const initialMapId = config.DEFAULT_MAP_ID;
    const initialMap = game.mapManager.getMapById(initialMapId);

    if (!initialMap) {
      ws.close(1011, 'Server error: Default map not available for spectator mode.');
      return;
    }
    await game.loadMapIfNeeded(initialMapId); // Ensure map grid, etc., are ready

    const enemiesOnInitialMap = game.mapEnemies.get(initialMapId) || new Map();
    const serializedEnemies = Array.from(enemiesOnInitialMap.values()).map(enemy => enemy.serialize());

    const otherPlayersOnMap = [];
    for (const p of game.players.values()) {
      if (p.currentMapId === initialMapId && p.id !== player.id) { // Exclude the pending player
        otherPlayersOnMap.push(p.serialize());
      }
    }

    let spectatorCameraX = initialMap.width * initialMap.tileSize / 2; // Default to map center
    let spectatorCameraY = initialMap.height * initialMap.tileSize / 2;
    const spawnPos = initialMap.getRandomTypePosition(2);
    if (spawnPos) {
      spectatorCameraX = spawnPos.x;
      spectatorCameraY = spawnPos.y;
    }

    // Send an initial message to the client for spectator mode.
    // Includes map, enemy, and other player data so the client can render the world.
    const initialSpectatorMessageData = {
      type: 'init',
      id: player.id, // Client needs its temporary ID for sending joinGame
      status: 'awaitingName', // Client should show name input UI
      map: initialMap.tiles,
      mapWidth: initialMap.width,
      mapHeight: initialMap.height,
      tileSize: initialMap.tileSize,
      enemyTypes: ENEMY_TYPES,
      enemies: serializedEnemies,
      players: otherPlayersOnMap, // Add other active players
      spectatorCameraX: spectatorCameraX, // Add spectator camera hint
      spectatorCameraY: spectatorCameraY,
      // No playerData for this client yet, as they are spectating.
    };
    const initialSpectatorMessage = JSON.stringify(initialSpectatorMessageData);
    
    // Using zlib for potentially larger initial message with map data
    const compressedInitialMessage = zlib.gzipSync(Buffer.from(initialSpectatorMessage));
    ws.send(compressedInitialMessage, { binary: true });

    // Add the connection to the game's active connections map so it can receive broadcasts
    // even in spectator mode. The player object itself is not fully in game.players yet.
    game.connections.set(player.id, ws);

    // The 'player' object passed to handlePlayerMessage is this "pending" player.
    // handlePlayerMessage will be responsible for the 'joinGame' message
    // which will fully initialize and add the player to the game.
    ws.on('message', async (rawMessage) => {
      // 'player' here is the same instance created above.
      // handlePlayerMessage will mutate it (e.g., set name, x, y) upon 'joinGame'.
      await handlePlayerMessage(game, ws, player, rawMessage, broadcast);
    });

    ws.on('close', async () => {
      // If player was fully added (e.g., player.currentMapId is set), then remove.
      // Otherwise, it was just a pending connection that closed.
      await handleConnectionClose(game, player);
    });

    ws.on('error', (error) => {
      // Similar logic for error handling.
      handleConnectionError(game, player, error);
    });

    // Note: player is returned but it's in a pending state.
    // The actual "game entry" happens in handlePlayerMessage.
    return player;
  } catch (error) {
    console.error('Error during initial connection setup:', error);
    // At this stage, the player hasn't been added to the game logic,
    // so no need to call game.removePlayer.
    if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close(1011, 'Server error during initial connection setup.');
    }
    return null;
  }
}

async function handleConnectionClose(game, player) {
  if (player && player.id) {
    if (player.currentMapId) { // Player was fully added
      try {
        await game.removePlayer(player.id); // This also removes from game.connections
      } catch (removalErr) {
        console.error('Error removing player on close:', removalErr);
      }
    } else {
      // Player was pending (spectating), remove from connections directly
      game.connections.delete(player.id);
      console.log(`Pending player ${player.id} disconnected before joining a map. Removed from connections.`);
    }
  }
}

function handleConnectionError(game, player, error) {
  console.error(`WebSocket error for player ${player ? player.id : 'unknown'}:`, error);
  if (player && player.id) {
    if (player.currentMapId) { // Player was fully added
      const removePlayerResult = game.removePlayer(player.id); // This also removes from game.connections
      if (removePlayerResult && typeof removePlayerResult.then === 'function') {
        removePlayerResult.catch(err => console.error('Error removing player on WebSocket error:', err));
      }
    } else {
      // Player was pending (spectating), remove from connections directly
      game.connections.delete(player.id);
      console.log(`WebSocket error for pending player ${player.id} before joining a map. Removed from connections.`);
    }
  }
}

module.exports = {
  handleNewConnection,
  handleConnectionClose,
  handleConnectionError
}; 