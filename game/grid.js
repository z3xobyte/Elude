class Grid {
  static NUM_POINTS_8 = 8;
  static ANGLES_COS_8 = [];
  static ANGLES_SIN_8 = [];
  static NUM_POINTS_12 = 12;
  static ANGLES_COS_12 = [];
  static ANGLES_SIN_12 = [];

  static {
    const RAYS = [
      { numPoints: Grid.NUM_POINTS_8, cosArray: Grid.ANGLES_COS_8, sinArray: Grid.ANGLES_SIN_8 },
      { numPoints: Grid.NUM_POINTS_12, cosArray: Grid.ANGLES_COS_12, sinArray: Grid.ANGLES_SIN_12 },
    ];

    for (const ray of RAYS) {
      for (let i = 0; i < ray.numPoints; i++) {
        const angle = (i / ray.numPoints) * Math.PI * 2;
        ray.cosArray.push(Math.cos(angle));
        ray.sinArray.push(Math.sin(angle));
      }
    }
  }

  constructor(width, height, cellSize) {
    this.width = width;
    this.height = height;
    this.cellSize = cellSize;
    this.inverseCellSize = 1.0 / cellSize;

    this.cellsX = Math.ceil(width / cellSize);
    this.cellsY = Math.ceil(height / cellSize);

    this.maxCellX = this.cellsX - 1;
    this.maxCellY = this.cellsY - 1;

    // Pre-calculate cell area for performance
    this.cellArea = this.cellSize * this.cellSize;

    // Create cells array with optimized cell objects
    this.cells = new Array(this.cellsX * this.cellsY);
    for (let i = 0; i < this.cells.length; ++i) {
      this.cells[i] = {
        entities: new Set(),
        isWall: false,
        isSafeZone: false,
        isTeleporter: false,
        teleporterInfo: null,
        isPlayerSpawnable: false, 
      };
    }
    this.entities = new Map();
    
    // Cache for boundary checks
    this.worldBounds = {
      minX: 0,
      minY: -2, // From original code
      maxX: width,
      maxY: height
    };
  }

  getCellIndex(x, y) {
    const cellX = Math.min(this.maxCellX, ~~(x * this.inverseCellSize));
    const cellY = Math.min(this.maxCellY, ~~(y * this.inverseCellSize));
    return cellX * this.cellsY + cellY;
  }

  getCellCoords(x, y) {
    const cellX = Math.min(this.maxCellX, ~~(x * this.inverseCellSize));
    const cellY = Math.min(this.maxCellY, ~~(y * this.inverseCellSize));
    return { x: cellX, y: cellY };
  }

  initializeMapData(map) {
    const cells = this.cells;
    // Reset all cells first (batch operation)
    for (let i = 0; i < cells.length; i++) {
      const cell = cells[i];
      cell.isWall = false;
      cell.isSafeZone = false;
      cell.isTeleporter = false;
      cell.teleporterInfo = null;
      cell.isPlayerSpawnable = false;
    }

    const invCellSize = this.inverseCellSize;
    const maxCX = this.maxCellX;
    const maxCY = this.maxCellY;
    const cellsYCount = this.cellsY;
    const mapTileSize = map.tileSize;

    for (let tileY = 0; tileY < map.height; tileY++) {
      for (let tileX = 0; tileX < map.width; tileX++) {
        const tileType = map.getTileType(tileX, tileY);
        if (tileType === null || tileType === undefined) continue;

        const worldMinX = tileX * mapTileSize;
        const worldMinY = tileY * mapTileSize;
        const worldMaxX = worldMinX + mapTileSize;
        const worldMaxY = worldMinY + mapTileSize;

        // Optimize calculations with bit-shift for integer division when possible
        const minCellX = Math.max(0, Math.min(maxCX, ~~(worldMinX * invCellSize)));
        const minCellY = Math.max(0, Math.min(maxCY, ~~(worldMinY * invCellSize)));
        const maxCellXBoundary = Math.max(0, Math.min(maxCX, ~~((worldMaxX - 0.0001) * invCellSize)));
        const maxCellYBoundary = Math.max(0, Math.min(maxCY, ~~((worldMaxY - 0.0001) * invCellSize)));

        // Apply properties based on tile type efficiently
        for (let cX = minCellX; cX <= maxCellXBoundary; cX++) {
          for (let cY = minCellY; cY <= maxCellYBoundary; cY++) {
            const cellIndex = cX * cellsYCount + cY;
            const currentCell = cells[cellIndex];
            
            switch(tileType) {
              case 0: // Wall
                currentCell.isWall = true;
                break;
              case 2: // Player-spawnable Safe Zone
                currentCell.isSafeZone = true;
                currentCell.isPlayerSpawnable = true;
                break;
              case 3: // Teleporter
                currentCell.isTeleporter = true;
                const teleporter = map.getTeleporter(tileX, tileY);
                if (teleporter) {
                  currentCell.teleporterInfo = {
                    tileX,
                    tileY,
                    code: teleporter.code,
                    mapId: teleporter.mapId,
                  };
                }
                break;
              case 4: // Non-player-spawnable Safe Zone
                currentCell.isSafeZone = true;
                break;
            }
          }
        }
      }
    }
  }

  insert(entity) {
    const entityRadius = entity.radius || 0;
    const entityId = entity.id;
    
    // Calculate cell range using min/max helpers for bounds checking
    const minX = Math.min(this.maxCellX, ~~((entity.x - entityRadius) * this.inverseCellSize));
    const minY = Math.min(this.maxCellY, ~~((entity.y - entityRadius) * this.inverseCellSize));
    const maxX = Math.min(this.maxCellX, ~~((entity.x + entityRadius) * this.inverseCellSize));
    const maxY = Math.min(this.maxCellY, ~~((entity.y + entityRadius) * this.inverseCellSize));

    const cellIndices = [];
    const cellsYCount = this.cellsY;
    const currentCells = this.cells;

    // Only process if we have a valid range
    if (maxX >= minX && maxY >= minY) {
      // Pre-calculate the base index for each x to reduce multiplications in inner loop
      for (let x = minX; x <= maxX; x++) {
        const baseIndex = x * cellsYCount;
        for (let y = minY; y <= maxY; y++) {
          const cellIndex = baseIndex + y;
          currentCells[cellIndex].entities.add(entityId);
          cellIndices.push(cellIndex);
        }
      }
    }

    this.entities.set(entityId, {
      entity,
      minX,
      minY,
      maxX,
      maxY,
      cellIndices,
    });
    return cellIndices;
  }

  remove(entityId) {
    const entityData = this.entities.get(entityId);
    if (!entityData) return;

    const currentCells = this.cells;
    const cellIndices = entityData.cellIndices;
    const len = cellIndices.length;
    
    // Direct loop for better performance
    for (let i = 0; i < len; i++) {
      const cellIndex = cellIndices[i];
      if (currentCells[cellIndex]) {
        currentCells[cellIndex].entities.delete(entityId);
      }
    }
    this.entities.delete(entityId);
  }

  update(entity) {
    const entityId = entity.id;
    const entityData = this.entities.get(entityId);

    if (!entityData) {
      return this.insert(entity);
    }

    const oldCellIndices = entityData.cellIndices;
    const oldMinX = entityData.minX;
    const oldMinY = entityData.minY;
    const oldMaxX = entityData.maxX;
    const oldMaxY = entityData.maxY;

    const entityRadius = entity.radius || 0;
    const cellsYCount = this.cellsY;
    const currentCells = this.cells;

    // Calculate new cell range with efficient bounds checking
    const newMinX = Math.min(this.maxCellX, ~~((entity.x - entityRadius) * this.inverseCellSize));
    const newMinY = Math.min(this.maxCellY, ~~((entity.y - entityRadius) * this.inverseCellSize));
    const newMaxX = Math.min(this.maxCellX, ~~((entity.x + entityRadius) * this.inverseCellSize));
    const newMaxY = Math.min(this.maxCellY, ~~((entity.y + entityRadius) * this.inverseCellSize));

    // Fast path: if position hasn't changed cell membership
    if (
      newMinX === oldMinX &&
      newMinY === oldMinY &&
      newMaxX === oldMaxX &&
      newMaxY === oldMaxY
    ) {
      entityData.entity = entity;
      return oldCellIndices;
    }

    // Create new cell indices array
    const newCellIndicesArray = [];
    if (newMaxX >= newMinX && newMaxY >= newMinY) {
      for (let x = newMinX; x <= newMaxX; x++) {
        const baseIndex = x * cellsYCount;
        for (let y = newMinY; y <= newMaxY; y++) {
          newCellIndicesArray.push(baseIndex + y);
        }
      }
    }

    // Efficient set operations for determining cells to add/remove entity from
    const oldCellIndicesSet = new Set(oldCellIndices);
    const newCellIndicesSet = new Set(newCellIndicesArray);

    // Remove entity from cells it's no longer in
    for (const cellIndex of oldCellIndicesSet) {
      if (!newCellIndicesSet.has(cellIndex)) {
        if (currentCells[cellIndex]) {
          currentCells[cellIndex].entities.delete(entityId);
        }
      }
    }

    // Add entity to cells it's now in
    for (const cellIndex of newCellIndicesSet) {
      if (!oldCellIndicesSet.has(cellIndex)) {
        if (currentCells[cellIndex]) {
          currentCells[cellIndex].entities.add(entityId);
        }
      }
    }

    // Update entity data
    entityData.entity = entity;
    entityData.minX = newMinX;
    entityData.minY = newMinY;
    entityData.maxX = newMaxX;
    entityData.maxY = newMaxY;
    entityData.cellIndices = newCellIndicesArray;

    return newCellIndicesArray;
  }

  getNearbyEntities(entity) {
    const entityData = this.entities.get(entity.id);
    if (!entityData) return [];

    const nearbyIds = new Set();
    const entityIdToExclude = entity.id;
    const currentCells = this.cells;
    const cellIndices = entityData.cellIndices;
    const len = cellIndices.length;

    // Direct loop for better performance
    for (let i = 0; i < len; i++) {
      const cellIndex = cellIndices[i];
      for (const id of currentCells[cellIndex].entities) {
        if (id !== entityIdToExclude) {
          nearbyIds.add(id);
        }
      }
    }
    return Array.from(nearbyIds);
  }

  _checkOverlapWithCellProperty(checkX, checkY, checkRadius, cellPredicate) {
    // Early bounds check for performance
    const { minX, minY, maxX, maxY } = this.worldBounds;
    if (
      checkX + checkRadius < minX ||
      checkX - checkRadius > maxX ||
      checkY + checkRadius < minY ||
      checkY - checkRadius > maxY
    ) {
      return false;
    }
    
    const invCellSize = this.inverseCellSize;
    const cellsYCount = this.cellsY;
    const cSize = this.cellSize;
    const currentCells = this.cells;

    const entityCellX = ~~(checkX * invCellSize);
    const entityCellY = ~~(checkY * invCellSize);

    // Calculate radius in cells (rounded up for safety)
    const radiusInCells = Math.ceil(checkRadius * invCellSize);

    // Calculate test bounds with efficient clamping
    const minTestCellX = Math.min(this.maxCellX, entityCellX - radiusInCells);
    const minTestCellY = Math.min(this.maxCellY, entityCellY - radiusInCells);
    const maxTestCellX = Math.max(0, Math.min(this.maxCellX, entityCellX + radiusInCells));
    const maxTestCellY = Math.max(0, Math.min(this.maxCellY, entityCellY + radiusInCells));

    // Calculate entity bounds
    const entityWorldMinX = checkX - checkRadius;
    const entityWorldMinY = checkY - checkRadius;
    const entityWorldMaxX = checkX + checkRadius;
    const entityWorldMaxY = checkY + checkRadius;

    // First check the entity cell directly for early exit
    const centerCellIndex = entityCellX * cellsYCount + entityCellY;
    if (centerCellIndex >= 0 && centerCellIndex < currentCells.length) {
      const centerCell = currentCells[centerCellIndex];
      if (centerCell && cellPredicate(centerCell)) {
        return true;
      }
    }

    // Check all potentially overlapping cells
    for (let cx = minTestCellX; cx <= maxTestCellX; cx++) {
      const baseIndex = cx * cellsYCount;
      for (let cy = minTestCellY; cy <= maxTestCellY; cy++) {
        const cellIndex = baseIndex + cy;
        
        // Skip the center cell we already checked
        if (cellIndex === centerCellIndex) continue;
        
        const cell = currentCells[cellIndex];
        if (cell && cellPredicate(cell)) {
          const cellWorldMinX = cx * cSize;
          const cellWorldMinY = cy * cSize;
          const cellWorldMaxX = cellWorldMinX + cSize;
          const cellWorldMaxY = cellWorldMinY + cSize;

          if (
            entityWorldMinX < cellWorldMaxX &&
            entityWorldMaxX > cellWorldMinX &&
            entityWorldMinY < cellWorldMaxY &&
            entityWorldMaxY > cellWorldMinY
          ) {
            return true;
          }
        }
      }
    }
    return false;
  }

  checkWallCollision(entity) {
    const radius = entity.radius || 0;
    const { minX, minY, maxX, maxY } = this.worldBounds;
    
    // Fast boundary check
    if (
      entity.x - radius < minX ||
      entity.x + radius > maxX ||
      entity.y - radius < minY ||
      entity.y + radius > maxY
    ) {
      return true;
    }
    
    return this._checkOverlapWithCellProperty(
      entity.x,
      entity.y,
      radius,
      (cell) => cell.isWall
    );
  }

  checkSafeZoneCollision(entity) {
    return this._checkOverlapWithCellProperty(
      entity.x,
      entity.y,
      entity.radius || 0,
      (cell) => cell.isSafeZone
    );
  }

  queryArea(x, y, radius) {
    const entityRadius = radius || 0;
    const invCellSize = this.inverseCellSize;
    const cellsYCount = this.cellsY;

    // Calculate boundaries with efficient clamping
    const minX = Math.min(this.maxCellX, ~~((x - entityRadius) * invCellSize));
    const minY = Math.min(this.maxCellY, ~~((y - entityRadius) * invCellSize));
    const maxX = Math.min(this.maxCellX, ~~((x + entityRadius) * invCellSize));
    const maxY = Math.min(this.maxCellY, ~~((y + entityRadius) * invCellSize));

    const entityIds = new Set();
    const currentCells = this.cells;
    
    if (maxX >= minX && maxY >= minY) {
      // Optimize inner loop by precalculating cell row index
      for (let cellX = minX; cellX <= maxX; cellX++) {
        const baseIndex = cellX * cellsYCount;
        for (let cellY = minY; cellY <= maxY; cellY++) {
          const cellIndex = baseIndex + cellY;
          const cellEntities = currentCells[cellIndex].entities;
          
          // Use forEach for better performance than for-of on Sets
          cellEntities.forEach(id => entityIds.add(id));
        }
      }
    }
    return Array.from(entityIds);
  }

  clear() {
    // More efficient clearing of cells
    const cellsLen = this.cells.length;
    for (let i = 0; i < cellsLen; i++) {
      this.cells[i].entities.clear();
    }
    this.entities.clear();
  }

  getGridStats() {
    let totalEntities = this.entities.size;
    let occupiedCells = 0;
    let maxEntitiesInCell = 0;
    
    const cellsLen = this.cells.length;
    for (let i = 0; i < cellsLen; i++) {
      const size = this.cells[i].entities.size;
      if (size > 0) {
        occupiedCells++;
        if (size > maxEntitiesInCell) {
          maxEntitiesInCell = size;
        }
      }
    }
    
    return {
      totalEntities,
      occupiedCells,
      maxEntitiesInCell,
      totalCells: this.cellsX * this.cellsY,
    };
  }

  bulkInsert(entitiesToAdd) {
    if (!entitiesToAdd || entitiesToAdd.length === 0) return;
    
    // Create a Set for faster lookups during removal phase
    const idsToAdd = new Set();
    const len = entitiesToAdd.length;
    
    // First pass - collect IDs and remove existing entries
    for (let i = 0; i < len; i++) {
      const entity = entitiesToAdd[i];
      const entityId = entity.id;
      idsToAdd.add(entityId);
      
      if (this.entities.has(entityId)) {
        this.remove(entityId);
      }
    }
    
    // Second pass - insert entities
    for (let i = 0; i < len; i++) {
      this.insert(entitiesToAdd[i]);
    }
  }

  isValidSpawnPosition(x, y, radius) {
    const rad = radius || 0;
    const { minX, minY, maxX, maxY } = this.worldBounds;
    
    // Check world boundaries
    if (
      x - rad < minX ||
      x + rad > maxX ||
      y - rad < minY ||
      y + rad > maxY
    ) {
      return false;
    }
    
    // FIX: Don't allow enemies to spawn in ANY safe zone (2, 4) or teleporter (3)
    // Previous code only prevented spawning in non-player-spawnable safe zones
    return !this._checkOverlapWithCellProperty(
      x,
      y,
      rad,
      (cell) => cell.isWall || cell.isSafeZone || cell.isTeleporter
    );
  }

  checkTeleporterCollision(entity) {
    return this._checkOverlapWithCellProperty(
      entity.x,
      entity.y,
      entity.radius || 0,
      (cell) => cell.isTeleporter
    );
  }
  
  getTeleporterAt(x, y) {
    const cellIndex = this.getCellIndex(x, y);
    const cell = this.cells[cellIndex];
    
    if (cell && cell.isTeleporter && cell.teleporterInfo) {
      return cell.teleporterInfo;
    }
    return null;
  }

  isFullyOutsideTeleporter(entity) {
    return !this.checkTeleporterCollision(entity);
  }

  isFullyInsideTeleporter(entity) {
    const centerTeleporterInfo = this.getTeleporterAt(entity.x, entity.y);
    if (!centerTeleporterInfo) {
      return false;
    }

    const x = entity.x;
    const y = entity.y;
    const radius = entity.radius || 0;
    const centerCode = centerTeleporterInfo.code;
    const invCellSize = this.inverseCellSize;
    const cellsYCount = this.cellsY;

    // More efficient cell range calculation
    const minX = Math.min(this.maxCellX, ~~((x - radius) * invCellSize));
    const minY = Math.min(this.maxCellY, ~~((y - radius) * invCellSize));
    const maxX = Math.min(this.maxCellX, ~~((x + radius) * invCellSize));
    const maxY = Math.min(this.maxCellY, ~~((y + radius) * invCellSize));

    // Pre-compute squared test radius for distance checks
    const testRadiusSq = (radius + Math.sqrt(2) * (this.cellSize / 2)) ** 2;

    for (let cx = minX; cx <= maxX; cx++) {
      const baseIndex = cx * cellsYCount;
      for (let cy = minY; cy <= maxY; cy++) {
        const cellCenterX = (cx + 0.5) * this.cellSize;
        const cellCenterY = (cy + 0.5) * this.cellSize;
        
        // Square distance calculation (avoid sqrt for performance)
        const distSq = (cellCenterX - x) ** 2 + (cellCenterY - y) ** 2;
        
        if (distSq > testRadiusSq) continue;

        const cellIndex = baseIndex + cy;
        if (cellIndex < 0 || cellIndex >= this.cells.length) continue;

        const cell = this.cells[cellIndex];
        if (
          !cell.isTeleporter ||
          !cell.teleporterInfo ||
          cell.teleporterInfo.code !== centerCode
        ) {
          return false;
        }
      }
    }
    return true;
  }
}
if (typeof module !== "undefined" && module.exports) {
  module.exports = Grid;
}
