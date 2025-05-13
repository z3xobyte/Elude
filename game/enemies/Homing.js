const { Enemy } = require('./BaseEnemy');

class Homing extends Enemy {
  constructor(x, y, radius, speed, increment = 0.05, homeRange = 200) {
    super(x, y, radius, speed, 4);
    this.increment = increment;
    this.homeRangeSq = homeRange * homeRange;
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
    this.angle = Math.atan2(this.vy, this.vx);
    const closestPlayer = this.findClosestPlayer(game, map);
    if (closestPlayer) {
      const dX = closestPlayer.x - this.x;
      const dY = closestPlayer.y - this.y;
      this.targetAngle = Math.atan2(dY, dX);
    }
    
    const angleDiff = Math.atan2(Math.sin(this.targetAngle - this.angle), Math.cos(this.targetAngle - this.angle));
    const angleIncrement = this.increment * (time / (1000/60));
    
    if (Math.abs(angleDiff) >= 0.01) { 
      this.angle += Math.sign(angleDiff) * Math.min(Math.abs(angleDiff), angleIncrement);
    }
    
    this.vx = Math.cos(this.angle) * this.speed;
    this.vy = Math.sin(this.angle) * this.speed;
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
    return { ...baseData, homeRange: Math.sqrt(this.homeRangeSq), angle: this.angle, targetAngle: this.targetAngle };
  }
}

module.exports = { Homing }; 