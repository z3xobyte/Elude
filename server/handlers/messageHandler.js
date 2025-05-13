const zlib = require("zlib");
const config = require("../config");
const { ENEMY_TYPES } = require("../../game/enemy"); // Added for init data

async function parseMessageContents(messageData) {
  if (Buffer.isBuffer(messageData)) {
    if (
      messageData.length === 9 &&
      messageData[0] === config.BINARY_MESSAGE_MOUSE_MOVE
    ) {
      return {
        type: "m",
        x: messageData.readInt32LE(1),
        y: messageData.readInt32LE(5),
      };
    }

    let textData;
    try {
      textData = await new Promise((resolve, reject) => {
        zlib.gunzip(messageData, (err, buffer) =>
          err ? reject(err) : resolve(buffer.toString("utf8")),
        );
      });
    } catch (gunzipError) {
      try {
        textData = await new Promise((resolve, reject) => {
          zlib.inflate(messageData, (err, buffer) =>
            err ? reject(err) : resolve(buffer.toString("utf8")),
          );
        });
      } catch (inflateError) {
        textData = messageData.toString("utf8");
      }
    }
    return JSON.parse(textData);
  } else {
    return JSON.parse(messageData.toString("utf8"));
  }
}

function handleMouseMove(game, playerId, x, y) {
  game.updatePlayerDirection(playerId, x, y);
}

function handlePing(ws, clientTime) {
  const response = JSON.stringify({
    type: "pong",
    clientTime: clientTime,
    serverTime: Date.now(),
  });
  ws.send(response);
}

function handleChatMessage(game, ws, player, message, broadcast) {
  if (!player.currentMapId) {
    // Player hasn't fully joined, ignore chat attempts
    return;
  }
  if (message && (message.trim() === "/reset" || message.trim() === "/r")) {
    handleResetCommand(game, ws, player);
  } else if (message && message.trim().startsWith("/tp ")) {
    handleTeleportAllCommand(game, ws, player, message.trim(), broadcast);
  } else if (message) {
    const chatMessageObject = {
      type: "chat",
      sender: player.name, // Use player's chosen name
      message: message.substring(0, config.MAX_CHAT_MESSAGE_LENGTH),
      // No color for regular player messages
    };
    const chatMessageString = JSON.stringify(chatMessageObject);
    ws.send(chatMessageString);
    broadcast(chatMessageString, ws);
  }
}

