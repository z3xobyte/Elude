const getElementById = document.getElementById.bind(document);
const createElement = document.createElement.bind(document);
const { localStorage } = window;
const canvas = getElementById("canvas");
const ctx = canvas.getContext("2d");
const background = createElement("canvas");
const bg_ctx = background.getContext("2d");
const light_background = createElement("canvas");
const lbg_ctx = light_background.getContext("2d");
const tiles = getElementById("tiles");
tiles["a"] = tiles.appendChild.bind(tiles);
const tile_colors = ["#333333", "#ffffff", "#d3d3d3", "#ffff00", "#d3d3d3"];
const tile_desc = [
  "Wall",
  "Floor",
  "",
  "Teleport",
  "Safezone"
];
const postfix = " tiles";
const px2 = "2px";
const mt = "margin-top";
const mb = "margin-bottom";
const input = "input";
const nes = "nextElementSibling";
const pes = "previousElementSibling";
const van = "valueAsNumber";
const ih = "innerHTML";
let tile_type = 0;
let hs = [];
function set_selected() {
  for(let i = 0; i < hs.length; ++i) {
    hs[i].style["text-decoration"] = (i == tile_type) ? "underline" : "none";
  }
}
let old_w = 0;
let old_h = 0;
let u8 = new Uint8Array(0);
let width = 45;
let height = 12;
function gen_map() {
  let new_u8 = new Uint8Array(width * height);
  
  // Create a new map with floor tiles in the middle and wall tiles around the border
  for(let x = 0; x < width; ++x) {
    for(let y = 0; y < height; ++y) {
      // Border tiles are walls (0), inner tiles are floor (1)
      if(x === 0 || y === 0 || x === width - 1 || y === height - 1) {
        new_u8[x * height + y] = 0; // Wall
      } else {
        new_u8[x * height + y] = 1; // Floor
      }
    }
  }
  
  // Preserve spawns that are still within the map boundaries
  spawns = {};
  cached_vals = [];
  for(let i = 0; i < cached_vals.length; ++i) {
    if(cached_vals[i][0] < width && cached_vals[i][1] < height) {
      const x = cached_vals[i][0];
      const y = cached_vals[i][1];
      const id = `${x},${y}`;
      spawns[id] = [x, y];
      cached_vals[cached_vals.length] = [x, y];
    }
  }
  
  old_w = width;
  old_h = height;
  u8 = new_u8;
  paint_bg();
}
let c_width = 0;
let c_height = 0;
let dpr = 0;
let fov_min = 0.2;
let fov_max = 2;
let fov = fov_min;
let target_fov = 1;
const cell_size = 40;
const default_y = height * 0.5 * cell_size;
let x = 0;
let y = default_y;
let tile_pos_x = 0;
let tile_pos_y = 0;
let mouse = [0, 0];
let pressing = 0;
let counter_pressing = 0;
let move = {
  left: 0,
  right: 0,
  up: 0,
  down: 0
};
let v = [0, 0];
let tile_idx;
let bg_data = {
  fills: [],
  strokes: []
};
let spawn = 0;
/** @type {Object<string,!Array>} */
let spawns = {};
let resized = true;
let cached_vals = [];
let states = [];
let hidden = 0;
let c1 = function(){};
let c2 = function(){};

// New variables for map export functionality
let maps = [{
  id: "map1",
  width: 45,
  height: 12,
  tileSize: 40,
  enemyConfig: {
    spawnTileType: 1,
    types: {
      basic: {
        count: 10,
        radius: 15,
        minSpeed: 5,
        maxSpeed: 8,
      },
      sniper: {
        count: 0,
        radius: 15,
        minSpeed: 3,
        maxSpeed: 5,
        detectionRange: 500,
        shootingRange: 400,
        maxShootCooldown: 100,
        bulletRadius: 5,
        bulletSpeed: 5,
      },
      dasher: {
        count: 0,
        radius: 15,
        minSpeed: 5,
        maxSpeed: 8,
        timeToPrepare: 750,
        timeToDash: 3000,
        timeBetweenDashes: 750,
      },
      homing: {
        count: 0,
        radius: 15,
        minSpeed: 4,
        maxSpeed: 6,
        turnIncrement: 0.05,
        homeRange: 200,
      },
      void_crawler: {
        count: 0,
        radius: 15,
        minSpeed: 4,
        maxSpeed: 6,
        turnIncrement: 0.05,
        homeRange: 200,
      },
      wall: {
        count: 0,
        radius: 15,
        minSpeed: 3,
        maxSpeed: 5,
        moveClockwise: true,
        patternAlternate: false,
        initialSide: 0,
      },
    },
  },
  teleporterCodes: [],
  teleporterLinks: [],
  encodedMap: [],
  tiles: []
}];
let currentMapIndex = 0;

