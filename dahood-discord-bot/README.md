# Da Hood Remake — All-in-One Discord Bot

An all-in-one Discord bot built for a "Da Hood" style Roblox game community, similar in spirit to bots like Ticket Tool, Greed, and Bleed. Built with **discord.js v14**, plain JSON file storage (no database server or native builds required), and organized into clean, extensible slash-command modules.

## Features

- **🎫 Ticket System** (the main feature)
  - `/ticket setup` posts a panel with a **dropdown menu** to open a ticket
  - Categories: **Exploiter Report**, **Staff Report**, **Appeal**, **Other**
  - Auto-creates a private channel per ticket, pings the staff role
  - **Claim** and **Close** buttons on every ticket
  - Prevents duplicate open tickets per user/category
  - Auto-generated **transcripts** logged to a configurable channel when a ticket closes
  - `/ticket add` / `/ticket remove` to manage who can see a ticket

- **🛡️ Moderation** — ban, kick, timeout/untimeout, warn, warnings, clearwarnings, purge, lock/unlock, slowmode, all logged to a mod-log channel

- **💵 Economy** (Da Hood themed "Cash") — balance, daily, work, beg, rob, pay, deposit/withdraw (bank), leaderboard, shop, buy

- **📈 Leveling** — XP from chatting, level-up announcements, `/level rank`, `/level leaderboard`, level-based role rewards

- **🎮 Roblox Verification** — `/roblox verify <username>` links a Discord account to a Roblox account via the Roblox API and syncs the server nickname; `/roblox whois` looks up a linked account

- **🎉 Giveaways** — `/giveaway start` with a duration (e.g. `10m`, `2h`, `1d`), button-based entry, automatic winner selection, `/giveaway end`, `/giveaway reroll`

- **💡 Suggestions** — `/suggest` posts to a suggestions channel with 👍/👎 voting

- **👋 Welcome/Leave messages** — customizable via `/config welcome` and `/config leave`

- **🧹 Basic Auto-Moderation** — deletes invite links / banned words when enabled with `/config automod`

- **🔘 Reaction/Button Roles** — any button with a custom ID of `rr_<roleId>` will toggle that role for the clicker (build the button message yourself, or ask to have a `/reactionrole` setup command added)

- **⚙️ Central config command** — `/config welcome`, `/config leave`, `/config logs`, `/config modrole`, `/config staffrole`, `/config suggestions`, `/config automod`

- **🔧 Utility** — `/utility ping`, `/utility userinfo`, `/utility serverinfo`, `/utility avatar`, `/utility help`

## Permissions: Owner, Admin, Staff

- **Owner** — the actual Discord server owner. Always has full access to everything (including `/panel`), no role setup required, and can never be locked out.
- **Admin** — anyone with Discord's native **Administrator** permission, *or* anyone holding the configurable **Admin role** (set it in `/panel` → Roles, or `/config adminrole`). Admins can open `/panel` and use `/config`.
- **Staff** — the configurable **Staff role** (grants access to manage/see tickets) and **Moderator role** (grants access to `/mod` commands). Assign these Discord roles to whoever should have those powers — the bot checks role membership live, so there's no manual allow-list to maintain. Admins automatically count as staff/mod too.

## Admin Panel — `/panel`

Run `/panel` (owner, Administrator, or Admin-role only) to open a live, in-Discord control dashboard instead of remembering slash-command flags:

- **Feature Toggles page** — one button per module (Tickets, Moderation, Economy, Leveling, Giveaways, Suggestions, Welcome, Leave, Auto-Moderation, Reaction Roles). Click to flip a feature on/off instantly — green = on, grey = off. Disabled modules immediately stop responding to their commands/events server-wide.
- **Roles page** — dropdown role-pickers to set the Admin role, Staff role, and Moderator role without typing anything.
- **Channels (General) page** — dropdown channel-pickers for the mod log, welcome, and leave channels.
- **Channels (Tickets) page** — dropdown channel-pickers for the suggestions channel, ticket category, and ticket transcript channel.

Everything in the panel is also settable the old-fashioned way via `/config` and `/ticket setup` if you prefer typing commands — both write to the same settings.


### 1. Create your bot application
1. Go to the [Discord Developer Portal](https://discord.com/developers/applications) and create a new application.
2. Go to the **Bot** tab, click **Reset Token** to get your bot token, and enable these **Privileged Gateway Intents**:
   - `SERVER MEMBERS INTENT`
   - `MESSAGE CONTENT INTENT`
3. Go to **OAuth2 → URL Generator**, select the `bot` and `applications.commands` scopes, and under bot permissions select at minimum: `Administrator` (simplest for an all-in-one bot), or manually pick `Manage Roles`, `Manage Channels`, `Kick Members`, `Ban Members`, `Moderate Members`, `Manage Messages`, `Send Messages`, `Embed Links`, `Attach Files`, `Read Message History`.
4. Use the generated URL to invite the bot to your server.

### 2. Install & configure
```bash
npm install
cp .env.example .env
```
Edit `.env` and fill in:
- `DISCORD_TOKEN` — your bot token
- `CLIENT_ID` — your application's Client ID (Developer Portal → General Information)
- `GUILD_ID` — (optional, recommended while testing) your server's ID for instant command registration

### 3. Register slash commands
```bash
npm run deploy
```

### 4. Start the bot
```bash
npm start
```

### 5. In your Discord server, run `/panel` (as the owner or an Administrator)
Use the dashboard to set your Staff role, Moderator role, ticket category, log channel, etc. — or, if you prefer typing commands directly:
```
/config staffrole role:@Staff
/config modrole role:@Moderator
/config logs channel:#mod-logs
/ticket setup category:#Tickets staff_role:@Staff transcript_channel:#ticket-transcripts
/config welcome channel:#welcome
/config leave channel:#leave
/config suggestions channel:#suggestions
```
That's it — the ticket dropdown panel, moderation, economy, leveling, giveaways, and everything else is now live. Use `/panel` any time to toggle modules on/off.

## Project structure
```
src/
  index.js              # Bot entry point, loads commands & events
  deploy-commands.js    # Registers slash commands with Discord
  database.js           # Lightweight JSON-file data store (no native deps)
  commands/              # One file per slash command (with subcommands)
  events/                 # Discord.js event listeners
  handlers/
    ticketHandler.js     # Ticket creation/claim/close/transcript logic
  utils/
    embeds.js            # Shared embed builders/colors
    permissions.js        # Staff/mod permission helpers
data/                    # Auto-created JSON data files (gitignore this in production)
```

## Notes
- All persistent data (tickets, economy, levels, warnings, giveaways, Roblox links, per-server config) is stored as JSON files under `/data`. This keeps setup dependency-free — no external database or native compilation needed. For a very large server you may eventually want to swap this for a real database (e.g. PostgreSQL/SQLite); the `database.js` module is a thin abstraction so that swap is straightforward.
- The banned-word list for auto-moderation in `src/events/messageCreate.js` is intentionally minimal — extend the `BANNED_WORDS` array with your server's actual rules.
- Reaction roles: the handler for `rr_<roleId>` buttons exists in `interactionCreate.js`. If you'd like a full `/reactionrole setup` command that builds the message and buttons automatically, that can be added — just ask.
