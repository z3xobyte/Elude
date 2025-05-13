const { v4: uuidv4 } = require('uuid');
const MS_PER_GAME_TICK = 1000 / 60;

class Enemy {
  static counter = 0;
  
  constructor(x, y, radius, speed, type = 1) {
    this.id = `${type}_${Enemy.counter++}`;
    this.type = type;
    this.x = x;
    this.y = y;
    this.prevX = x;
    this.prevY = y;
    this.radius = radius;

    const ENEMY_TYPES = {
      1: { name: 'Basic', color: '#808080', outlineColor: '#000000' },
      2: { name: 'Sniper', color: '#8B0000', outlineColor: '#000000' },
      3: { name: 'Dasher', color: '#003c66', outlineColor: '#001830' },
      4: { name: 'Homing', color: '#7F00FF', outlineColor: '#5c4200' },
      5: { name: 'VoidCrawler', color: '#1c0a2d', outlineColor: '#0d0517' },
      6: { name: 'Wall', color: '#222222', outlineColor: '#111111' }
    };
    
    const typeConfig = ENEMY_TYPES[type] || ENEMY_TYPES[1]; 
    this.color = typeConfig.color;
    this.outlineColor = typeConfig.outlineColor;
    
    const directions = [
      { x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 },
      { x: 1, y: 1 }, { x: -1, y: 1 }, { x: 1, y: -1 }, { x: -1, y: -1 }
    ];
    const randomBaseDir = directions[Math.floor(Math.random() * directions.length)];
    
    const offsetX = (Math.random() * 0.4) - 0.2;
    const offsetY = (Math.random() * 0.4) - 0.2;
    
    const dirX = randomBaseDir.x + offsetX;
    const dirY = randomBaseDir.y + offsetY;
    const lengthSq = dirX * dirX + dirY * dirY;
    
    if (lengthSq > 0) {
      const length = Math.sqrt(lengthSq);
      this.vx = (dirX / length) * speed;
      this.vy = (dirY / length) * speed;
    } else {
      this.vx = speed; 
      this.vy = 0;
    }
    
    this.speed = speed;
    this.lastUpdateTime = Date.now();
    this._collisionShape = { id: this.id, x: 0, y: 0, radius: this.radius };
  }

  _normalizeVelocity() {
    const currentSpeedSq = this.vx * this.vx + this.vy * this.vy;
    if (currentSpeedSq > 0) {
      const currentSpeed = Math.sqrt(currentSpeedSq);
      if (currentSpeed !== this.speed) { 
        this.vx = (this.vx / currentSpeed) * this.speed;
        this.vy = (this.vy / currentSpeed) * this.speed;
      }
    } else if (this.speed > 0) {
        const angle = Math.random() * Math.PI * 2;
        this.vx = Math.cos(angle) * this.speed;
        this.vy = Math.sin(angle) * this.speed;
    }
  }
  
  update(map, grid) {
    const currentTime = Date.now();
    const deltaTimeFactor = (currentTime - this.lastUpdateTime) / MS_PER_GAME_TICK;
    this.lastUpdateTime = currentTime;
    
    this.prevX = this.x;
    this.prevY = this.y;
    
    let positionChanged = false;

    const newX = this.x + this.vx * deltaTimeFactor;
    const newY = this.y + this.vy * deltaTimeFactor;
    
    this._collisionShape.x = newX;
    this._collisionShape.y = this.y;
    this._collisionShape.radius = this.radius;

    if (grid.checkWallCollision(this._collisionShape) || grid.checkSafeZoneCollision(this._collisionShape) || grid.checkTeleporterCollision(this._collisionShape)) {
      this.vx = -this.vx;
      this.vx += (Math.random() - 0.5) * 0.2; 
      this.vy += (Math.random() - 0.5) * 0.2;
      this._normalizeVelocity();
    } else {
      this.x = newX;
      positionChanged = true;
    }

    this._collisionShape.x = this.x;
    this._collisionShape.y = newY;
    
    if (grid.checkWallCollision(this._collisionShape) || grid.checkSafeZoneCollision(this._collisionShape) || grid.checkTeleporterCollision(this._collisionShape)) {
      this.vy = -this.vy;
      this.vx += (Math.random() - 0.5) * 0.2;
      this.vy += (Math.random() - 0.5) * 0.2;
      this._normalizeVelocity();
    } else {
      this.y = newY;
      positionChanged = true;
    }

    this._collisionShape.x = this.x;
    this._collisionShape.y = this.y;
    
    if (grid.checkWallCollision(this._collisionShape) || 
        grid.checkSafeZoneCollision(this._collisionShape) ||
        grid.checkTeleporterCollision(this._collisionShape) ||
        this.x - this.radius < 0 || 
        this.x + this.radius > map.width * map.tileSize || 
        this.y - this.radius < 0 || 
        this.y + this.radius > map.height * map.tileSize) {
      this.x = this.prevX;
      this.y = this.prevY;
      positionChanged = false;
      this.vx = -this.vx;
      this.vy = -this.vy;
      this.vx += (Math.random() - 0.5) * 0.5;
      this.vy += (Math.random() - 0.5) * 0.5;
      this._normalizeVelocity();
    }

    if (positionChanged) {
      grid.update(this);
    }
  }
  
  checkEnemyCollisions(grid) {
    const nearbyEnemyIds = grid.getNearbyEntities(this);
    const collisions = [];
    const combinedRadiusBase = this.radius;
    
    for (const id of nearbyEnemyIds) {
      const otherEnemyContainer = grid.entities.get(id);
      if (!otherEnemyContainer || !otherEnemyContainer.entity) continue;
      const otherEnemy = otherEnemyContainer.entity;
      if (otherEnemy === this) continue;
      
      const dx = this.x - otherEnemy.x;
      const dy = this.y - otherEnemy.y;
      const distanceSq = dx * dx + dy * dy;
      const combinedRadius = combinedRadiusBase + otherEnemy.radius;
      
      if (distanceSq < combinedRadius * combinedRadius) {
        collisions.push(otherEnemy);
      }
    }
    return collisions;
  }
  
  serialize() {
    return {
      id: this.id,
      type: this.type,
      x: this.x,
      y: this.y,
      prevX: this.prevX,
      prevY: this.prevY,
      radius: this.radius
    };
  }
  
  addToGrid(grid) {
    grid.insert(this);
  }
  
  removeFromGrid(grid) {
    grid.remove(this.id);
  }
}

module.exports = { Enemy, MS_PER_GAME_TICK }; 