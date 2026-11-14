/**
 * Send Release Notification to Discord using Embeds
 *
 * Usage:
 *   node send-discord-release.cjs <type> <webhook-url>
 *
 * Args:
 *   type: 'production' or 'dev'
 *   webhook-url: Discord webhook URL
 */

const fs = require('fs');
const https = require('https');
const { URL } = require('url');

const releaseType = process.argv[2]; // 'production' or 'dev'
const webhookUrl = process.argv[3];

if (!releaseType || !webhookUrl) {
  console.error('Usage: node send-discord-release.cjs <type> <webhook-url>');
  process.exit(1);
}

// Validate webhook URL is Discord
try {
  const parsed = new URL(webhookUrl);
  if (!parsed.hostname.endsWith('discord.com') || !parsed.pathname.startsWith('/api/webhooks/')) {
    console.error('[X] Invalid Discord webhook URL');
    process.exit(1);
  }
} catch {
  console.error('[X] Invalid URL format');
  process.exit(1);
}

/**
 * Extract latest release from CHANGELOG.md (for production releases)
 */
function extractLatestRelease() {
  const changelogPath = 'CHANGELOG.md';

  if (!fs.existsSync(changelogPath)) {
    return {
      version: 'Unknown',
      date: new Date().toISOString().split('T')[0],
      sections: {},
    };
  }

  const content = fs.readFileSync(changelogPath, 'utf8');
  const lines = content.split('\n');

  let version = 'Unknown';
  let date = new Date().toISOString().split('T')[0];
  let collecting = false;
  let currentSection = null;
  const sections = {};

  for (const line of lines) {
    // Match: ## [1.0.0](url) (2025-01-01) or ## 1.0.0 (2025-01-01)
    const versionMatch = line.match(/^## \[?(\d+\.\d+\.\d+(?:-dev\.\d+)?)\]?.*?\((\d{4}-\d{2}-\d{2})\)/);
    if (versionMatch) {
      if (!collecting) {
        version = versionMatch[1];
        date = versionMatch[2];
        collecting = true;
        continue;
      } else {
        break; // Found next version, stop
      }
    }

    if (!collecting) continue;

    // Match section headers: ### Features, ### Bug Fixes
    const sectionMatch = line.match(/^### (.+)/);
    if (sectionMatch) {
      currentSection = sectionMatch[1];
      sections[currentSection] = [];
      continue;
    }

    // Collect bullet points
    if (currentSection && line.trim().startsWith('*')) {
      const item = line.trim().substring(1).trim();
      if (item) {
        sections[currentSection].push(item);
      }
    }
  }

  return { version, date, sections };
}

/**
 * Extract dev release info from .dev-release-info.json (for dev releases)
 * Falls back to CHANGELOG.md if file not found
 */
function extractDevRelease() {
  const devInfoPath = '.dev-release-info.json';

  if (!fs.existsSync(devInfoPath)) {
    console.log('[!] .dev-release-info.json not found, falling back to CHANGELOG.md');
    return extractLatestRelease();
  }

  try {
    const content = fs.readFileSync(devInfoPath, 'utf8');
    const info = JSON.parse(content);

    // Parse commit messages into a simple Changes section
    const changes = info.notes
      .split('\n')
      .filter((line) => line.trim().startsWith('-'))
      .map((line) => line.trim().substring(1).trim())
      .filter((item) => item);

    return {
      version: info.version,
      date: new Date().toISOString().split('T')[0],
      sections: changes.length > 0 ? { Changes: changes } : {},
    };
  } catch (error) {
    console.error('[!] Error reading .dev-release-info.json:', error.message);
    return extractLatestRelease();
  }
}

/**
 * Create Discord embed
 */
function createEmbed(release) {
  const isDev = releaseType === 'dev';
  const color = isDev ? 0xf59e0b : 0x10b981; // Orange for dev, Green for production
  const title = isDev ? `Dev Release ${release.version}` : `Release ${release.version}`;
  const url = `https://github.com/kaitranntt/ccs/releases/tag/v${release.version}`;

  // Section name to indicator mapping (ASCII only per CLAUDE.md)
  const sectionIndicators = {
    Features: '[+]',
    'Bug Fixes': '[X]',
    Documentation: '[i]',
    Styles: '[~]',
    'Code Refactoring': '[~]',
    'Performance Improvements': '[!]',
    Tests: '[T]',
    'Build System': '[B]',
    CI: '[C]',
  };

  const fields = [];

  for (const [sectionName, items] of Object.entries(release.sections)) {
    if (items.length === 0) continue;

    const indicator = sectionIndicators[sectionName] || '[*]';
    let fieldValue = items.map((item) => `• ${item}`).join('\n');

    // Discord field value max is 1024 characters
    if (fieldValue.length > 1024) {
      const truncateAt = fieldValue.lastIndexOf('\n', 1000);
      fieldValue = fieldValue.substring(0, truncateAt > 0 ? truncateAt : 1000) + '\n... *(truncated)*';
    }

    fields.push({
      name: `${indicator} ${sectionName}`,
      value: fieldValue,
      inline: false,
    });
  }

  if (fields.length === 0) {
    fields.push({
      name: '[i] Release Notes',
      value: 'Release completed. See changelog on GitHub.',
      inline: false,
    });
  }

  return {
    title,
    url,
    color,
    timestamp: new Date().toISOString(),
    footer: {
      text: isDev ? 'npm i @kaitranntt/ccs@dev' : 'npm i @kaitranntt/ccs@latest',
    },
    fields,
  };
}

/**
 * Send to Discord webhook
 */
function sendToDiscord(embed) {
  const payload = {
    username: releaseType === 'dev' ? 'CCS Dev Release' : 'CCS Release',
    embeds: [embed],
  };

  const url = new URL(webhookUrl);
  const options = {
    hostname: url.hostname,
    path: url.pathname + url.search,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
  };

  const req = https.request(options, (res) => {
    let data = '';

    res.on('data', (chunk) => {
      data += chunk;
    });

    res.on('end', () => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        console.log('[OK] Discord notification sent');
      } else {
        console.error(`[X] Discord webhook failed: ${res.statusCode}`);
        console.error(data);
        process.exit(1);
      }
    });
  });

  req.on('error', (error) => {
    console.error('[X] Error sending Discord notification:', error);
    process.exit(1);
  });

  req.write(JSON.stringify(payload));
  req.end();
}

// Main
try {
  const isDev = releaseType === 'dev';
  const release = isDev ? extractDevRelease() : extractLatestRelease();
  console.log(`[i] Preparing ${releaseType} notification for v${release.version}`);

  const embed = createEmbed(release);
  sendToDiscord(embed);
} catch (error) {
  console.error('[X] Error:', error);
  process.exit(1);
}
