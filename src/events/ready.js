const { ActivityType } = require('discord.js');
const db = require('../database');
const { endGiveaway } = require('../commands/giveaway');

module.exports = {
  name: 'ready',
  once: true,
  async execute(client) {
    console.log(`✅ Logged in as ${client.user.tag}`);
    client.user.setPresence({
      activities: [{ name: 'made by vvznq | /utility help', type: ActivityType.Watching }],
      status: 'online'
    });

    // Giveaway timers are only kept in memory (setTimeout), so a restart while one is
    // active would otherwise strand it forever. Resume/finish them here on startup.
    const giveaways = db.giveaways.all();
    for (const [messageId, g] of Object.entries(giveaways)) {
      if (g.status !== 'active') continue;
      const remaining = g.endsAt - Date.now();
      if (remaining <= 0) {
        endGiveaway(client, messageId).catch(err => console.error('Failed to resolve overdue giveaway:', err));
      } else {
        setTimeout(() => {
          endGiveaway(client, messageId).catch(err => console.error('Failed to resolve giveaway:', err));
        }, remaining);
      }
    }
  }
};
