const fs = require('fs');
const path = require('path');
const os = require('os');

const CCT_DIR = path.join(os.homedir(), '.cct');
const CONFIG_FILE = path.join(CCT_DIR, 'config.json');
const REGISTRY_FILE = path.join(CCT_DIR, 'registry.json');
const REPOS_DIR = path.join(CCT_DIR, 'repos');

const DEFAULT_CONFIG = {
  default_cli: 'auto',
  registry_scope: 'global',
  cli_paths: {
    claude: null,
  },
};

function ensureCctDir() {
  if (!fs.existsSync(CCT_DIR)) {
    fs.mkdirSync(CCT_DIR, { recursive: true });
  }
  if (!fs.existsSync(REPOS_DIR)) {
    fs.mkdirSync(REPOS_DIR, { recursive: true });
  }
}

function loadConfig() {
  ensureCctDir();
  if (!fs.existsSync(CONFIG_FILE)) {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(DEFAULT_CONFIG, null, 2));
    return { ...DEFAULT_CONFIG };
  }
  try {
    return { ...DEFAULT_CONFIG, ...JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')) };
  } catch (_) {
    return { ...DEFAULT_CONFIG };
  }
}

function saveConfig(config) {
  ensureCctDir();
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

function loadRegistry() {
  ensureCctDir();
  if (!fs.existsSync(REGISTRY_FILE)) {
    return { registrations: [] };
  }
  try {
    return JSON.parse(fs.readFileSync(REGISTRY_FILE, 'utf8'));
  } catch (_) {
    return { registrations: [] };
  }
}

function saveRegistry(registry) {
  ensureCctDir();
  fs.writeFileSync(REGISTRY_FILE, JSON.stringify(registry, null, 2));
}

function getReposDir() {
  ensureCctDir();
  return REPOS_DIR;
}

module.exports = {
  CCT_DIR,
  CONFIG_FILE,
  REGISTRY_FILE,
  REPOS_DIR,
  loadConfig,
  saveConfig,
  loadRegistry,
  saveRegistry,
  getReposDir,
  ensureCctDir,
};
