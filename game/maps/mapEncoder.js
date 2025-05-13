
class MapEncoder {

  static decodeMap(encoded, width, height) {
    const map = [];
    let rowIndex = 0;
    let colIndex = 0;
    
    for (let i = 0; i < encoded.length; i += 2) {
      const value = encoded[i];
      const count = encoded[i + 1];
      
      if (!map[rowIndex]) {
        map[rowIndex] = [];
      }
      
      for (let j = 0; j < count; j++) {
        map[rowIndex][colIndex] = value;
        colIndex++;
        
        if (colIndex >= width) {
          colIndex = 0;
          rowIndex++;
          if (rowIndex < height && !map[rowIndex]) {
            map[rowIndex] = [];
          }
        }
      }
    }
    
    return map;
  }

  static encodeMap(map) {
    const encoded = [];
    let currentValue = null;
    let currentCount = 0;

    const flat = [];
    for (let y = 0; y < map.length; y++) {
      for (let x = 0; x < map[y].length; x++) {
        flat.push(map[y][x]);
      }
    }

    for (let i = 0; i < flat.length; i++) {
      const value = flat[i];
      
      if (value === currentValue) {
        currentCount++;
      } else {
        if (currentValue !== null) {
          encoded.push(currentValue, currentCount);
        }
        currentValue = value;
        currentCount = 1;
      }
    }

    if (currentValue !== null) {
      encoded.push(currentValue, currentCount);
    }
    
    return encoded;
  }
}

module.exports = MapEncoder; 