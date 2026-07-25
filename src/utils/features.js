const db = require('../database');

// The single source of truth for every toggleable module in the bot.
// Add a new feature by adding a row here — the panel picks it up automatically.
const FEATURES = {
  tickets: { label: 'Ticket System', emoji: '🎫', default: true },
  moderation: { label: 'Moderation', emoji: '🛡️', default: true },
  economy: { label: 'Economy', emoji: '💵', default: true },
  leveling: { label: 'Leveling', emoji: '📈', default: true },
  giveaways: { label: 'Giveaways', emoji: '🎉', default: true },
  suggestions: { label: 'Suggestions', emoji: '💡', default: true },
  welcome: { label: 'Welcome Messages', emoji: '👋', default: true },
  leave: { label: 'Leave Messages', emoji: '🚪', default: true },
  automod: { label: 'Auto-Moderation', emoji: '🧹', default: false },
  reactionroles: { label: 'Reaction Roles', emoji: '🔘', default: false }
};

function defaultFeatureState() {
  const state = {};
  for (const [key, meta] of Object.entries(FEATURES)) state[key] = meta.default;
  return state;
}

function getFeatures(guildId) {
  const cfg = db.guildConfig.get(guildId, {});
  return { ...defaultFeatureState(), ...(cfg.features || {}) };
}

function isFeatureEnabled(guildId, key) {
  return getFeatures(guildId)[key] !== false;
}

function setFeature(guildId, key, enabled) {
  db.guildConfig.update(guildId, cfg => ({
    ...cfg,
    features: { ...defaultFeatureState(), ...(cfg.features || {}), [key]: enabled }
  }));
}

module.exports = { FEATURES, defaultFeatureState, getFeatures, isFeatureEnabled, setFeature };
