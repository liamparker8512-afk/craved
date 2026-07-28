const fs = require('fs');
const path = require('path');

// If DATA_DIR is set (e.g. on Railway/Render, pointed at a mounted persistent volume),
// use that exact path — otherwise fall back to a "data" folder next to the project root.
// This avoids needing to guess where the platform actually puts your app's code.
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
console.log(`💾 Bot data directory: ${DATA_DIR}`);

const FILES = {
  guildConfig: 'guildConfig.json',
  tickets: 'tickets.json',
  economy: 'economy.json',
  levels: 'levels.json',
  warnings: 'warnings.json',
  reactionRoles: 'reactionRoles.json',
  roblox: 'roblox.json',
  giveaways: 'giveaways.json',
  applications: 'applications.json'
};

const cache = {};

function filePath(name) {
  return path.join(DATA_DIR, FILES[name]);
}

function load(name) {
  if (cache[name]) return cache[name];
  const fp = filePath(name);
  if (!fs.existsSync(fp)) {
    fs.writeFileSync(fp, '{}');
  }
  try {
    cache[name] = JSON.parse(fs.readFileSync(fp, 'utf8') || '{}');
  } catch (e) {
    console.error(`Failed to parse ${name}.json, resetting it.`, e);
    cache[name] = {};
  }
  return cache[name];
}

let saveTimers = {};
function save(name) {
  clearTimeout(saveTimers[name]);
  saveTimers[name] = setTimeout(() => {
    fs.writeFileSync(filePath(name), JSON.stringify(cache[name], null, 2));
  }, 150);
}

class Store {
  constructor(name) {
    this.name = name;
  }
  all() {
    return load(this.name);
  }
  get(key, fallback = undefined) {
    const data = load(this.name);
    const value = Object.prototype.hasOwnProperty.call(data, key) ? data[key] : fallback;
    if (value !== null && typeof value === 'object') {
      return JSON.parse(JSON.stringify(value));
    }
    return value;
  }
  set(key, value) {
    const data = load(this.name);
    data[key] = value;
    save(this.name);
    return value;
  }
  delete(key) {
    const data = load(this.name);
    delete data[key];
    save(this.name);
  }
  update(key, updater, fallback = {}) {
    const data = load(this.name);
    const current = Object.prototype.hasOwnProperty.call(data, key) ? data[key] : fallback;
    const updated = updater(current);
    data[key] = updated;
    save(this.name);
    return updated;
  }
}

module.exports = {
  guildConfig: new Store('guildConfig'),
  tickets: new Store('tickets'),
  economy: new Store('economy'),
  levels: new Store('levels'),
  warnings: new Store('warnings'),
  reactionRoles: new Store('reactionRoles'),
  roblox: new Store('roblox'),
  giveaways: new Store('giveaways'),
  applications: new Store('applications')
};
