const { Enemy, Sniper, Dasher, Homing, VoidCrawler, Wall, RecursiveBulletBoss } = require('./enemy');

class EnemySpawner {
  constructor(mapManager, mapGrids, mapEnemies) {
    this.mapManager = mapManager;
    this.mapGrids = mapGrids;
    this.mapEnemies = mapEnemies;
    
    // Cache for spawn positions to avoid recalculating
    this.spawnPositionCache = new Map();
    
    // Validation check
    if (!RecursiveBulletBoss) {
      console.error("ERROR: RecursiveBulletBoss class not loaded properly!");
    } else {
      console.log("RecursiveBulletBoss class loaded successfully in EnemySpawner");
    }
  }

  // Get cached or calculate new spawn position
  getSpawnPosition(map, spawnTileType, radius, grid, cacheKey) {
    if (this.spawnPositionCache.has(cacheKey)) {
      const positions = this.spawnPositionCache.get(cacheKey);
      if (positions.length > 0) {
        return positions.pop();
      }
    }
    return map.getValidSpawnPosition(spawnTileType, radius, grid);
  }

  spawnEnemiesForMap(mapId, map, grid) {
    if (!map || !grid) {
      console.error(`cannot spawn enemies for ${mapId} map or grid missing.`);
      return;
    }
    const enemiesOnThisMap = this.mapEnemies.get(mapId);
    if (!enemiesOnThisMap) {
      console.error(`enemy map not initialized for ${mapId}`);
      return;
    }

    const { spawnTileType, types } = map.enemyConfig;
    let totalEnemiesSpawned = 0;

    // Pre-calculate spawn positions for common radii to avoid repeated calculations
    this.spawnPositionCache.clear();
    const uniqueRadii = new Set(Object.values(types).map(config => config.radius));
    for (const radius of uniqueRadii) {
      const cacheKey = `${mapId}-${radius}`;
      // Pre-calculate up to 20 positions per radius
      const positions = [];
      for (let i = 0; i < 20; i++) {
        const pos = map.getValidSpawnPosition(spawnTileType, radius, grid);
        if (pos) positions.push(pos);
      }
      if (positions.length > 0) {
        this.spawnPositionCache.set(cacheKey, positions);
      }
    }

    for (const [type, config] of Object.entries(types)) {
      const { count, radius, minSpeed, maxSpeed } = config;
      const speedRange = maxSpeed - minSpeed;
      const cacheKey = `${mapId}-${radius}`;
      
      // Debug configuration
      console.log(`Spawning enemy type: ${type}, count: ${count}, radius: ${radius}`);
      
      if (type === "basic") {
        for (let i = 0; i < count; i++) {
          const spawnPos = this.getSpawnPosition(map, spawnTileType, radius, grid, cacheKey);
          if (!spawnPos) continue;

          const speed = minSpeed + Math.random() * speedRange;
          const enemy = new Enemy(spawnPos.x, spawnPos.y, radius, speed, 1);
          
          enemy.addToGrid(grid);
          enemiesOnThisMap.set(enemy.id, enemy);
          totalEnemiesSpawned++;
        }
      } else if (type === "sniper") {
        for (let i = 0; i < count; i++) {
          const spawnPos = this.getSpawnPosition(map, spawnTileType, radius, grid, cacheKey);
          if (!spawnPos) continue;

          const speed = minSpeed + Math.random() * speedRange;
          const sniper = new Sniper(
            spawnPos.x, 
            spawnPos.y, 
            radius, 
            speed,
            config.detectionRange,
            config.shootingRange,
            config.maxShootCooldown,
            config.bulletRadius,
            config.bulletSpeed
          );
          
          sniper.addToGrid(grid);
          enemiesOnThisMap.set(sniper.id, sniper);
          totalEnemiesSpawned++;
        }
      } else if (type === "dasher") {
        for (let i = 0; i < count; i++) {
          const spawnPos = this.getSpawnPosition(map, spawnTileType, radius, grid, cacheKey);
          if (!spawnPos) continue;

          const speed = minSpeed + Math.random() * speedRange;
          const dasher = new Dasher(
            spawnPos.x, 
            spawnPos.y, 
            radius, 
            speed,
            config.timeToPrepare,
            config.timeToDash,
            config.timeBetweenDashes
          );
          
          dasher.addToGrid(grid);
          enemiesOnThisMap.set(dasher.id, dasher);
          totalEnemiesSpawned++;
        }
      } else if (type === "homing") {
        for (let i = 0; i < count; i++) {
          const spawnPos = this.getSpawnPosition(map, spawnTileType, radius, grid, cacheKey);
          if (!spawnPos) continue;

          const speed = minSpeed + Math.random() * speedRange;
          const homing = new Homing(
            spawnPos.x, 
            spawnPos.y, 
            radius, 
            speed,
            config.turnIncrement,
            config.homeRange
          );
          
          homing.addToGrid(grid);
          enemiesOnThisMap.set(homing.id, homing);
          totalEnemiesSpawned++;
        }
      } else if (type === "void_crawler") {
        for (let i = 0; i < count; i++) {
          const spawnPos = this.getSpawnPosition(map, spawnTileType, radius, grid, cacheKey);
          if (!spawnPos) continue;

          const speed = minSpeed + Math.random() * speedRange;
          const voidCrawler = new VoidCrawler(
            spawnPos.x, 
            spawnPos.y, 
            radius, 
            speed,
            config.turnIncrement,
            config.homeRange
          );
          
          voidCrawler.addToGrid(grid);
          enemiesOnThisMap.set(voidCrawler.id, voidCrawler);
          totalEnemiesSpawned++;
        }
      } else if (type === "recursive_bullet_boss") {
        try {
          if (!RecursiveBulletBoss) {
            throw new Error("RecursiveBulletBoss class not available");
          }
          
          console.log(`Spawning ${count} RecursiveBulletBoss enemies with config:`, config);
          
          for (let i = 0; i < count; i++) {
            const spawnPos = this.getSpawnPosition(map, spawnTileType, radius, grid, cacheKey);
            if (!spawnPos) {
              console.warn(`Could not find valid spawn position for RecursiveBulletBoss #${i+1}`);
              continue;
            }

            const speed = minSpeed + Math.random() * speedRange;
            console.log(`Creating RecursiveBulletBoss at (${spawnPos.x}, ${spawnPos.y}) with speed ${speed}`);
            
            const boss = new RecursiveBulletBoss(
              spawnPos.x, 
              spawnPos.y, 
              radius, 
              speed,
              config.shootCooldown || 120,
              config.bulletRadius || 8,
              config.bulletSpeed || 4,
              config.recursionLevels || 2
            );
            
            boss.addToGrid(grid);
            enemiesOnThisMap.set(boss.id, boss);
            console.log(`RecursiveBulletBoss added to grid with ID: ${boss.id}`);
            totalEnemiesSpawned++;
          }
        } catch (error) {
          console.error(`Error spawning RecursiveBulletBoss: ${error.message}`);
          console.error(error.stack);
        }
      } else if (type === "wall") {
        this.spawnWallEnemies(map, grid, config, enemiesOnThisMap, spawnTileType, radius, minSpeed, maxSpeed, count);
        totalEnemiesSpawned += config._wallsSpawned || 0;
      }
    }
    
    console.log(`Spawned ${totalEnemiesSpawned} enemies for map ${mapId} (Types: ${Object.keys(types).join(', ')})`);
  }
  
