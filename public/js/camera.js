export class Camera {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.x = 0;
    this.y = 0;
    this.zoomFactor = 1;
  }
  
  resize(width, height) {
    this.width = width;
    this.height = height;
  }
  
  update(targetX, targetY) {
    this.x = targetX - this.width / 2;
    this.y = targetY - this.height / 2;
  }
  
  worldToScreen(worldX, worldY) {
    const screenX = (worldX - this.x) * this.zoomFactor;
    const screenY = (worldY - this.y) * this.zoomFactor;
    
    return {
      x: screenX,
      y: screenY
    };
  }
  
  screenToWorld(screenX, screenY) {
    return {
      x: (screenX / this.zoomFactor) + this.x,
      y: (screenY / this.zoomFactor) + this.y
    };
  }
} 