function get_move() {
  if(move.down - move.up == 0 && move.right - move.left == 0) {
    v = [lerp(v[0], 0, 0.1), lerp(v[1], 0, 0.1)];
  } else {
    const angle = Math.atan2(move.down - move.up, move.right - move.left);
    v = [lerp(v[0], Math.cos(angle) * 10 / fov, 0.1), lerp(v[1], Math.sin(angle) * 10 / fov, 0.1)];
  }
}
function save_state() {
  if(states.length > 16) {
    states.shift();
  }
  states[states.length] = {
    u8: new Uint8Array(u8),
    width,
    height,
    spawns: JSON.stringify(spawns)
  };
}
function restore_state() {
  if(states.length == 0) return;
  const state = states.pop();
  u8 = state.u8;
  width = state.width;
  height = state.height;
  old_w = width;
  old_h = height;
  c1();
  c2();
  spawns = /** @type {!Object<string,!Array>} */ (JSON.parse(state.spawns));
  cached_vals = Object.values(spawns);
  paint_bg();
  resized = 1;
}
function maybe_add_spawn_point() {
  if(!spawn) return;
  const id = `${tile_pos_x},${tile_pos_y}`;
  if(counter_pressing) {
    save_state();
    // Set the tile to type 2 (spawn)
    u8[tile_idx] = 2;
    paint_bg_explicit(tile_idx);
  }
}
function update_tile() {
  if(u8[tile_idx] == tile_type) return;
  save_state();
  u8[tile_idx] = tile_type;
  paint_bg_explicit(tile_idx);
}
function resize() {
  if(window.innerWidth != c_width || window.innerHeight != c_height || dpr != window.devicePixelRatio) {
    resized = true;
    dpr = window.devicePixelRatio;
    c_width = window.innerWidth;
    canvas.width = c_width * dpr;
    c_height = window.innerHeight;
    canvas.height = c_height * dpr;
  }
}
resize();
window.onresize = resize;
function lerp(num, to, by) {
  return num + (to - num) * by;
}
canvas.onwheel = function(x) {
  const add = -Math.sign(x.deltaY) * 0.05;
  if(target_fov > 1) {
    target_fov += add * 3;
  } else {
    target_fov += add;
  }
  target_fov = Math.min(Math.max(target_fov, fov_min), fov_max);
};
window.onmousemove = function(x) {
  mouse = [x.clientX * dpr, x.clientY * dpr];
  tile_idx = get_tile_idx();
  if(tile_idx != -1) {
    if(pressing && !spawn) {
      update_tile();
    }
    maybe_add_spawn_point();
  }
};
canvas.onmousedown = function(x) {
  if(x.button == 0) {
    pressing = 1;
    if(tile_idx != -1) {
      if(!spawn) {
        update_tile();
      }
      maybe_add_spawn_point();
    }
  } else if(x.button == 2) {
    counter_pressing = 1;
    maybe_add_spawn_point();
  }
};
canvas.onmouseup = function(x) {
  if(x.button == 0) {
    pressing = 0;
  } else if(x.button == 2) {
    counter_pressing = 0;
  }
};
window.onkeydown = function(x) {
  if(x.repeat) return;
  switch(x.keyCode) {
    case 81: { // Q key for spawn points
      spawn = 1;
      if(tile_idx != -1) {
        maybe_add_spawn_point();
      }
      break;
    }
    case 69: {
      hidden = 1;
      resized = 1;
      break;
    }
    case 38:
    case 87: {
      move.up = 1;
      break;
    }
    case 40:
    case 83: {
      move.down = 1;
      break;
    }
    case 37:
    case 65: {
      move.left = 1;
      break;
    }
    case 39:
    case 68: {
      move.right = 1;
      break;
    }
    case 90: {
      if(x.ctrlKey) {
        restore_state();
      }
      x.preventDefault();
      break;
    }
    default: break;
  }
};
window.onkeyup = function(x) {
  if(x.repeat) return;
  switch(x.keyCode) {
    case 81: { // Q key for spawn points
      spawn = 0;
      break;
    }
    case 38:
    case 87: {
      move.up = 0;
      break;
    }
    case 40:
    case 83: {
      move.down = 0;
      break;
    }
    case 37:
    case 65: {
      move.left = 0;
      break;
    }
    case 39:
    case 68: {
      move.right = 0;
      break;
    }
    default: break;
  }
};
window.onbeforeunload = function(e) {
  localStorage.setItem("cache", export_tiles());
};
canvas.oncontextmenu = function(e) {
  e.preventDefault();
  return false;
};

