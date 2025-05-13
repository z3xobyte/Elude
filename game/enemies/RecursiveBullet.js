const { v4: uuidv4 } = require('uuid');
const { MS_PER_GAME_TICK } = require('./BaseEnemy');

class RecursiveBullet {
  constructor(x, y, targetX, targetY, radius, speed, recursionLevel = 2, lifespan = 100) {
    this.id = `recursive_bullet_${uuidv4()}`;
    this.x = x;
    this.y = y;
    this.prevX = x;
    this.prevY = y;
    this.radius = radius;
    this.speed = speed;
    this.color = '#AD85FF'; // Light purple
    this.outlineColor = '#5D2E8C'; // Dark purple
    this.recursionLevel = recursionLevel;
    this.lifespan = lifespan;
    this.ticksLived = 0;
    this.hasFired = false;
    this.fireDelay = 15; // Short delay before spawning child bullets

    const dx = targetX - x;
    const dy = targetY - y;
    const lengthSq = dx * dx + dy * dy;
    
    if (lengthSq > 0) {
      const length = Math.sqrt(lengthSq);
      this.vx = (dx / length) * speed;
      this.vy = (dy / length) * speed;
    } else {
      this.vx = 0;
      this.vy = -speed;
    }
    
    this.lastUpdateTime = Date.now();
    this.isActive = true;
    this._collisionShape = { id: this.id, x: 0, y: 0, radius: this.radius };
    

  }
  
  update(map, grid, game) {
    if (!this.isActive) return;
    
    this.ticksLived++;
    
    // Fire child bullets after a short delay
    if (this.recursionLevel > 0 && !this.hasFired && this.ticksLived >= this.fireDelay) {
      this.spawnChildBullets(grid, game);
    }
    
    // Expire if reached max lifespan
    if (this.ticksLived >= this.lifespan) {
      this.isActive = false;
      this.removeFromGrid(grid);
      return;
    }
    
    const currentTime = Date.now();
    const deltaTimeFactor = (currentTime - this.lastUpdateTime) / MS_PER_GAME_TICK;
    this.lastUpdateTime = currentTime;
    
    this.prevX = this.x;
    this.prevY = this.y;
    
    const newX = this.x + this.vx * deltaTimeFactor;
    const newY = this.y + this.vy * deltaTimeFactor;
    
    this._collisionShape.x = newX;
    this._collisionShape.y = newY;
    this._collisionShape.radius = this.radius;

    if (grid.checkWallCollision(this._collisionShape) || 
        grid.checkSafeZoneCollision(this._collisionShape) ||
        grid.checkTeleporterCollision(this._collisionShape) ||
        newX - this.radius < 0 || 
        newX + this.radius > map.width * map.tileSize || 
        newY - this.radius < 0 || 
        newY + this.radius > map.height * map.tileSize) {
      this.isActive = false;
      this.removeFromGrid(grid);
      return;
    }
    
    this.x = newX;
    this.y = newY;
    grid.update(this);
  }
  
  spawnChildBullets(grid, game) {
    if (!game || !game.mapBullets || !game.currentMapId) {
      return;
    }
    
    this.hasFired = true;
    
    // Create a single bullet that continues in current direction
    const nextRecursionLevel = this.recursionLevel - 1;
    const childRadius = this.radius * 0.8;
    const childSpeed = this.speed * 0.9;
    
    // Create one bullet in the same direction of travel
    const targetX = this.x + this.vx * 5;
    const targetY = this.y + this.vy * 5;
    
    const bullet = new RecursiveBullet(
      this.x, 
      this.y, 
      targetX, 
      targetY, 
      childRadius, 
      childSpeed, 
      nextRecursionLevel,
      this.lifespan * 0.8
    );
    
    const bulletsOnMap = game.mapBullets.get(game.currentMapId) || new Map();
    bulletsOnMap.set(bullet.id, bullet);
    game.mapBullets.set(game.currentMapId, bulletsOnMap);
    bullet.addToGrid(grid);
  }
  
  serialize() {
    return {
      id: this.id,
      x: this.x,
      y: this.y,
      prevX: this.prevX,
      prevY: this.prevY,
      radius: this.radius,
      isActive: this.isActive,
      recursionLevel: this.recursionLevel
    };
  }
  
  addToGrid(grid) {
    grid.insert(this);
  }
  
  removeFromGrid(grid) {
    grid.remove(this.id);
  }
}

module.exports = { RecursiveBullet }; 