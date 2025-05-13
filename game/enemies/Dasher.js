const { Enemy, MS_PER_GAME_TICK } = require('./BaseEnemy');

class Dasher extends Enemy {
  constructor(x, y, radius, speed, timeToPrepare = 750, timeToDash = 3000, timeBetweenDashes = 750) {
    super(x, y, radius, speed, 3);
    this.speed = speed; 
    this.time_to_prepare = timeToPrepare;
    this.time_to_dash = timeToDash;
    this.time_between_dashes = timeBetweenDashes;
    this.normal_speed = speed;
    this.base_speed = this.normal_speed / 5; 
    this.prepare_speed = this.normal_speed / 5;
    this.dash_speed = this.normal_speed;
    this.time_dashing = 0;
    this.time_preparing = 0;
    this.time_since_last_dash = 0;
    this.lastUpdateTimeMs = Date.now();

    this.originalVx = this.vx;
    this.originalVy = this.vy;
    this.originalSpeed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
    if (this.originalSpeed === 0 && this.speed > 0) { 
        const angle = Math.random() * Math.PI * 2;
        this.originalVx = Math.cos(angle) * this.speed;
        this.originalVy = Math.sin(angle) * this.speed;
        this.originalSpeed = this.speed;
    }

    this.hitWall = false;
  }
  
  compute_speed() {
    let newSpeed = 0;
    
    if (this.time_since_last_dash < this.time_between_dashes && 
        this.time_dashing === 0 && 
        this.time_preparing === 0) {
      newSpeed = 0;
    } else if (this.time_dashing === 0) {
      newSpeed = this.prepare_speed;
    } else {
      newSpeed = this.base_speed;
    }
    
    if (newSpeed !== this.speed) {
      this.speed = newSpeed;
      this.updateVelocity();
    }
  }
  
  updateVelocity() {
    if (this.speed === 0) {
      this.vx = 0;
      this.vy = 0;
      return;
    }
    
    if (this.originalSpeed > 0) {
      const dirX = this.originalVx / this.originalSpeed;
      const dirY = this.originalVy / this.originalSpeed;
      
      this.vx = dirX * this.speed;
      this.vy = dirY * this.speed;
    } else {
      const angle = Math.random() * Math.PI * 2;
      this.vx = Math.cos(angle) * this.speed;
      this.vy = Math.sin(angle) * this.speed;
      
      this.originalVx = this.vx;
      this.originalVy = this.vy;
      this.originalSpeed = this.speed;
    }
  }
  
  update(map, grid, game) {
    const currentTimeMs = Date.now();
    const deltaTimeMs = currentTimeMs - this.lastUpdateTimeMs;
    this.lastUpdateTimeMs = currentTimeMs;
    
    this.behavior(deltaTimeMs);
    
    const currentTimeForPhysics = Date.now();
    const deltaTimeFactor = (currentTimeForPhysics - this.lastUpdateTime) / MS_PER_GAME_TICK;
    this.lastUpdateTime = currentTimeForPhysics;
    
    this.prevX = this.x;
    this.prevY = this.y;
    
    let positionChanged = false;

    const newX = this.x + this.vx * deltaTimeFactor;
    const newY = this.y + this.vy * deltaTimeFactor;
    
    this._collisionShape.x = newX; this._collisionShape.y = this.y; this._collisionShape.radius = this.radius;
    if (grid.checkWallCollision(this._collisionShape) || grid.checkSafeZoneCollision(this._collisionShape) || grid.checkTeleporterCollision(this._collisionShape)) {
      this.vx = -this.vx; this.hitWall = true; positionChanged = false;
    } else { this.x = newX; positionChanged = true; }

    this._collisionShape.x = this.x; this._collisionShape.y = newY;
    if (grid.checkWallCollision(this._collisionShape) || grid.checkSafeZoneCollision(this._collisionShape) || grid.checkTeleporterCollision(this._collisionShape)) {
      this.vy = -this.vy; this.hitWall = true; positionChanged = false;
    } else { this.y = newY; positionChanged = true; }

    this._collisionShape.x = this.x; this._collisionShape.y = this.y;
    if (grid.checkWallCollision(this._collisionShape) || 
        grid.checkSafeZoneCollision(this._collisionShape) ||
        grid.checkTeleporterCollision(this._collisionShape) ||
        this.x - this.radius < 0 || this.x + this.radius > map.width * map.tileSize || 
        this.y - this.radius < 0 || this.y + this.radius > map.height * map.tileSize) {
      this.x = this.prevX; this.y = this.prevY; positionChanged = false;
      this.vx = -this.vx; this.vy = -this.vy; this.hitWall = true;
    }

    if (positionChanged) {
      grid.update(this);
    }
    
    if (this.hitWall) {
      this.originalVx = this.vx; this.originalVy = this.vy;
      this.originalSpeed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
      if (this.originalSpeed === 0 && this.speed > 0) {
          const angle = Math.random() * Math.PI * 2;
          this.originalVx = Math.cos(angle); 
          this.originalVy = Math.sin(angle);
          this.originalSpeed = 1;
      }
      this.hitWall = false;
      this.updateVelocity(); 
    }
  }
  
  behavior(time) {
    if (this.time_preparing === 0) {
      if (this.time_dashing === 0) {
        if (this.time_since_last_dash < this.time_between_dashes) {
          this.time_since_last_dash += time;
        } else {
          this.time_since_last_dash = 0;
          this.time_preparing += time;
          this.base_speed = this.prepare_speed;
        }
      } else {
        this.time_dashing += time;
        if (this.time_dashing > this.time_to_dash) {
          this.time_dashing = 0;
          this.base_speed = this.normal_speed;
        } else {
          this.base_speed = this.dash_speed * (1 - (this.time_dashing / this.time_to_dash));
        }
      }
    } else {
      this.time_preparing += time;
      if (this.time_preparing > this.time_to_prepare) {
        this.time_preparing = 0;
        this.time_dashing += time; 
        this.base_speed = this.dash_speed;
      } else {
        this.base_speed = this.prepare_speed * (1 - (this.time_preparing / this.time_to_prepare));
      }
    }
    this.compute_speed();
  }
  
  serialize() {
    const baseData = super.serialize();
    return { ...baseData, time_dashing: this.time_dashing, time_preparing: this.time_preparing, time_since_last_dash: this.time_since_last_dash };
  }
}

module.exports = { Dasher }; 