async function handleTeleportAllCommand(game, ws, player, message, broadcast) {
  // Only admins or server operators can use this command
  // For demonstration, we're just checking if the player name contains "admin"
  // In a real implementation, you would have proper authentication and permissions
  if (!player.name.toLowerCase().includes("admin")) {
    const errorMessage = JSON.stringify({
      type: "chat",
      sender: "[SERVER]",
      message: "You do not have permission to use this command.",
      color: "#ff6666" // Red color for error
    });
    ws.send(errorMessage);
    return;
  }

  // Parse command: "/tp mapX"
  const parts = message.split(' ');
  if (parts.length !== 2) {
    const errorMessage = JSON.stringify({
      type: "chat",
      sender: "[SERVER]",
      message: "Usage: /tp map1 (replace 1 with desired map number)",
      color: "#ff6666" // Red color for error
    });
    ws.send(errorMessage);
    return;
  }

  const targetMapId = parts[1];
  const targetMap = game.mapManager.getMapById(targetMapId);

  if (!targetMap) {
    const errorMessage = JSON.stringify({
      type: "chat",
      sender: "[SERVER]",
      message: `Map ${targetMapId} not found. Available maps: map1-map10`,
      color: "#ff6666" // Red color for error
    });
    ws.send(errorMessage);
    return;
  }

  try {
    await game.loadMapIfNeeded(targetMapId);
    
    // Find safe tile positions (type 4) for the teleport destination
    const safeTilePositions = [];
    for (let y = 0; y < targetMap.height; y++) {
      for (let x = 0; x < targetMap.width; x++) {
        if (targetMap.getTileType(x, y) === 4) { // Type 4 is safe zone (non-spawnable)
          safeTilePositions.push({
            x: x * targetMap.tileSize + targetMap.tileSize / 2,
            y: y * targetMap.tileSize + targetMap.tileSize / 2
          });
        }
      }
    }
    
    // If no type 4 tiles, try type 2 (safe zone)
    if (safeTilePositions.length === 0) {
      for (let y = 0; y < targetMap.height; y++) {
        for (let x = 0; x < targetMap.width; x++) {
          if (targetMap.getTileType(x, y) === 2) { // Type 2 is safe zone (spawnable)
            safeTilePositions.push({
              x: x * targetMap.tileSize + targetMap.tileSize / 2,
              y: y * targetMap.tileSize + targetMap.tileSize / 2
            });
          }
        }
      }
    }
    
    if (safeTilePositions.length === 0) {
      const errorMessage = JSON.stringify({
        type: "chat",
        sender: "[SERVER]",
        message: `No safe zones found on map ${targetMapId} for teleportation.`,
        color: "#ff6666" // Red color for error
      });
      ws.send(errorMessage);
      return;
    }
    
    // Choose a random safe position
    const randomSafePosition = safeTilePositions[Math.floor(Math.random() * safeTilePositions.length)];
    
    // Get a list of players to teleport (all players on all maps)
    const playersToTeleport = Array.from(game.players.entries());
    const teleportedCount = playersToTeleport.length;
    
    // Teleport all players to the target map
    const teleportPromises = playersToTeleport.map(([playerId, playerObj]) => 
      game.forcePlayerToMapPosition(playerId, targetMapId, randomSafePosition.x, randomSafePosition.y)
    );
    
    await Promise.all(teleportPromises);
    
    // Broadcast message to all players
    const teleportMessage = JSON.stringify({
      type: "chat",
      sender: "[SERVER]",
      message: `${player.name} teleported everyone to ${targetMapId}!`,
      color: "#ffceb7" // Orange color
    });
    broadcast(teleportMessage);
    
    console.log(`Player ${player.id} (${player.name}) teleported ${teleportedCount} players to ${targetMapId}`);
  } catch (error) {
    console.error(`Error during mass teleport to ${targetMapId}:`, error);
    const errorMessage = JSON.stringify({
      type: "chat",
      sender: "[SERVER]",
      message: `Error teleporting to ${targetMapId}: ${error.message}`,
      color: "#ff6666" // Red color for error
    });
    ws.send(errorMessage);
  }
}

async function handleResetCommand(game, ws, player) {
  // Made async
  const defaultMapId = config.DEFAULT_MAP_ID;
  const defaultMap = game.mapManager.getMapById(defaultMapId);

  if (!defaultMap) {
    console.error(`/reset: Default map ${defaultMapId} not found.`);
    // Optionally send an error message to the client
    ws.send(
      JSON.stringify({
        type: "error",
        message: "Reset failed: Default map not found.",
      }),
    );
    return;
  }

  try {
    await game.loadMapIfNeeded(defaultMapId); // Ensure map grid etc. are ready
  } catch (error) {
    console.error(
      `/reset: Failed to load default map ${defaultMapId} for player ${player.id}:`,
      error,
    );
    ws.send(
      JSON.stringify({
        type: "error",
        message: "Reset failed: Could not load default map.",
      }),
    );
    return;
  }

  const newSpawnPos = defaultMap.getRandomTypePosition(2);
  if (newSpawnPos) {
    player.reset(); // Reset player state first (isDead, color, speed etc.)

    // This will handle map changes, broadcasts, and sending mapChange if needed.
    await game.forcePlayerToMapPosition(
      player.id,
      defaultMapId,
      newSpawnPos.x,
      newSpawnPos.y,
    );

    // Send a respawn message to confirm state to the client.
    // forcePlayerToMapPosition has already updated player.x, player.y, and player.currentMapId.
    ws.send(
      JSON.stringify({
        type: "respawn",
        id: player.id,
        x: player.x, // Use player's updated position
        y: player.y, // Use player's updated position
        currentMapId: player.currentMapId, // Should be defaultMapId
      }),
    );
  } else {
    console.error(
      `/reset: No spawn point of type 2 found on default map ${defaultMapId}.`,
    );
    ws.send(
      JSON.stringify({
        type: "error",
        message: "Reset failed: No spawn point available on default map.",
      }),
    );
  }
}