  spawnWallEnemies(map, grid, config, enemiesOnThisMap, spawnTileType, radius, minSpeed, maxSpeed, count) {
    const regions = map.findConnectedRegions(1);
    let wallsSpawned = 0;
    
    const moveClockwise = config.moveClockwise !== undefined ? config.moveClockwise : true;
    const patternAlternate = config.patternAlternate !== undefined ? config.patternAlternate : false;
    const initialSide = config.initialSide !== undefined ? config.initialSide : 0;
    
    // Sort regions by perimeter size (largest first) - improves spawning quality
    regions.sort((a, b) => {
      const widthA = (a.maxX - a.minX + 1);
      const heightA = (a.maxY - a.minY + 1);
      const widthB = (b.maxX - b.minX + 1);
      const heightB = (b.maxY - b.minY + 1);
      
      const perimeterA = 2 * (widthA + heightA);
      const perimeterB = 2 * (widthB + heightB);
      
      return perimeterB - perimeterA;
    });
    
    // Calculate and cache total perimeter once
    let totalPerimeter = 0;
    const regionPerimeters = [];
    const tileSize = map.tileSize;
    const minViablePerimeter = radius * 10;
    const speedRange = maxSpeed - minSpeed;
    
    for (const region of regions) {
      const width = (region.maxX - region.minX + 1) * tileSize;
      const height = (region.maxY - region.minY + 1) * tileSize;
      const perimeter = 2 * (width + height);
      
      if (perimeter >= minViablePerimeter) {
        totalPerimeter += perimeter;
        regionPerimeters.push({ region, perimeter, width, height });
      }
    }
    
    // Process each region
    for (const { region, perimeter, width, height } of regionPerimeters) {
      if (wallsSpawned >= count) break;
      
      if (region.tiles.length < 4) continue;
      
      const regionWallCount = Math.max(1, Math.floor((perimeter / totalPerimeter) * count));
      
      const minX = Math.min(...region.tiles.map(t => t.x));
      const minY = Math.min(...region.tiles.map(t => t.y));
      
      const boundaryX = minX * tileSize;
      const boundaryY = minY * tileSize;
      const boundaryWidth = width;
      const boundaryHeight = height;
      
      const minSpacing = radius * 3;
      const maxWallsWithSpacing = Math.floor(perimeter / minSpacing);
      
      if (maxWallsWithSpacing < 2) continue;
          
      const wallsForThisRegion = Math.min(regionWallCount, maxWallsWithSpacing, count - wallsSpawned);
      const spacingPerWall = perimeter / wallsForThisRegion;
      
      // Use a quadtree or spatial grid for collision detection in a real implementation
      // For simplicity, we'll optimize the current approach
      const wallPositions = [];
      
      for (let i = 0; i < wallsForThisRegion; i++) {
        const speed = minSpeed + Math.random() * speedRange;
        const wallMoveClockwise = patternAlternate ? (i % 2 === 0 ? moveClockwise : !moveClockwise) : moveClockwise;
        
        const wall = new Wall(
          0, 
          0, 
          radius,
          speed,
          boundaryX,
          boundaryY,
          boundaryWidth,
          boundaryHeight,
          i, // wallIndex
          wallsForThisRegion,
          wallMoveClockwise,
          initialSide,
          spacingPerWall
        );
        
        // Check for overlaps more efficiently
        let overlaps = false;
        for (const position of wallPositions) {
          const dx = wall.x - position.x;
          const dy = wall.y - position.y;
          // Use squared distance for performance (avoid sqrt)
          const distanceSquared = dx * dx + dy * dy;
          const minDistance = wall.radius + position.radius;
          
          if (distanceSquared < minDistance * minDistance) {
            overlaps = true;
            break;
          }
        }
        
        if (!overlaps) {
          wallPositions.push({
            x: wall.x,
            y: wall.y,
            radius: wall.radius
          });
          
          wall.addToGrid(grid);
          enemiesOnThisMap.set(wall.id, wall);
          wallsSpawned++;
        }
      }
    }
    
    config._wallsSpawned = wallsSpawned;
    console.log(`Added ${wallsSpawned} wall enemies (requested: ${count})`);
  }
}

module.exports = { EnemySpawner }; 