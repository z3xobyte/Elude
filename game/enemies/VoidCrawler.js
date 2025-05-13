const { Enemy } = require('./BaseEnemy');

class VoidCrawler extends Enemy {
  constructor(x, y, radius, speed, increment = 0.05, homeRange = 200) {
    super(x, y, radius, speed, 5);
    this.increment = increment;
    this.homeRangeSq = homeRange * homeRange;
    
    this.normal_speed = speed;
    this.base_speed = this.normal_speed;
    this.prepare_speed = this.normal_speed / 4;
    this.lurch_speed = this.normal_speed;
    
    this.time_preparing = 0;
    this.time_lurching = 0;
    this.time_since_last_lurch = 0;
    
    this.time_to_lurch = 300;
    this.time_between_lurches = 0;
    this.time_to_prepare = 300;
    
    this.angle = Math.atan2(this.vy, this.vx);
    this.targetAngle = this.angle;
    this.lastUpdateTimeMs = Date.now();
  }
  
  update(map, grid, game) {
    const currentTimeMs = Date.now();
    const deltaTimeMs = currentTimeMs - this.lastUpdateTimeMs;
    this.lastUpdateTimeMs = currentTimeMs;
    this.behavior(deltaTimeMs, game, map);
    super.update(map, grid);
  }
  
  behavior(time, game, map) {
    if (this.time_preparing === 0) {
      if (this.time_lurching === 0) {
        if (this.time_since_last_lurch < this.time_between_lurches) {
          this.time_since_last_lurch += time;
        } else {
          this.time_since_last_lurch = 0;
          this.time_preparing += time;
          this.base_speed = this.prepare_speed;
        }
      } else {
        this.time_lurching += time;
        if (this.time_lurching >= this.time_to_lurch) {
          this.time_lurching = 0;
          this.base_speed = this.normal_speed;
        } else {
          this.base_speed = this.lurch_speed * (1 - Math.pow(this.time_lurching / this.time_to_lurch, 5));
        }
      }
    } else {
      this.time_preparing += time;
      if (this.time_preparing >= this.time_to_prepare) {
        this.time_preparing = 0;
        this.time_lurching += time;
        this.base_speed = this.lurch_speed;
      } else {
        this.base_speed = this.prepare_speed * (1 - (this.time_preparing / this.time_to_prepare));
      }
    }
    this.compute_speed();

    this.angle = Math.atan2(this.vy, this.vx);
    const closestPlayer = this.findClosestPlayer(game, map);
    if (closestPlayer) {
      const dX = closestPlayer.x - this.x;
      const dY = closestPlayer.y - this.y;
      this.targetAngle = Math.atan2(dY, dX);
    }

    const angleDiff = Math.atan2(Math.sin(this.targetAngle - this.angle), Math.cos(this.targetAngle - this.angle));
    const angleIncrementThisFrame = this.increment * (time / (1000/60));
    
    if (Math.abs(angleDiff) >= 0.01) {
      this.angle += Math.sign(angleDiff) * Math.min(Math.abs(angleDiff), angleIncrementThisFrame);
    }
    
    this.vx = Math.cos(this.angle) * this.speed; // this.speed should be current after compute_speed
    this.vy = Math.sin(this.angle) * this.speed;
  }
  
  compute_speed() {
    this.speed = Math.max(0, this.base_speed); 
  }
  
  findClosestPlayer(game, map) {
    if (!game || !game.players) return null;
    let closestPlayer = null;
    let minDistanceSq = this.homeRangeSq;
    
    for (const player of game.players.values()) {
      if (player.isDead || player.currentMapId !== game.currentMapId) continue;
      
      // Skip players in protected tiles (safe zones and teleporters)
      if (this.isPlayerInProtectedTile(player, game, map)) continue;
      
      const dx = player.x - this.x;
      const dy = player.y - this.y;
      const distanceSq = dx * dx + dy * dy;
      if (distanceSq < minDistanceSq) {
        minDistanceSq = distanceSq;
        closestPlayer = player;
      }
    }
    return closestPlayer;
  }
  
  // Helper function to check if a player is in a protected tile
  isPlayerInProtectedTile(player, game, map) {
    if (!player || !game) return true;
    
    const currentMap = map || game.mapManager.getMapById(player.currentMapId);
    if (!currentMap) return true;
    
    const tileX = Math.floor(player.x / currentMap.tileSize);
    const tileY = Math.floor(player.y / currentMap.tileSize);
    
    const tileType = currentMap.getTileType(tileX, tileY);
    return tileType === 2 || tileType === 3 || tileType === 4;
  }
  
  serialize() {
    const baseData = super.serialize();
    return { ...baseData, time_preparing: this.time_preparing, time_lurching: this.time_lurching, time_since_last_lurch: this.time_since_last_lurch, angle: this.angle, targetAngle: this.targetAngle };
  }
}

module.exports = { VoidCrawler };