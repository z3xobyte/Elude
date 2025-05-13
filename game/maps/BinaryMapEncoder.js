const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

class BinaryMapEncoder {
  
  static encodeToBinary(mapData) {
    const headerBuffer = Buffer.alloc(16);
    headerBuffer.writeUInt32LE(mapData.width, 0);
    headerBuffer.writeUInt32LE(mapData.height, 4);
    headerBuffer.writeUInt32LE(mapData.tileSize, 8);
    headerBuffer.writeUInt32LE(0, 12);
    
    const tileBuffer = Buffer.alloc(mapData.width * mapData.height);
    
    if (Array.isArray(mapData.map)) {
      let index = 0;
      for (let y = 0; y < mapData.height; y++) {
        for (let x = 0; x < mapData.width; x++) {
          tileBuffer[index++] = mapData.map[y][x];
        }
      }
    } 
    else if (Array.isArray(mapData.encodedMap)) {
      let index = 0;
      let rowIndex = 0;
      let colIndex = 0;
      
      for (let i = 0; i < mapData.encodedMap.length; i += 2) {
        const value = mapData.encodedMap[i];
        const count = mapData.encodedMap[i + 1];
        
        for (let j = 0; j < count; j++) {
          tileBuffer[index++] = value;
        }
      }
    }
    
    let teleporterBuffer = Buffer.alloc(0);
    if (mapData.teleporterCodes && mapData.teleporterCodes.length > 0) {
      const teleporterCountBuffer = Buffer.alloc(4);
      teleporterCountBuffer.writeUInt32LE(mapData.teleporterCodes.length, 0);
      
      const teleporterDataBuffers = [];
      let totalTeleporterSize = 4;
      
      for (const teleporter of mapData.teleporterCodes) {
        const codeBuffer = Buffer.from(teleporter.code, 'utf8');
        const codeLength = Buffer.alloc(4);
        codeLength.writeUInt32LE(codeBuffer.length, 0);
        
        const mapIdBuffer = Buffer.from(teleporter.mapId || '', 'utf8');
        const mapIdLength = Buffer.alloc(4);
        mapIdLength.writeUInt32LE(mapIdBuffer.length, 0);
        
        teleporterDataBuffers.push(codeLength, codeBuffer, mapIdLength, mapIdBuffer);
        totalTeleporterSize += 8 + codeBuffer.length + mapIdBuffer.length;
      }
      
      teleporterBuffer = Buffer.concat([teleporterCountBuffer, ...teleporterDataBuffers], totalTeleporterSize);
    }
    
    const enemyConfigBuffer = Buffer.from(JSON.stringify(mapData.enemyConfig), 'utf8');
    const enemyConfigLength = Buffer.alloc(4);
    enemyConfigLength.writeUInt32LE(enemyConfigBuffer.length, 0);
    
    const finalBuffer = Buffer.concat([
      headerBuffer,
      tileBuffer,
      teleporterBuffer,
      enemyConfigLength,
      enemyConfigBuffer
    ]);
    
    return zlib.deflateSync(finalBuffer);
  }
  
  static decodeFromBinary(binaryData) {
    const decompressedData = zlib.inflateSync(binaryData);
    
    const width = decompressedData.readUInt32LE(0);
    const height = decompressedData.readUInt32LE(4);
    const tileSize = decompressedData.readUInt32LE(8);
    const flags = decompressedData.readUInt32LE(12);
    
    const tileDataOffset = 16;
    const tileDataSize = width * height;
    const tileData = decompressedData.slice(tileDataOffset, tileDataOffset + tileDataSize);
    
    const map = [];
    for (let y = 0; y < height; y++) {
      map[y] = [];
      for (let x = 0; x < width; x++) {
        map[y][x] = tileData[y * width + x];
      }
    }

    let teleporterOffset = tileDataOffset + tileDataSize;
    let teleporterCodes = [];
    
    if (teleporterOffset < decompressedData.length) {
      const teleporterCount = decompressedData.readUInt32LE(teleporterOffset);
      teleporterOffset += 4;
      
      for (let i = 0; i < teleporterCount; i++) {
        const codeLength = decompressedData.readUInt32LE(teleporterOffset);
        teleporterOffset += 4;
        
        const code = decompressedData.slice(teleporterOffset, teleporterOffset + codeLength).toString('utf8');
        teleporterOffset += codeLength;
        
        const mapIdLength = decompressedData.readUInt32LE(teleporterOffset);
        teleporterOffset += 4;
        
        const mapId = decompressedData.slice(teleporterOffset, teleporterOffset + mapIdLength).toString('utf8');
        teleporterOffset += mapIdLength;
        
        teleporterCodes.push({ code, mapId });
      }
    }
    
    let enemyConfig = {};
    if (teleporterOffset < decompressedData.length) {
      const enemyConfigLength = decompressedData.readUInt32LE(teleporterOffset);
      teleporterOffset += 4;
      
      if (enemyConfigLength > 0) {
        const enemyConfigJson = decompressedData.slice(teleporterOffset, teleporterOffset + enemyConfigLength).toString('utf8');
        try {
          enemyConfig = JSON.parse(enemyConfigJson);
        } catch (e) {
          console.error('Failed to parse enemy config:', e);
        }
      }
    }
    
    return {
      width,
      height,
      tileSize,
      map,
      teleporterCodes,
      enemyConfig
    };
  }
  