// New export functions that match map_editor.html functionality
function encodeMap() {
  // Create a 2D array in the format the game expects
  const mapTiles = [];
  for (let y = 0; y < height; y++) {
    mapTiles[y] = [];
    for (let x = 0; x < width; x++) {
      mapTiles[y][x] = u8[x * height + y];
    }
  }
  
  // Use the same encoding logic as in mapEncoder.js
  const encoded = [];
  let currentValue = null;
  let currentCount = 0;

  const flat = [];
  for (let y = 0; y < mapTiles.length; y++) {
    for (let x = 0; x < mapTiles[y].length; x++) {
      flat.push(mapTiles[y][x]);
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

function export_tiles() {
  // Get map ID from existing data or default to map1
  const mapId = maps[currentMapIndex].id || "map1";
  
  // Create a 2D array of tiles in the format the game expects [y][x]
  const mapTiles = [];
  for (let y = 0; y < height; y++) {
    mapTiles[y] = [];
    for (let x = 0; x < width; x++) {
      mapTiles[y][x] = u8[x * height + y];
    }
  }
  
  // Create the teleporter codes from spawn points
  const teleporterCodes = [];
  const teleporterLinks = [];
  
  for (const key in spawns) {
    if (spawns.hasOwnProperty(key)) {
      const [x, y] = spawns[key];
      if (u8[x * height + y] === 3) { // If it's a teleporter tile
        // Generate a unique code for this teleporter
        const teleporterCode = `teleporter_${mapId}_${x}_${y}`;
        
        // Add teleporter code entry
        teleporterCodes.push({
          code: teleporterCode,
          mapId: mapId,
          x: x,
          y: y
        });
        
        // Optional: Create teleporter links (you might need UI to connect teleporters properly)
        // This is a basic example - in a real editor you'd need UI to link teleporters
        // teleporterLinks.push({
        //   fromKey: `${currentMapIndex},${x},${y}`,
        //   toKey: "destination_map_index,x,y", 
        //   toMapIndex: 0, // Destination map index
        //   toX: 0,        // Destination X coordinate
        //   toY: 0         // Destination Y coordinate
        // });
      }
    }
  }
  
  // Create the map data structure that matches game format
  const mapData = {
    id: mapId,
    width: width,
    height: height,
    tileSize: cell_size,
    tiles: mapTiles,
    encodedMap: encodeMap(),
    teleporterCodes: teleporterCodes,
    teleporterLinks: teleporterLinks,
    enemyConfig: maps[currentMapIndex].enemyConfig || {
      spawnTileType: 1,
      types: {
        basic: {
          count: 10,
          radius: 15,
          minSpeed: 5,
          maxSpeed: 8
        },
        sniper: {
          count: 0,
          radius: 15,
          minSpeed: 3,
          maxSpeed: 5,
          detectionRange: 500,
          shootingRange: 400, 
          maxShootCooldown: 100,
          bulletRadius: 5,
          bulletSpeed: 5
        },
        dasher: {
          count: 0,
          radius: 15,
          minSpeed: 5,
          maxSpeed: 8,
          timeToPrepare: 750,
          timeToDash: 3000,
          timeBetweenDashes: 750
        },
        homing: {
          count: 0,
          radius: 15,
          minSpeed: 4,
          maxSpeed: 6,
          turnIncrement: 0.05,
          homeRange: 200
        },
        void_crawler: {
          count: 0, 
          radius: 15,
          minSpeed: 4,
          maxSpeed: 6,
          turnIncrement: 0.05,
          homeRange: 200
        },
        wall: {
          count: 0,
          radius: 15,
          minSpeed: 3,
          maxSpeed: 5,
          moveClockwise: true,
          patternAlternate: false,
          initialSide: 0
        }
      }
    }
  };
  
  // Update the current map data
  maps[currentMapIndex] = mapData;
  
  // Return JSON string properly formatted
  return JSON.stringify(mapData, null, 2);
}

function parse_tiles(config) {
  try {
    const mapData = JSON.parse(config);
    
    // Update dimensions
    width = mapData.width;
    height = mapData.height;
    old_w = width;
    old_h = height;
    
    // Reset states and spawns
    states = [];
    spawns = {};
    cached_vals = [];
    
    // Create new u8 array
    u8 = new Uint8Array(width * height);
    
    // Fill u8 from tiles data (matching the game's format where tiles[y][x])
    if (mapData.tiles && mapData.tiles.length) {
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          if (mapData.tiles[y] && typeof mapData.tiles[y][x] !== 'undefined') {
            u8[x * height + y] = mapData.tiles[y][x];
          }
        }
      }
    } else if (mapData.encodedMap && mapData.encodedMap.length) {
      // First decode to a 2D array using the same logic as mapEncoder.js
      const decoded = [];
      let rowIndex = 0;
      let colIndex = 0;
      
      for (let i = 0; i < mapData.encodedMap.length; i += 2) {
        const value = mapData.encodedMap[i];
        const count = mapData.encodedMap[i + 1];
        
        if (!decoded[rowIndex]) {
          decoded[rowIndex] = [];
        }
        
        for (let j = 0; j < count; j++) {
          decoded[rowIndex][colIndex] = value;
          colIndex++;
          
          if (colIndex >= width) {
            colIndex = 0;
            rowIndex++;
            if (rowIndex < height && !decoded[rowIndex]) {
              decoded[rowIndex] = [];
            }
          }
        }
      }
      
      // Then convert the 2D array to our u8 array format
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          if (decoded[y] && typeof decoded[y][x] !== 'undefined') {
            u8[x * height + y] = decoded[y][x];
          }
        }
      }
    }
    
    // Setup spawn points from teleporter data
    if (mapData.teleporterCodes) {
      for (const teleporter of mapData.teleporterCodes) {
        const { x, y } = teleporter;
        const id = `${x},${y}`;
        spawns[id] = [x, y];
        cached_vals.push([x, y]);
      }
    }
    
    // Update the current map
    maps[currentMapIndex] = mapData;
    
    paint_bg();
    return 1;
  } catch (err) {
    console.error("Error parsing map data:", err);
    return 0;
  }
}

