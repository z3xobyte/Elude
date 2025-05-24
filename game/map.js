const fs = require('fs');
const path = require('path');
const { Map } = require('./mapLogic');
const BinaryMapEncoder = require('./maps/BinaryMapEncoder');

class MapManager {
  constructor() {
    this.maps = {};
    this.currentMapId = 'map1';
    this.useBinaryMaps = true;
    this.loadMaps();
  }

  loadMaps() {
    const mapsDir = path.join(__dirname, 'maps');
    let files;
    try {
      files = fs.readdirSync(mapsDir);
    } catch (error) {
      console.error(`Error reading maps directory ${mapsDir}:`, error);
      return;
    }

    const discoveredMapIds = new Set();
    files.forEach(file => {
      if (file.endsWith('.json') || file.endsWith('.bmap')) {
        discoveredMapIds.add(path.parse(file).name);
      }
    });

    discoveredMapIds.forEach(mapId => {
      const binaryMapPath = path.join(mapsDir, `${mapId}.bmap`);
      const jsonMapPath = path.join(mapsDir, `${mapId}.json`);
      
      let mapData;
      let loadedFromBinary = false;
      let loadedFromJson = false;

      try {
        if (this.useBinaryMaps && fs.existsSync(binaryMapPath)) {
          console.log(`Loading binary map from: ${binaryMapPath}`);
          const startTime = Date.now();
          
          mapData = BinaryMapEncoder.loadBinaryMap(binaryMapPath);
          mapData.mapId = mapId; // Ensure mapId is set
          
          this.maps[mapId] = new Map(mapData); // Map is GameMap from mapLogic.js
          
          const loadTime = Date.now() - startTime;
          console.log(`Binary map ${mapId} loaded successfully in ${loadTime}ms`);
          loadedFromBinary = true;
        } 
        else if (fs.existsSync(jsonMapPath)) {
          console.log(`Loading JSON map from: ${jsonMapPath}`);
          const startTime = Date.now();
          
          const fileContent = fs.readFileSync(jsonMapPath, 'utf8');
          mapData = JSON.parse(fileContent);
          mapData.mapId = mapId; // Ensure mapId is set
          
          this.maps[mapId] = new Map(mapData); // Map is GameMap from mapLogic.js
          
          const loadTime = Date.now() - startTime;
          console.log(`JSON map ${mapId} loaded successfully in ${loadTime}ms`);
          loadedFromJson = true;
          
          if (this.useBinaryMaps && mapData) { // mapData will be populated if JSON loading was successful
            try {
              const binarySize = BinaryMapEncoder.saveBinaryMap(mapData, binaryMapPath);
              console.log(`Converted ${mapId} to binary format (${binarySize} bytes)`);
            } catch (conversionError) {
              console.error(`Error converting map ${mapId} to binary:`, conversionError);
            }
          }
        } else {
          console.warn(`No map file found for mapId: ${mapId} (looked for .bmap and .json)`);
          return; // Skip this mapId if no file is found
        }

        // Common logic for teleporter links after map is loaded
        if (this.maps[mapId] && mapData && mapData.teleporterLinks && mapData.teleporterLinks.length > 0) {
          console.log(`Map ${mapId} has ${mapData.teleporterLinks.length} teleporter links`);
          if (this.maps[mapId].teleporterManager && typeof this.maps[mapId].teleporterManager.setTeleporterLinks === 'function') {
            this.maps[mapId].teleporterManager.setTeleporterLinks(mapData.teleporterLinks);
          }
        }

      } catch (error) {
        console.error(`Error loading map ${mapId}:`, error);
      }
    });
  }
  
  getCurrentMap() {
    return this.maps[this.currentMapId];
  }

  getMapById(mapId) {
    return this.maps[mapId] || null;
  }
  
  changeMap(mapId) {
    if (this.maps[mapId]) {
      this.currentMapId = mapId;
      return true;
    }
    return false;
  }
  
  convertAllMapsToBinary() {
    const sourceDir = path.join(__dirname, 'maps');
    const conversionResults = BinaryMapEncoder.convertJsonMapsToBinary(sourceDir, sourceDir);
    console.log('Map conversion results:', conversionResults);
    return conversionResults;
  }
}

module.exports = { 
  MapManager 
}; 