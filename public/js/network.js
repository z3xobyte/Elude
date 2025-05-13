import { CompressionUtils } from './compression-utils.js';
import pako from 'pako';

export class Network {
  constructor() {
    this.socket = null;
    this.events = {};
    this.lastSentMousePos = { x: 0, y: 0 };
    this.movementThrottle = 16;
    this.lastMovementTime = 0;
    this.ping = 0;
    this.pingInterval = null;
    this.pingHistory = [];
    this.pingHistoryMaxSize = 5; // Keep last 5 pings for averaging
    
    this.playerIdMap = new Map();
    this.enemyIdMap = new Map();
    this.bulletIdMap = new Map();
    
    this._ownPlayerId = null;
    this._idMapNeedsUpdate = false;
    this._pendingMapData = null;

    this.textEncoder = new TextEncoder();
    this.reconnectAttempts = 0;
    this.maxReconnectDelay = 30000;
    this.baseReconnectDelay = 1000;
    this.minSendDistanceSq = 1; 

    this._socketEventHandlers = {
      open: this._handleOpen.bind(this),
      close: this._handleClose.bind(this),
      error: this._handleError.bind(this),
      message: this._handleMessage.bind(this)
    };
    
    this.connect();
  }
  
  connect() {
    if (this.socket && this.socket.readyState !== WebSocket.CLOSED && this.socket.readyState !== WebSocket.CLOSING) {
      return;
    }
    
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    try {
        this.socket = new WebSocket(`${protocol}//${host}`);
    } catch (e) {
        console.error("Failed to create WebSocket:", e);
        this._handleClose(); 
        return;
    }
    this.socket.binaryType = 'arraybuffer';
 
    this.socket.onopen = this._socketEventHandlers.open;
    this.socket.onclose = this._socketEventHandlers.close;
    this.socket.onerror = this._socketEventHandlers.error;
    this.socket.onmessage = this._socketEventHandlers.message;
  }
  
  disconnect() {
    this.clearPingInterval();

    if (this.socket) {
      this.socket.onopen = null;
      this.socket.onclose = null;
      this.socket.onerror = null;
      this.socket.onmessage = null;
      
      if (this.socket.readyState === WebSocket.OPEN || 
          this.socket.readyState === WebSocket.CONNECTING) {
        this.socket.close();
      }
      this.socket = null;
    }

    this.playerIdMap.clear();
    this.enemyIdMap.clear();
    this.bulletIdMap.clear();
    this.events = {};
  }
  
  _handleOpen() {
    this.reconnectAttempts = 0;
    this.startPingInterval();
    if (this._idMapNeedsUpdate || this.playerIdMap.size === 0) {
        this.send({ type: 'requestIdMap' });
    }
  }
  
  _handleClose() {
    this.clearPingInterval();
    if (this.socket) {
        this.socket.onopen = null;
        this.socket.onclose = null;
        this.socket.onerror = null;
        this.socket.onmessage = null;
        this.socket = null; 
    }

    const delay = Math.min(this.maxReconnectDelay, this.baseReconnectDelay * (2 ** this.reconnectAttempts));
    setTimeout(() => this.connect(), delay);
    this.reconnectAttempts++;
  }
  
  _handleError(error) {
    console.error('WebSocket error:', error);
  }
  
  async _handleMessage(event) {
    try {
      let message;
      
      if (event.data instanceof ArrayBuffer) {
        const compressedData = new Uint8Array(event.data);
        
        try {
          const decompressedData = pako.inflate(compressedData);
          const text = new TextDecoder().decode(decompressedData);
          
          try {
            const parsedData = JSON.parse(text);
            
            if (parsedData.tiles && parsedData.width && parsedData.height) {
              this._processBinaryMapData(parsedData);
              return;
            }
            
            // Otherwise treat as a regular message
            message = parsedData;
          } catch (parseError) {
            const gzipData = await CompressionUtils.decompressGzip(compressedData);
            const gzipText = new TextDecoder().decode(gzipData);
            message = JSON.parse(gzipText);
          }
        } catch (inflateError) {
          const gzipData = await CompressionUtils.decompressGzip(compressedData);
          const text = new TextDecoder().decode(gzipData);
          message = JSON.parse(text);
        }
      } else if (typeof event.data === 'string') {
        message = JSON.parse(event.data);
      } else {
        return;
      }
      
      this.handleMessage(message);
    } catch (e) {
      console.error('Failed to parse or handle message:', e, event.data);
    }
  }
  
