const { v4: uuidv4 } = require('uuid');
const Grid = require('./grid');
const { Enemy } = require('./enemies/BaseEnemy');
const { Sniper } = require('./enemies/Sniper');
const { Dasher } = require('./enemies/Dasher');
const { Homing } = require('./enemies/Homing');
const { VoidCrawler } = require('./enemies/VoidCrawler');
const { Wall } = require('./enemies/Wall');
const { Bullet } = require('./enemies/Bullet');
const { RecursiveBullet } = require('./enemies/RecursiveBullet');
const { RecursiveBulletBoss } = require('./enemies/RecursiveBulletBoss');

const ENEMY_TYPES = {
  1: { name: 'Basic', color: '#808080', outlineColor: '#000000' },
  2: { name: 'Sniper', color: '#8B0000', outlineColor: '#000000' },
  3: { name: 'Dasher', color: '#003c66', outlineColor: '#001830' },
  4: { name: 'Homing', color: '#7F00FF', outlineColor: '#5c4200' },
  5: { name: 'VoidCrawler', color: '#1c0a2d', outlineColor: '#0d0517' },
  6: { name: 'Wall', color: '#222222', outlineColor: '#111111' },
  7: { name: 'RecursiveBulletBoss', color: '#AD85FF', outlineColor: '#5D2E8C' }
};

console.log("Loaded enemy types:", Object.keys(ENEMY_TYPES).join(", "));
console.log("RecursiveBulletBoss loaded:", typeof RecursiveBulletBoss);

const MS_PER_GAME_TICK = 1000 / 60;

let gridInstance = null;

function getGrid() {
  if (!gridInstance) {
    throw new Error("Grid accessed before initialization. Call Enemy.initGrid() or Enemy.initializeGridWithMap() first.");
  }
  return gridInstance;
}

Enemy.initializeGridWithMap = function(map) {
  const effectiveCellSize = map.tileSize || 64;
  gridInstance = new Grid(map.width * map.tileSize, map.height * map.tileSize, effectiveCellSize);
  gridInstance.initializeMapData(map);
  return gridInstance;
};

Enemy.bulkAddToGrid = function(enemies, grid) {
  if (!enemies || enemies.length === 0) return;
  grid.bulkInsert(enemies);
};

module.exports = { 
  Enemy, Sniper, Dasher, Homing, VoidCrawler, Wall, RecursiveBulletBoss,
  Bullet, RecursiveBullet, ENEMY_TYPES, 
  initializeGridWithMap: Enemy.initializeGridWithMap,
  bulkAddToGrid: Enemy.bulkAddToGrid,
  getGrid,
  MS_PER_GAME_TICK
};