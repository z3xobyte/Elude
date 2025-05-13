const { Enemy } = require('./BaseEnemy');

class Wall extends Enemy {
  constructor(x, y, radius, speed, boundaryX, boundaryY, boundaryWidth, boundaryHeight, wallIndex, count, moveClockwise = true, initialSide = 0, spacing = null) {
    super(x, y, radius, speed, 6);
    this.speed = speed;
    
    this.boundary = {
      x: boundaryX,
      y: boundaryY,
      w: boundaryWidth,
      h: boundaryHeight
    };
    
    this.moveClockwise = !moveClockwise;
    this.wallIndex = wallIndex;
    this.direction = initialSide;
    
    const perimeter = 2 * (this.boundary.w + this.boundary.h);
    
    let distance;
    if (spacing) {
      distance = wallIndex * spacing;
    } else {
      distance = wallIndex * perimeter / count;
    }
    
    this.initialSide = initialSide;
    this.positionAlong(distance, radius);
    this.applySpeed();
  }
  
  top() {
    return this.boundary.y;
  }
  
  bottom() {
    return this.boundary.y + this.boundary.h;
  }
  
  right() {
    return this.boundary.x + this.boundary.w;
  }
  
  left() {
    return this.boundary.x;
  }
  
  rotate(direction, moveClockwise) {
    switch (direction) {
      case 0: // up
        return (moveClockwise) ? 3 : 1;
      case 2: // down
        return (moveClockwise) ? 1 : 3;
      case 1: // right
        return (moveClockwise) ? 0 : 2;
      case 3: // left
        return (moveClockwise) ? 2 : 0;
    }
  }
  
  getVector() {
    switch (this.direction) {
      case 0: // up
        this.vx = 0;
        this.vy = -this.speed;
        break;
      case 2: // down
        this.vx = 0;
        this.vy = this.speed;
        break;
      case 1: // right
        this.vx = this.speed;
        this.vy = 0;
        break;
      case 3: // left
        this.vx = -this.speed;
        this.vy = 0;
        break;
    }
  }
  
  applySpeed() {
    this.getVector();
  }
  
  positionAlong(distance, radius) {
    if (this.initialSide === 0) {
      this.x = (this.boundary.w / 2) + this.left();
      this.y = this.top() + radius;
    } else if (this.initialSide === 1) {
      this.x = this.right() - radius;
      this.y = (this.boundary.h / 2) + this.top();
    } else if (this.initialSide === 2) {
      this.x = (this.boundary.w / 2) + this.left();
      this.y = this.bottom() - radius;
    } else if (this.initialSide === 3) {
      this.x = this.left() + radius;
      this.y = (this.boundary.h / 2) + this.top();
    }
    
    this.direction = this.rotate(this.initialSide, this.moveClockwise);
    
    let antiCrash = 0;
    while (distance > 0) {
      if (antiCrash > 1000) {
        console.error("Anti-crash triggered in Wall enemy positioning");
        break;
      }
      antiCrash++;
      
      if (this.direction === 0) { // up
        this.y -= distance;
        if (this.y < this.top() + radius) {
          distance = (this.top() + radius) - this.y;
          this.y = this.top() + radius;
          this.direction = this.rotate(this.direction, this.moveClockwise);
        } else {
          break;
        }
      } else if (this.direction === 1) { // right
        this.x += distance;
        if (this.x > this.right() - radius) {
          distance = this.x - (this.right() - radius);
          this.x = this.right() - radius;
          this.direction = this.rotate(this.direction, this.moveClockwise);
        } else {
          break;
        }
      } else if (this.direction === 2) { // down
        this.y += distance;
        if (this.y > this.bottom() - radius) {
          distance = this.y - (this.bottom() - radius);
          this.y = this.bottom() - radius;
          this.direction = this.rotate(this.direction, this.moveClockwise);
        } else {
          break;
        }
      } else if (this.direction === 3) { // left
        this.x -= distance;
        if (this.x < this.left() + radius) {
          distance = (this.left() + radius) - this.x;
          this.x = this.left() + radius;
          this.direction = this.rotate(this.direction, this.moveClockwise);
        } else {
          break;
        }
      }
    }
  }
  
  update(map, grid, game) {
    this.prevX = this.x;
    this.prevY = this.y;
    
    const currentTime = Date.now();
    const deltaTime = (currentTime - this.lastUpdateTime) / 16.67;
    this.lastUpdateTime = currentTime;
    
    const newX = this.x + this.vx * deltaTime;
    const newY = this.y + this.vy * deltaTime;
    
    const radius = this.radius;
    
    if (this.direction === 0 && newY < this.top() + radius) {
      this.y = this.top() + radius;
      this.direction = this.rotate(this.direction, this.moveClockwise);
      this.applySpeed();
    } else if (this.direction === 1 && newX > this.right() - radius) {
      this.x = this.right() - radius;
      this.direction = this.rotate(this.direction, this.moveClockwise);
      this.applySpeed();
    } else if (this.direction === 2 && newY > this.bottom() - radius) {
      this.y = this.bottom() - radius;
      this.direction = this.rotate(this.direction, this.moveClockwise);
      this.applySpeed();
    } else if (this.direction === 3 && newX < this.left() + radius) {
      this.x = this.left() + radius;
      this.direction = this.rotate(this.direction, this.moveClockwise);
      this.applySpeed();
    } else {
      this.x = newX;
      this.y = newY;
    }

    grid.update(this);
  }
  
  serialize() {
    const baseData = super.serialize();
    return {
      ...baseData,
      direction: this.direction,
      moveClockwise: this.moveClockwise,
      boundary: this.boundary
    };
  }
}

module.exports = { Wall }; 