  _processBinaryMapData(mapData) {
    try {
      const width = mapData.width;
      const height = mapData.height;
      const tiles = mapData.tiles;
      
      if (tiles && Array.isArray(tiles) && width && height) {
        const map = [];
        for (let y = 0; y < height; y++) {
          map[y] = [];
          for (let x = 0; x < width; x++) {
            map[y][x] = tiles[y * width + x];
          }
        }
        
        this._pendingMapData = {
          map,
          width,
          height,
          tileSize: mapData.tileSize,
          teleporterCodes: mapData.teleporterCodes,
          teleporterLinks: mapData.teleporterLinks,
          enemyConfig: mapData.enemyConfig
        };
        
        console.log(`Received and processed binary map data: ${width}x${height}, ready for map change`);
      }
    } catch (e) {
      console.error('Failed to process binary map data:', e);
    }
  }
  
  handleMessage(message) {
    if (!message || (typeof message.type !== 'string' && typeof message.t !== 'string')) {
        return;
    }

    const messageType = message.type || message.t;

    switch (messageType) {
      case 'init':
        this._ownPlayerId = message.id;
        this._idMapNeedsUpdate = true;
        this.playerIdMap.clear();
        this.enemyIdMap.clear();
        this.bulletIdMap.clear();
        this.emit('init', message);
        break;
      
      case 'mapChange':
        this._idMapNeedsUpdate = true;
        this.playerIdMap.clear();
        this.enemyIdMap.clear();
        this.bulletIdMap.clear();
            
        if (this._pendingMapData) {
          message.map = this._pendingMapData.map;
          message.mapWidth = this._pendingMapData.width;
          message.mapHeight = this._pendingMapData.height;
          message.tileSize = this._pendingMapData.tileSize;
          message.teleporterCodes = this._pendingMapData.teleporterCodes;
          message.teleporterLinks = this._pendingMapData.teleporterLinks;
          
          console.log(`Using pending map data: ${message.mapWidth}x${message.mapHeight}`);
          this._pendingMapData = null;
        }
        
        this.emit('mapChange', message);
        break;
      
      case 'u':
        if (message.idMap) {
          if (message.idMap.p) for (const [s, f] of Object.entries(message.idMap.p)) this.playerIdMap.set(parseInt(s), f);
          if (message.idMap.e) for (const [s, f] of Object.entries(message.idMap.e)) this.enemyIdMap.set(parseInt(s), f);
          if (message.idMap.b) for (const [s, f] of Object.entries(message.idMap.b)) this.bulletIdMap.set(parseInt(s), f);
          this._idMapNeedsUpdate = false;
        } else if (this._idMapNeedsUpdate) {
          this.send({ type: 'requestIdMap' });
        }
  
        const uListeners = this.events['u'];
        const updateListeners = this.events['update'];
  
        if ((uListeners && uListeners.length > 0) || (updateListeners && updateListeners.length > 0)) {
          const expandedMsg = {
            type: 'update',
            players: message.p ? message.p.map(p_arr => ({
              id: this.playerIdMap.get(p_arr[0]) || p_arr[0].toString(),
              x: p_arr[1],
              y: p_arr[2],
              isDead: p_arr[3] === 1,
              name: p_arr[4] // Assuming name is the 5th element (index 4)
            })) : [],
            enemies: message.e ? message.e.map(e_arr => ({
              id: this.enemyIdMap.get(e_arr[0]) || e_arr[0].toString(),
              type: e_arr[1],
              x: e_arr[2],
              y: e_arr[3],
              radius: e_arr[4]
            })) : [],
            bullets: message.b ? message.b.map(b_arr => ({
              id: this.bulletIdMap.get(b_arr[0]) || b_arr[0].toString(),
              x: b_arr[1],
              y: b_arr[2],
              radius: b_arr[3]
            })) : []
          };
          if (uListeners && uListeners.length > 0) this.emit('u', expandedMsg);
          if (updateListeners && updateListeners.length > 0) this.emit('update', expandedMsg);
        }
        break;
      
      case 'm':
        if (message.x !== undefined && message.y !== undefined && this.events['mousemove'] && this.events['mousemove'].length > 0) {
          this.emit('mousemove', { type: 'mousemove', x: message.x, y: message.y });
        }
        break;
      
      case 'pong':
        const currentPing = Date.now() - message.clientTime;
        
        // Add to ping history
        this.pingHistory.push(currentPing);
        
        // Keep history at max size
        if (this.pingHistory.length > this.pingHistoryMaxSize) {
          this.pingHistory.shift();
        }
        
        // Calculate average ping
        if (this.pingHistory.length > 0) {
          const sum = this.pingHistory.reduce((a, b) => a + b, 0);
          this.ping = sum / this.pingHistory.length;
        } else {
          this.ping = currentPing;
        }
        
        this.updatePingDisplay();
        break;
      
      case 'chat':
        this.emit('chat', message);
        break;
      
      default:
        if (this.events[messageType] && this.events[messageType].length > 0) {
          this.emit(messageType, message);
        }
        break;
    }
  }
  
