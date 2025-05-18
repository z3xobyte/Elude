export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.events = {};
    this.mouseX = 0;
    this.mouseY = 0;
    this.updateInterval = null;
    this.isMovementEnabled = false;
    this.lastEmittedX = 0;
    this.lastEmittedY = 0;
    
    this.dirX = 0;
    this.dirY = 0;
    this.dist = 0;
    this.mouse_angle = 0;
    this.input_angle = 0;
    this.mouseActive = false;
    this.moving = false;
    this.distance_movement = 1;
    this.mouse_distance = 0;
    this.mouse_distance_full_strength = 150;
    this.keys = {};
    
    this.friction = 0.25;
    this.slide_x = 0;
    this.slide_y = 0;
    this.abs_d_x = 0;
    this.abs_d_y = 0;
    this.d_x = 0;
    this.d_y = 0;
    this.distance_moved_previously = [0, 0];
    this.previousPos = { x: 0, y: 0 };
    this.oldPos = { x: 0, y: 0 };
    this.slippery = false;

    this._eventHandlers = {
      mousemove: e => this.handleMouseMove(e),
      click: () => this.handleClick(),
      keydown: e => this.handleKeyDown(e),
      keyup: e => this.handleKeyUp(e)
    };
    
    this.setupEventListeners();
    this.startContinuousUpdates();
  }
  
  setupEventListeners() {
    this.canvas.addEventListener('mousemove', this._eventHandlers.mousemove);
    this.canvas.addEventListener('click', this._eventHandlers.click);
    document.addEventListener('keydown', this._eventHandlers.keydown);
    document.addEventListener('keyup', this._eventHandlers.keyup);
  }
  
  cleanup() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }

    this.canvas.removeEventListener('mousemove', this._eventHandlers.mousemove);
    this.canvas.removeEventListener('click', this._eventHandlers.click);
    document.removeEventListener('keydown', this._eventHandlers.keydown);
    document.removeEventListener('keyup', this._eventHandlers.keyup);

    this.events = {};
  }
  
  handleMouseMove(e) {
    const rect = this.canvas.getBoundingClientRect();
    this.mouseX = e.clientX - rect.left;
    this.mouseY = e.clientY - rect.top;
    
    if (this.isMovementEnabled) {
      this.handleMouseMovement();
    }
  }
  
  handleClick() {
    this.isMovementEnabled = !this.isMovementEnabled;
    
    this.emit('movementtoggled', this.isMovementEnabled);
    
    if (this.isMovementEnabled) {
      this.handleMouseMovement();
    } else {
      this.emitMouseMove(this.lastEmittedX, this.lastEmittedY);
    }
  }
  
  handleKeyDown(e) {
    if (e.keyCode === 13) {
      return;
    }
    this.keys[e.keyCode] = true;
    this.handleKeyboardMovement();
  }
  
  handleKeyUp(e) {
    if (e.keyCode === 13) {
      return;
    }
    this.keys[e.keyCode] = false;
    this.handleKeyboardMovement();
  }

  handleMouseMovement() {
    const centerX = this.canvas.width / 2;
    const centerY = this.canvas.height / 2;
  
    const rawDirX = this.mouseX - centerX;
    const rawDirY = this.mouseY - centerY;
  
    const dist = Math.sqrt(rawDirX * rawDirX + rawDirY * rawDirY);
    const clampedDist = Math.min(this.mouse_distance_full_strength, dist);
  
    let normX = 0, normY = 0;
    if (dist !== 0) {
      normX = rawDirX / dist;
      normY = rawDirY / dist;
    }
  
    const scaledX = normX * clampedDist;
    const scaledY = normY * clampedDist;
  
    this.dirX = scaledX;
    this.dirY = scaledY;
    this.dist = dist;
  
    this.mouse_angle = Math.atan2(rawDirY, rawDirX);
    this.input_angle = this.mouse_angle;
    this.mouse_distance = clampedDist;
    this.distance_movement = clampedDist / this.mouse_distance_full_strength;
    this.mouseActive = true;
  
    this.emitMouseMove(this.mouseX, this.mouseY);
    this.emit('movement', {
      dirX: this.dirX,
      dirY: this.dirY,
      angle: this.mouse_angle,
      distance: this.distance_movement,
      mouseActive: this.mouseActive,
      d_x: this.d_x,
      d_y: this.d_y
    });
  }
  

  handleKeyboardMovement() {
    const KEYS = {
      W: 87,
      A: 65,
      S: 83,
      D: 68,
      UP: 38,
      DOWN: 40,
      LEFT: 37,
      RIGHT: 39
    };
    
    this.dirX = 0;
    this.dirY = 0;
    this.moving = false;
    
    if (this.isMovementKeyPressed()) {
      this.moving = true;
      this.mouseActive = false;
      
      this.dirY = (this.keys[KEYS.S] || this.keys[KEYS.DOWN]) ? 1 : 
                  (this.keys[KEYS.W] || this.keys[KEYS.UP]) ? -1 : 0;
      this.dirX = (this.keys[KEYS.D] || this.keys[KEYS.RIGHT]) ? 1 : 
                  (this.keys[KEYS.A] || this.keys[KEYS.LEFT]) ? -1 : 0;
      
      if (this.dirX !== 0 || this.dirY !== 0) {
        this.input_angle = Math.atan2(this.dirY, this.dirX);
      }
      
      this.distance_movement = 1;
      
      this.emit('movement', {
        dirX: this.dirX,
        dirY: this.dirY,
        angle: this.input_angle,
        distance: this.distance_movement,
        mouseActive: false,
        d_x: this.d_x,
        d_y: this.d_y
      });
    }
  }

  isMovementKeyPressed() {
    const KEYS = {
      W: 87,
      A: 65,
      S: 83,
      D: 68,
      UP: 38,
      DOWN: 40,
      LEFT: 37,
      RIGHT: 39
    };
    
    return this.keys[KEYS.W] || this.keys[KEYS.A] || this.keys[KEYS.S] || this.keys[KEYS.D] ||
           this.keys[KEYS.UP] || this.keys[KEYS.DOWN] || this.keys[KEYS.LEFT] || this.keys[KEYS.RIGHT];
  }
  
  startContinuousUpdates() {
    this.updateInterval = setInterval(() => {
      if (this.isMovementEnabled) {
        this.update(16);
        
        if (this.mouseActive) {
          this.handleMouseMovement();
        } else if (this.moving) {
          this.handleKeyboardMovement();
        }
      }
    }, 16);
  }
  
  update(time) {
    const timeFix = time / (1000 / 60);
    
    this.oldPos = (this.previousPos.x === this.mouseX && this.previousPos.y === this.mouseY) 
      ? this.oldPos 
      : { x: this.previousPos.x, y: this.previousPos.y };
    
    this.previousPos = { x: this.mouseX, y: this.mouseY };
    
    if (!this.slippery) {
      const frictionTimeFix = time / (1000 / 60);
      const friction_factor = 1 - (this.friction * frictionTimeFix);
      
      this.slide_x = this.distance_moved_previously[0];
      this.slide_y = this.distance_moved_previously[1];
      
      this.slide_x *= friction_factor;
      this.slide_y *= friction_factor;
      
      if (this.mouseActive) {
        this.d_x = this.distance_movement * Math.cos(this.mouse_angle) * frictionTimeFix;
        this.d_y = this.distance_movement * Math.sin(this.mouse_angle) * frictionTimeFix;
      } else if (this.moving) {
        this.d_x = this.distance_movement * this.dirX * frictionTimeFix;
        this.d_y = this.distance_movement * this.dirY * frictionTimeFix;
      }
      
      if (this.d_x !== 0 && this.d_y !== 0) {
        const length = Math.sqrt(this.d_x * this.d_x + this.d_y * this.d_y);
        this.d_x = (this.d_x / length);
        this.d_y = (this.d_y / length);
      }
      
      this.d_x += this.slide_x;
      this.d_y += this.slide_y;
      
      this.abs_d_x = Math.abs(this.d_x);
      this.abs_d_y = Math.abs(this.d_y);
      
      if (this.abs_d_x < 0.001) {
        this.d_x = 0;
      }
      if (this.abs_d_y < 0.001) {
        this.d_y = 0;
      }
      
      this.distance_moved_previously = [this.d_x, this.d_y];
    }
    
    this.emit('movementUpdate', {
      d_x: this.d_x,
      d_y: this.d_y,
      angle: this.mouseActive ? this.mouse_angle : this.input_angle,
      slippery: this.slippery
    });
  }
  
  emitMouseMove(x, y) {
    this.lastEmittedX = x;
    this.lastEmittedY = y;
    this.emit('mousemove', x, y);
  }
  
  on(event, callback) {
    if (!this.events[event]) {
      this.events[event] = [];
    }
    
    this.events[event].push(callback);

    return () => {
      if (this.events[event]) {
        this.events[event] = this.events[event].filter(cb => cb !== callback);
      }
    };
  }
  
  emit(event, ...args) {
    const callbacks = this.events[event];
    if (callbacks) {
      callbacks.forEach(callback => callback(...args));
    }
  }
  
  setFriction(friction) {
    this.friction = friction;
  }
  
  setSlippery(isSlippery) {
    this.slippery = isSlippery;
  }
  
  disableMovement() {
    this.isMovementEnabled = false;
    this.emit('movementtoggled', this.isMovementEnabled);
  }
  
  enableMovement() {
    this.isMovementEnabled = true;
    this.emit('movementtoggled', this.isMovementEnabled);
  }
} 