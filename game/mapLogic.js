const MapEncoder = require('./maps/mapEncoder');
const { Teleporter, TeleporterManager } = require('./maps/teleporter');

class GameMap {
  constructor(mapConfig) {
    this.width = mapConfig.width;
    this.height = mapConfig.height;
    this.tileSize = mapConfig.tileSize;
    this.enemyConfig = mapConfig.enemyConfig;
    this.mapId = mapConfig.mapId || null;
    
    if (mapConfig.map) {
      this.tiles = mapConfig.map;
    } else if (mapConfig.encodedMap) {
      this.encodedMap = mapConfig.encodedMap;
      this.tiles = MapEncoder.decodeMap(this.encodedMap, this.width, this.height);
    } else {
      console.error('No valid map data provided in map configuration');
      this.tiles = new Array(this.height).fill(0).map(() => new Array(this.width).fill(0));
    }
    
    this.teleporterManager = new TeleporterManager();
    
    this.findTeleporterTiles();
    
    // Set teleporter links if provided
    if (mapConfig.teleporterLinks && mapConfig.teleporterLinks.length > 0) {
      this.teleporterLinks = mapConfig.teleporterLinks;
      this.teleporterManager.setTeleporterLinks(this.teleporterLinks);
      console.log(`Initialized ${this.teleporterLinks.length} teleporter links for map ${this.mapId || 'unknown'}`);
    } else {
      this.teleporterLinks = [];
    }
    
    // Continue with the original teleporter codes for backward compatibility
    if (mapConfig.teleporterCodes && mapConfig.teleporterCodes.length > 0) {
      this.teleporterCodes = mapConfig.teleporterCodes;
      this.teleporterManager.associateTeleporterCodes(this.teleporterCodes);
      console.log(`Initialized ${this.teleporterCodes.length} teleporters for map ${this.mapId || 'unknown'}`);
    } else {
      console.warn(`No teleporter codes provided for map ${this.mapId || 'unknown'}`);
      this.teleporterCodes = [];
    }
  }
  
  findTeleporterTiles() {
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        if (this.tiles[y][x] === 3) {
          const teleporter = new Teleporter(x, y);
          this.teleporterManager.addTeleporter(teleporter);
        }
      }
    }
  }
  
  isWall(x, y) {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) {
      return true;
    }
    return this.tiles[y][x] === 0;
  }
  
  getTileType(x, y) {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) {
      return 0;
    }
    return this.tiles[y][x];
  }
  
  isSafeZone(x, y) {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) {
      return false;
    }
    const tileType = this.tiles[y][x];
    return tileType === 2 || tileType === 4;
  }
  
  getRandomTypePosition(tileType) {
    const positions = [];
    
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        if (this.tiles[y][x] === tileType) {
          positions.push({ x, y });
        }
      }
    }
    
    if (positions.length === 0) {
      return null;
    }
    
    const randomPos = positions[Math.floor(Math.random() * positions.length)];
    return {
      x: randomPos.x * this.tileSize + this.tileSize / 2,
      y: randomPos.y * this.tileSize + this.tileSize / 2
    };
  }
  
  getValidSpawnPosition(tileType, radius, grid) {
    const positions = [];
    
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        if (this.getTileType(x,y) === tileType) {
          const worldX = x * this.tileSize + this.tileSize / 2;
          const worldY = y * this.tileSize + this.tileSize / 2;
          
          if (grid.isValidSpawnPosition(worldX, worldY, radius)) {
            positions.push({ x: worldX, y: worldY });
          }
        }
      }
    }
    
    if (positions.length === 0) {
      return null;
    }
    return positions[Math.floor(Math.random() * positions.length)];
  }

  isTeleporter(tileX, tileY) {
    return this.tiles[tileY][tileX] === 3;
  }

  getTeleporter(tileX, tileY) {
    return this.teleporterManager.getTeleporterByPosition(tileX, tileY);
  }

  getTeleporterByCode(code) {
    return this.teleporterManager.getTeleporterByCode(code);
  }
  
  // New method to get teleporter using the new link format
  getTeleporterByLink(tileX, tileY, mapIndex) {
    return this.teleporterManager.getTeleporterByLink(tileX, tileY, mapIndex);
  }

  findConnectedRegions(tileType) {
    const visited = new Array(this.height).fill(0).map(() => new Array(this.width).fill(false));
    const regions = [];
    
    const bfs = (startX, startY) => {
      const queue = [{x: startX, y: startY}];
      const tiles = [];
      visited[startY][startX] = true;
      
      while (queue.length > 0) {
        const {x, y} = queue.shift();
        tiles.push({x, y});
        
        const directions = [
          {dx: 1, dy: 0},  // right
          {dx: -1, dy: 0}, // left
          {dx: 0, dy: 1},  // down
          {dx: 0, dy: -1}  // up
        ];
        
        for (const {dx, dy} of directions) {
          const nx = x + dx;
          const ny = y + dy;
          
          if (nx < 0 || nx >= this.width || ny < 0 || ny >= this.height) {
            continue;
          }
          
          if (this.tiles[ny][nx] === tileType && !visited[ny][nx]) {
            visited[ny][nx] = true;
            queue.push({x: nx, y: ny});
          }
        }
      }
      
      const minX = Math.min(...tiles.map(t => t.x));
      const maxX = Math.max(...tiles.map(t => t.x));
      const minY = Math.min(...tiles.map(t => t.y));
      const maxY = Math.max(...tiles.map(t => t.y));
      
      return {
        tiles,
        centerX: Math.floor(tiles.reduce((sum, t) => sum + t.x, 0) / tiles.length),
        centerY: Math.floor(tiles.reduce((sum, t) => sum + t.y, 0) / tiles.length),
        minX,
        maxX,
        minY,
        maxY,
        width: maxX - minX + 1,
        height: maxY - minY + 1
      };
    };
    
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        if (this.tiles[y][x] === tileType && !visited[y][x]) {
          const region = bfs(x, y);
          regions.push(region);
        }
      }
    }
    
    return regions;
  }
}

module.exports = { Map: GameMap }; 