  startPingInterval() {
    this.clearPingInterval();
    this.pingHistory = []; // Reset ping history when starting new interval
    // Send ping more frequently for better accuracy
    this.pingInterval = setInterval(() => this.sendPing(), 1000);
    // Send initial ping immediately
    this.sendPing();
  }
  
  clearPingInterval() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }
  
  sendPing() {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.send({
        type: 'ping',
        time: Date.now()
      });
    }
  }
  
  updatePingDisplay() {
    const pingDisplay = document.getElementById('ping');
    if (pingDisplay) {
      // Round to integer for cleaner display
      const displayPing = Math.round(this.ping);
      pingDisplay.textContent = `Ping: ${displayPing} ms`;
      
      // Add color based on ping value
      if (displayPing < 50) {
        pingDisplay.style.color = '#00FF00'; // Good ping - green
      } else if (displayPing < 100) {
        pingDisplay.style.color = '#FFFF00'; // Moderate ping - yellow
      } else if (displayPing < 200) {
        pingDisplay.style.color = '#FFA500'; // Poor ping - orange
      } else {
        pingDisplay.style.color = '#FF0000'; // Bad ping - red
      }
    }
  }
  
  sendMouseMove(x, y) {
    const now = Date.now();
    const dx = x - this.lastSentMousePos.x;
    const dy = y - this.lastSentMousePos.y;
    
    if (now - this.lastMovementTime > this.movementThrottle || (dx * dx + dy * dy) > this.minSendDistanceSq) { 
      const buffer = new ArrayBuffer(9); 
      const view = new DataView(buffer);
      view.setUint8(0, 1); 
      view.setInt32(1, Math.round(x), true);
      view.setInt32(5, Math.round(y), true);
      
      if (this.socket && this.socket.readyState === WebSocket.OPEN) {
        this.socket.send(buffer);
        this.lastSentMousePos.x = x;
        this.lastSentMousePos.y = y;
        this.lastMovementTime = now;
      }
    }
  }
  
  sendChatMessage(message) {
    this.send({
      type: 'chat',
      message: message
    });
  }
  
  send(data) {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      const jsonStr = JSON.stringify(data);
      
      if (jsonStr.length > 80) {
        try {
          const uint8Array = this.textEncoder.encode(jsonStr);
          const compressed = pako.deflate(uint8Array);
          this.socket.send(compressed.buffer);
        } catch (e) {
          this.socket.send(jsonStr);
        }
      } else {
        this.socket.send(jsonStr);
      }
    }
  }
  
  on(event, callback) {
    if (typeof callback !== 'function') {
        return;
    }
    if (!this.events[event]) {
      this.events[event] = [];
    }
    this.events[event].push(callback);
  }
  
  emit(event, data) {
    const callbacks = this.events[event];
    if (callbacks && callbacks.length > 0) {
      for (let i = 0; i < callbacks.length; i++) {
        try {
            callbacks[i](data);
        } catch (e) {
            console.error('Error in event callback:', event, e);
        }
      }
    }
  }
}