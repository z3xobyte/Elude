const { v4: uuidv4 } = require('uuid');
const { MS_PER_GAME_TICK } = require('./BaseEnemy');

class Bullet {
  constructor(x, y, targetX, targetY, radius, speed) {
    this.id = `bullet_${uuidv4()}`;
    this.x = x;
    this.y = y;
    this.prevX = x;
    this.prevY = y;
    this.radius = radius;
    this.speed = speed;
    this.color = '#FFFF00';
    this.outlineColor = '#FF8C00';

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
  
  update(map, grid) {
    if (!this.isActive) return;
    
    const currentTime = Date.now();
    const deltaTimeFactor = (currentTime - this.lastUpdateTime) / MS_PER_GAME_TICK;
    this.lastUpdateTime = currentTime;
    
    this.prevX = this.x;
    this.prevY = this.y;
    
    const newX = this.x + this.vx * deltaTimeFactor;
    const newY = this.y + this.vy * deltaTimeFactor;
    
    this._collisionShape.x = newX;
    this._collisionShape.y = newY;

    if (grid.checkWallCollision(this._collisionShape) || 
        grid.checkSafeZoneCollision(this._collisionShape) ||
        grid.checkTeleporterCollision(this._collisionShape) ||
        newX - this.radius < 0 || 
        newX + this.radius > map.width * map.tileSize || 
        newY - this.radius < 0 || 
        newY + this.radius > map.height * map.tileSize) {
      this.isActive = false;
      return;
    }
    
    this.x = newX;
    this.y = newY;
    grid.update(this);
  }
  
  serialize() {
    return {
      id: this.id,
      x: this.x,
      y: this.y,
      prevX: this.prevX,
      prevY: this.prevY,
      radius: this.radius,
      isActive: this.isActive
    };
  }
  
  addToGrid(grid) {
    grid.insert(this);
  }
  
  removeFromGrid(grid) {
    grid.remove(this.id);
  }
}

module.exports = { Bullet }; 