async function handleJoinGame(game, ws, player, name, broadcast) {
  if (player.currentMapId) {
    // Player already joined
    console.warn(
      `Player ${player.id} sent joinGame but already in map ${player.currentMapId}`,
    );
    return;
  }

  player.name = name.substring(0, 16); // Set name, truncate if necessary

  const initialMapId = config.DEFAULT_MAP_ID;
  try {
    const initialMap = game.mapManager.getMapById(initialMapId);
    if (!initialMap) {
      ws.close(1011, "Server error: Default map not available.");
      return;
    }

    await game.loadMapIfNeeded(initialMapId);

    const spawnPos = initialMap.getRandomTypePosition(2);
    if (!spawnPos) {
      ws.close(1011, "Server error: No spawn on default map.");
      return;
    }

    player.x = spawnPos.x;
    player.y = spawnPos.y;
    player.targetX = spawnPos.x; // Set target to avoid drifting to 0,0
    player.targetY = spawnPos.y; // Set target to avoid drifting to 0,0
    // game.addPlayer will set player.currentMapId
    await game.addPlayer(player, ws, initialMapId);

    // Player is now fully added, send the complete init data
    const playerCurrentMap = game.mapManager.getMapById(player.currentMapId); // Should be initialMap
    if (!playerCurrentMap) {
      await game.removePlayer(player.id);
      ws.close(
        1011,
        "Server error: map data unavailable for player post-join.",
      );
      return;
    }

    const enemiesOnPlayerMap =
      game.mapEnemies.get(player.currentMapId) || new Map();
    const serializedEnemies = Array.from(enemiesOnPlayerMap.values()).map(
      (enemy) => enemy.serialize(),
    );

    const fullInitDataString = JSON.stringify({
      type: "init", // Client already received a basic init, this one is more complete
      id: player.id,
      map: playerCurrentMap.tiles,
      mapWidth: playerCurrentMap.width,
      mapHeight: playerCurrentMap.height,
      tileSize: playerCurrentMap.tileSize,
      enemyTypes: ENEMY_TYPES,
      enemies: serializedEnemies,
      playerData: player.serialize(), // Includes name, x, y, etc.
      status: "joined", // Indicate player has successfully joined
    });

    game._idMapNeedsUpdate = true; // Trigger ID map update for all clients

    const compressedFullInitData = zlib.gzipSync(
      Buffer.from(fullInitDataString),
    );
    ws.send(compressedFullInitData, { binary: true });

    // Send welcome message in red
    const welcomeMessage = JSON.stringify({
      type: "chat",
      sender: "[SERVER]",
      message: "Welcome to Eluding! Type /reset or /r in chat to respawn.",
      color: "#ffceb7" // Red color
    });
    ws.send(welcomeMessage);

    console.log(
      `Player ${player.name} (${player.id}) joined game on map ${player.currentMapId}.`,
    );
  } catch (error) {
    console.error(`Error during player join game for ${player.id}:`, error);
    if (player.id && player.currentMapId) {
      // If partially added
      try {
        await game.removePlayer(player.id);
      } catch (e) {
        console.error("Error removing player during join failure:", e);
      }
    }
    if (
      ws.readyState === WebSocket.OPEN ||
      ws.readyState === WebSocket.CONNECTING
    ) {
      ws.close(1011, "Server error during game join.");
    }
  }
}

async function handlePlayerMessage(game, ws, player, rawMessage, broadcast) {
  try {
    const data = await parseMessageContents(rawMessage);

    // Player must be fully joined for most messages
    if (
      !player.currentMapId &&
      data.type !== "joinGame" &&
      data.type !== "ping" &&
      data.type !== "requestIdMap"
    ) {
      // Allow ping and requestIdMap even before joining, but not much else
      if (data.type === "ping") {
        handlePing(ws, data.time);
      } else {
        console.warn(
          `Player ${player.id} sent message type ${data.type} before joining game.`,
        );
      }
      return;
    }

    if (data.type === "joinGame") {
      if (data.name && typeof data.name === "string") {
        await handleJoinGame(game, ws, player, data.name, broadcast);
      } else {
        console.warn(`Player ${player.id} sent invalid joinGame message.`);
        ws.close(1003, "Invalid join game message.");
      }
    } else if (data.type === "m") {
      handleMouseMove(game, player.id, data.x, data.y);
    } else if (data.type === "ping") {
      handlePing(ws, data.time);
    } else if (data.type === "requestIdMap") {
      game._idMapNeedsUpdate = true;
    } else if (data.type === "chat") {
      handleChatMessage(game, ws, player, data.message, broadcast);
    }
  } catch (e) {
    console.error("Failed to parse or handle message:", e);
  }
}

module.exports = {
  handlePlayerMessage,
  parseMessageContents,
};