  static saveBinaryMap(mapData, filePath) {
    const binaryData = this.encodeToBinary(mapData);
    fs.writeFileSync(filePath, binaryData);
    return binaryData.length;
  }
  
  static loadBinaryMap(filePath) {
    const binaryData = fs.readFileSync(filePath);
    return this.decodeFromBinary(binaryData);
  }
  
  static convertJsonMapsToBinary(sourceDir, targetDir) {
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }
    
    const jsonFiles = fs.readdirSync(sourceDir)
      .filter(file => file.endsWith('.json'));
    
    const result = [];
    
    for (const jsonFile of jsonFiles) {
      const sourcePath = path.join(sourceDir, jsonFile);
      const targetPath = path.join(targetDir, jsonFile.replace('.json', '.bmap'));
      
      try {
        const jsonData = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
        const binarySize = this.saveBinaryMap(jsonData, targetPath);
        const jsonSize = fs.statSync(sourcePath).size;
        
        result.push({
          file: jsonFile,
          jsonSize,
          binarySize,
          compressionRatio: (jsonSize / binarySize).toFixed(2)
        });
      } catch (e) {
        console.error(`Failed to convert ${jsonFile}:`, e);
      }
    }
    
    return result;
  }
  
  static encodeForNetwork(mapData) {
    const networkMap = {
      width: mapData.width,
      height: mapData.height,
      tileSize: mapData.tileSize,
      tiles: this._flattenTileArray(mapData.map || (mapData.encodedMap ? 
        require('./mapEncoder').decodeMap(mapData.encodedMap, mapData.width, mapData.height) : 
        [])),
      teleporterCodes: mapData.teleporterCodes || [],
      enemyConfig: mapData.enemyConfig
    };
    
    console.log('Encoding network map with teleporters:', {
      hasTeleporterCodes: networkMap.teleporterCodes && networkMap.teleporterCodes.length > 0,
      teleporterCount: networkMap.teleporterCodes ? networkMap.teleporterCodes.length : 0
    });
    
    return zlib.deflateSync(JSON.stringify(networkMap));
  }
  
  static decodeFromNetwork(compressedData) {
    const networkMap = JSON.parse(zlib.inflateSync(compressedData).toString('utf8'));
    
    networkMap.map = this._expandTileArray(networkMap.tiles, networkMap.width, networkMap.height);
    delete networkMap.tiles;

    if (!networkMap.teleporterCodes) {
      console.warn('Missing teleporter codes in network map data');
      networkMap.teleporterCodes = [];
    }
    
    console.log('Decoded network map:', {
      width: networkMap.width,
      height: networkMap.height,
      hasTeleporterCodes: networkMap.teleporterCodes && networkMap.teleporterCodes.length > 0,
      teleporterCount: networkMap.teleporterCodes ? networkMap.teleporterCodes.length : 0
    });
    
    return networkMap;
  }
  
  static _flattenTileArray(tileArray) {
    if (!tileArray || !tileArray.length) return [];
    const flatArray = [];
    for (let y = 0; y < tileArray.length; y++) {
      for (let x = 0; x < tileArray[y].length; x++) {
        flatArray.push(tileArray[y][x]);
      }
    }
    return flatArray;
  }
  
  static _expandTileArray(flatArray, width, height) {
    const tileArray = [];
    for (let y = 0; y < height; y++) {
      tileArray[y] = [];
      for (let x = 0; x < width; x++) {
        tileArray[y][x] = flatArray[y * width + x];
      }
    }
    return tileArray;
  }
}

module.exports = BinaryMapEncoder; 