function paint_bg() {
  bg_data.fills = new Array(tile_colors.length);
  bg_data.strokes = new Array(tile_colors.length);
  let idx = 0;
  for(let x = 0; x < width; ++x) {
    for(let y = 0; y < height; ++y) {
      if(bg_data.fills[u8[idx]] == null) {
        bg_data.fills[u8[idx]] = new Path2D();
        bg_data.strokes[u8[idx]] = new Path2D();
      }
      bg_data.fills[u8[idx]].rect(
        (1.5 + x * cell_size) * fov_max,
        (1.5 + y * cell_size) * fov_max,
        (cell_size - 1.5 * 2) * fov_max,
        (cell_size - 1.5 * 2) * fov_max
      );
      bg_data.strokes[u8[idx]].rect(
        x * cell_size * fov_max,
        y * cell_size * fov_max,
        cell_size * fov_max,
        cell_size * fov_max
      );
      ++idx;
    }
  }
  background.width = cell_size * width * fov_max;
  background.height = cell_size * height * fov_max;
  light_background.width = background.width;
  light_background.height = background.height;
  for(let i = 0; i < 256; ++i) {
    if(!bg_data.fills[i]) continue;
    bg_ctx.fillStyle = tile_colors[i] + "b0";
    bg_ctx.fill(bg_data.strokes[i]);
    bg_ctx.fillStyle = tile_colors[i];
    bg_ctx.fill(bg_data.fills[i]);
    lbg_ctx.fillStyle = tile_colors[i];
    lbg_ctx.fill(bg_data.strokes[i]);
  }
  resized = 1;
}
function paint_bg_explicit(idx) {
  const y = idx % height;
  const x = (idx - y) / height;
  bg_ctx.clearRect(
    x * cell_size * fov_max,
    y * cell_size * fov_max,
    cell_size * fov_max,
    cell_size * fov_max
  );
  lbg_ctx.clearRect(
    x * cell_size * fov_max,
    y * cell_size * fov_max,
    cell_size * fov_max,
    cell_size * fov_max
  );
  bg_ctx.fillStyle = tile_colors[tile_type] + "b0";
  bg_ctx.fillRect(
    x * cell_size * fov_max,
    y * cell_size * fov_max,
    cell_size * fov_max,
    cell_size * fov_max
  );
  bg_ctx.fillStyle = tile_colors[tile_type];
  bg_ctx.fillRect(
    (1.5 + x * cell_size) * fov_max,
    (1.5 + y * cell_size) * fov_max,
    (cell_size - 1.5 * 2) * fov_max,
    (cell_size - 1.5 * 2) * fov_max
  );
  lbg_ctx.fillStyle = tile_colors[tile_type];
  lbg_ctx.fillRect(
    x * cell_size * fov_max,
    y * cell_size * fov_max,
    cell_size * fov_max,
    cell_size * fov_max
  );
  resized = 1;
}
function get_mouse() {
  return {
    mx: (mouse[0] - canvas.width * 0.5) / fov + x,
    my: (mouse[1] - canvas.height * 0.5) / fov + y
  };
}
function get_tile_idx() {
  const { mx, my } = get_mouse();
  const cx = Math.floor(mx / cell_size);
  if(cx < 0 || cx >= width) {
    return -1;
  }
  const cy = Math.floor(my / cell_size);
  if(cy < 0 || cy >= height) {
    return -1;
  }
  tile_pos_x = cx;
  tile_pos_y = cy;
  return cx * height + cy;
}
gen_map();
{ /* don't ask */
  let h = createElement("button");
  h[ih] = "Export & copy";
  h.timeout = -1;
  h.onclick = function() {
    const exported = export_tiles();
    window.navigator.clipboard.writeText(exported);
    if(this.timeout != -1) {
      clearTimeout(this.timeout);
    }
    this[ih] = "Exported & copied";
    this.timeout = setTimeout(function() {
      this[ih] = "Export & copy";
      this.timeout = -1;
    }.bind(this), 500);
  }.bind(h);
  tiles["a"](h);
  h = createElement("button");
  h[ih] = "Import";
  h.onclick = function() {
    let answer = prompt("Please paste the map JSON below:");
    if(!answer) return;
    answer = answer.trim();
    if(answer.length == 0) return;
    if(!parse_tiles(answer)) {
      alert("The map data is invalid, it won't be loaded.");
    }
  };
  tiles["a"](h);
  h = createElement("button");
  h[ih] = "Rotate";
  h.onclick = function() {
    save_state();
    let new_u8 = new Uint8Array(width * height);
    for(let x = 0; x < width; ++x) {
      for(let y = 0; y < height; ++y) {
        new_u8[y * width + x] = u8[(width - x - 1) * height + y];
      }
    }
    spawns = {};
    for(let i = 0; i < cached_vals.length; ++i) {
      let x = cached_vals[i][0];
      cached_vals[i][0] = cached_vals[i][1];
      cached_vals[i][1] = width - x - 1;
      spawns[`${cached_vals[i][0]},${cached_vals[i][1]}`] = [cached_vals[i][0], cached_vals[i][1]];
    }
    let old = width;
    width = height;
    height = old;
    let a = getElementById("w");
    a.value = width;
    a.oninput();
    a = getElementById("h");
    a.value = height;
    a.oninput();
    u8 = new_u8;
    paint_bg();
  };
  tiles["a"](h);
  h = createElement("button");
  h[ih] = "Flip X";
  h.onclick = function() {
    save_state();
    for(let x = 0; x < (width >> 1); ++x) {
      for(let y = 0; y < height; ++y) {
        const temp = u8[x * height + y];
        u8[x * height + y] = u8[(width - x - 1) * height + y];
        u8[(width - x - 1) * height + y] = temp;
      }
    }
    spawns = {};
    for(let i = 0; i < cached_vals.length; ++i) {
      cached_vals[i][0] = width - cached_vals[i][0] - 1;
      spawns[`${cached_vals[i][0]},${cached_vals[i][1]}`] = [cached_vals[i][0], cached_vals[i][1]];
    }
    paint_bg();
  };
  tiles["a"](h);
  h = createElement("button");
  h[ih] = "Flip Y";
  h.onclick = function() {
    save_state();
    for(let x = 0; x < width; ++x) {
      for(let y = 0; y < (height >> 1); ++y) {
        const temp = u8[x * height + y];
        u8[x * height + y] = u8[x * height + (height - y - 1)];
        u8[x * height + (height - y - 1)] = temp;
      }
    }
    spawns = {};
    for(let i = 0; i < cached_vals.length; ++i) {
      cached_vals[i][1] = height - cached_vals[i][1] - 1;
      spawns[`${cached_vals[i][0]},${cached_vals[i][1]}`] = [cached_vals[i][0], cached_vals[i][1]];
    }
    paint_bg();
  };
  tiles["a"](h);
  
  h = createElement("h4");
  h[ih] = "Width";
  h.style[mb] = px2;
  tiles["a"](h);
  h = createElement(input);
  h.type = "range";
  h.min = 1;
  h.max = 200;
  h.value = 10;
  h.step = 1;
  c1 = function() {
    this.value = width;
    this[nes][ih] = width + postfix;
    this[nes][nes].value = width;
  }.bind(h);
  h.oninput = function() {
    save_state();
    width = this[van] || 1;
    c1();
    gen_map();
  }.bind(h);
  tiles["a"](h);
  h = createElement("h4");
  h[ih] = width + postfix;
  h.style[mt] = px2;
  h.style[mb] = px2;
  tiles["a"](h);
  h = createElement(input);
  h.type = "number";
  h.style[mt] = px2;
  h.value = width;
  h.min = 1;
  h.max = 200;
  h.id = "w";
  h.oninput = function() {
    width = this[van] ? Math.max(Math.min(this[van], this.max), this.min) : 1;
    this[van] = width;
    this[pes][ih] = width + postfix;
    this[pes][pes].value = width;
    gen_map();
  }.bind(h);
  tiles["a"](h);

  h = createElement("h4");
  h[ih] = "Height";
  h.style[mb] = px2;
  tiles["a"](h);
  h = createElement(input);
  h.type = "range";
  h.min = 1;
  h.max = 200;
  h.value = 10;
  h.step = 1;
  c2 = function() {
    this.value = height;
    this[nes][ih] = height + postfix;
    this[nes][nes].value = height;
  }.bind(h);
  h.oninput = function() {
    save_state();
    height = this[van] || 1;
    c2();
    gen_map();
  }.bind(h);
  tiles["a"](h);
  h = createElement("h4");
  h[ih] = height + postfix;
  h.style[mt] = px2;
  h.style[mb] = px2;
  tiles["a"](h);
  h = createElement(input);
  h.type = "number";
  h.style[mt] = px2;
  h.value = height;
  h.min = 1;
  h.max = 200;
  h.id = "h";
  h.oninput = function() {
    height = this[van] ? Math.max(Math.min(this[van], this.max), this.min) : 1;
    this[van] = height;
    this[pes][ih] = height + postfix;
    this[pes][pes].value = height;
    gen_map();
  }.bind(h);
  tiles["a"](h);

  for(let i = 0; i < tile_colors.length; ++i) {
    if (i === 2) continue;
    
    const el = createElement("div");
    h = createElement("h4");
    h[ih] = tile_desc[i];
    el.appendChild(h);
    hs[hs.length] = h;
    h = createElement("div");
    h.className = "tile";
    h.style["background-color"] = tile_colors[i];
    h.onclick = function() {
      tile_type = i;
      set_selected();
    };
    el.appendChild(h);
    tiles["a"](el);
  }
}
set_selected();
function draw_text_at(text, _x, _y, k, preserve_x, preserve_y) {
  k *= fov;
  const s_x = canvas.width * 0.5 + (_x - x) * fov;
  const s_y = canvas.height * 0.5 + (_y - y) * fov;
  let t_x;
  let t_y;
  if(preserve_x && (s_x < k || s_x > canvas.width - k)) {
    t_x = Math.max(Math.min(s_x, canvas.width - k), k);
  } else {
    t_x = s_x;
  }
  if(preserve_y && (s_y < k || s_y > canvas.height - k)) {
    t_y = Math.max(Math.min(s_y, canvas.height - k), k);
  } else {
    t_y = s_y;
  }
  const r_x = (t_x - canvas.width * 0.5) / fov + x;
  const r_y = (t_y - canvas.height * 0.5) / fov + y;
  ctx.font = `700 20px Ubuntu`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#fff";
  ctx.strokeStyle = "#333";
  ctx.lineWidth = 1;
  ctx.fillText(text, r_x, r_y);
  ctx.strokeText(text, r_x, r_y);
}
const saved = localStorage.getItem("cache");
if(saved) {
  parse_tiles(saved);
}
setInterval(function() {
  localStorage.setItem("cache", export_tiles());
}, 10000);
function draw() {
  let old = fov;
  fov = lerp(fov, target_fov, 0.075);
  let old_x = x;
  let old_y = y;
  get_move();
  x += v[0];
  y += v[1];
  tile_idx = get_tile_idx();
  if(tile_idx != -1) {
    if(pressing) {
      update_tile();
    }
    maybe_add_spawn_point();
  }
  if(resized || old != fov || old_x != x || old_y != y) {
    resized = false;
    ctx.resetTransform();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.translate(canvas.width * 0.5, canvas.height * 0.5);
    ctx.scale(fov, fov);
    ctx.translate(-x, -y);
    ctx.drawImage(background, 0, 0, background.width / fov_max, background.height / fov_max);
    if(fov < 1) {
      ctx.globalAlpha = 1 - fov * fov;
      ctx.drawImage(light_background, 0, 0, background.width / fov_max, background.height / fov_max);
      ctx.globalAlpha = 1;
    }
    if(!hidden) {
      draw_text_at("WASD or arrow keys to move around, scroll to zoom", -500, default_y - 100, 0, false, false);
      draw_text_at("Click on the left to pick what type of tile you want to place", -500, default_y - 60, 0, false, false);
      draw_text_at("Hold right mouse button and press Q to mark a tile as a spawn point", -500, default_y - 20, 0, false, false);
      draw_text_at("Use Ctrl+Z to undo your last action", -500, default_y + 20, 0, false, false);
      draw_text_at("Press E to hide this message", -500, default_y + 60, 0, false, false);
    }
    for (let x = 0; x < width; x++) {
      for (let y = 0; y < height; y++) {
        if (u8[x * height + y] === 2) {
          draw_text_at("S", 20 + x * 40, 20 + y * 40, 0, false, false);
        }
      }
    }
    for(let i = 0; i < width; ++i) {
      draw_text_at(i.toString(), 20 + i * 40, -40, 20, false, true);
    }
    if(width & 1) {
      draw_text_at("M", 20 + ((width - 1) >> 1) * 40, -20, 40, false, true);
    } else {
      draw_text_at("M", 20 + (width >> 1) * 40, -20, 40, false, true);
      draw_text_at("M", 20 + ((width >> 1) - 1) * 40, -20, 40, false, true);
    }
    for(let i = 0; i < height; ++i) {
      draw_text_at(i.toString(), width * 40 + 40, 20 + i * 40, 20, true, false);
    }
    if(height & 1) {
      draw_text_at("M", width * 40 + 20, 20 + ((height - 1) >> 1) * 40, 40, true, false);
    } else {
      draw_text_at("M", width * 40 + 20, 20 + (height >> 1) * 40, 40, true, false);
      draw_text_at("M", width * 40 + 20, 20 + ((height >> 1) - 1) * 40, 40, true, false);
    }
  }
  requestAnimationFrame(draw);
}
draw(); 