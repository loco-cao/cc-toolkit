const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { loadRegistry, saveRegistry, getReposDir } = require('./config.js');
const { colorize, ANSI } = require('./colors.js');

function expandGhRef(ref) {
  const m = ref.match(/^gh:([^/]+)\/(.+)$/);
  if (!m) return ref;
  return `https://github.com/${m[1]}/${m[2]}.git`;
}

function nameFromRef(ref) {
  const m = ref.match(/^gh:([^/]+)\/(.+)$/);
  if (m) return m[2];
  // fallback: extract from URL
  const n = ref.match(/\/([^/]+?)(?:\.git)?$/);
  return n ? n[1] : ref;
}

function validateRepo(repoPath) {
  const cctYaml = path.join(repoPath, 'cct.yaml');
  if (!fs.existsSync(cctYaml)) {
    throw new Error(`cct.yaml not found in repository root. Expected at: ${cctYaml}`);
  }

  const yaml = require('js-yaml');
  let meta;
  try {
    meta = yaml.load(fs.readFileSync(cctYaml, 'utf8'));
  } catch (e) {
    throw new Error(`Failed to parse cct.yaml: ${e.message}`);
  }

  if (!meta.name) throw new Error('cct.yaml missing required field: name');
  if (!meta.version) throw new Error('cct.yaml missing required field: version');
  if (!meta.targets || Object.keys(meta.targets).length === 0) {
    throw new Error('cct.yaml must define at least one target CLI');
  }

  for (const [cli, target] of Object.entries(meta.targets)) {
    const targetPath = path.join(repoPath, target.path);
    if (!fs.existsSync(targetPath)) {
      throw new Error(`Target file not found: ${target.path} (for CLI: ${cli})`);
    }
  }

  return meta;
}

function isGhRef(source) {
  return /^gh:/.test(source);
}

function isLocalPath(source) {
  // Absolute path or relative path starting with ./ or ../
  return path.isAbsolute(source) || /^\.\.?\//.test(source);
}

function register(source, scope = 'global') {
  const reposDir = scope === 'project'
    ? path.join(process.cwd(), '.cct', 'repos')
    : getReposDir();

  let dest, name;

  if (isGhRef(source)) {
    // GitHub mode: clone
    const url = expandGhRef(source);
    name = nameFromRef(source);
    dest = path.join(reposDir, name);

    if (fs.existsSync(dest)) {
      console.log(`  ${colorize('!', ANSI.yellow)} Repo already exists, pulling latest...`);
      try {
        execSync(`git -C "${dest}" fetch origin`, { stdio: 'pipe' });
        const branch = execSync(`git -C "${dest}" rev-parse --abbrev-ref HEAD`, {
          encoding: 'utf8', stdio: 'pipe',
        }).trim();
        execSync(`git -C "${dest}" reset --hard origin/${branch}`, { stdio: 'pipe' });
      } catch (e) {
        throw new Error(`Failed to pull existing repo: ${e.message}`);
      }
    } else {
      fs.mkdirSync(reposDir, { recursive: true });
      console.log(`  ${colorize('↓', ANSI.brightCyan)} Cloning ${url}...`);
      try {
        execSync(`git clone "${url}" "${dest}"`, { stdio: 'pipe' });
      } catch (e) {
        throw new Error(`Failed to clone repo: ${e.message}. Check that "${url}" is a valid git repository.`);
      }
    }
  } else if (isLocalPath(source)) {
    // Local path mode: resolve and validate in-place (no copy)
    dest = path.resolve(source);
    if (!fs.existsSync(dest) || !fs.statSync(dest).isDirectory()) {
      throw new Error(`Local path not found or not a directory: ${dest}`);
    }
    const meta = validateRepo(dest);
    name = meta.name;
  } else {
    throw new Error(`Invalid source: "${source}". Use gh:user/repo or a local path (./ or absolute).`);
  }

  // Validate
  const meta = validateRepo(dest);
  console.log(`  ${colorize('✓', ANSI.brightGreen)} Validated: ${meta.name} v${meta.version}`);

  // Register
  const registry = loadRegistry();
  const existing = registry.registrations.findIndex((r) => r.name === meta.name);
  const entry = {
    name: meta.name,
    version: meta.version,
    description: meta.description || '',
    source,
    local_path: dest,
    scope,
    installed_at: new Date().toISOString(),
    targets: Object.keys(meta.targets),
    output_dir: meta.output_dir || null,
    report_pattern: meta.report_pattern || null,
    global_timeout: meta.global_timeout || null,
    agent_timeout: meta.agent_timeout || null,
  };

  if (existing >= 0) {
    registry.registrations[existing] = entry;
  } else {
    registry.registrations.push(entry);
  }

  saveRegistry(registry);
  console.log(`  ${colorize('✓', ANSI.brightGreen)} Registered: ${meta.name} v${meta.version}`);
  return meta;
}

function unregister(name) {
  const registry = loadRegistry();
  const idx = registry.registrations.findIndex((r) => r.name === name);
  if (idx < 0) {
    console.log(`  ${colorize('!', ANSI.yellow)} Skill "${name}" not found in registry.`);
    return false;
  }
  const reg = registry.registrations[idx];
  registry.registrations.splice(idx, 1);
  saveRegistry(registry);

  // Only delete cloned repos, not in-place local paths
  if (isGhRef(reg.source) && fs.existsSync(reg.local_path)) {
    fs.rmSync(reg.local_path, { recursive: true, force: true });
    console.log(`  ${colorize('✗', ANSI.yellow)} Removed local clone.`);
  }
  console.log(`  ${colorize('✓', ANSI.brightGreen)} Unregistered: ${name}`);
  return true;
}

function update() {
  const registry = loadRegistry();
  let updated = 0;
  let failed = 0;

  for (const reg of registry.registrations) {
    if (!fs.existsSync(reg.local_path)) {
      console.log(`  ${colorize('✗', ANSI.red)} ${reg.name}: local path missing, skipping`);
      failed++;
      continue;
    }

    try {
      const before = execSync(`git -C "${reg.local_path}" rev-parse HEAD`, {
        encoding: 'utf8', stdio: 'pipe',
      }).trim();

      execSync(`git -C "${reg.local_path}" fetch origin`, { stdio: 'pipe' });
      const upBranch = execSync(`git -C "${reg.local_path}" rev-parse --abbrev-ref HEAD`, {
        encoding: 'utf8', stdio: 'pipe',
      }).trim();
      execSync(`git -C "${reg.local_path}" reset --hard origin/${upBranch}`, { stdio: 'pipe' });

      const after = execSync(`git -C "${reg.local_path}" rev-parse HEAD`, {
        encoding: 'utf8', stdio: 'pipe',
      }).trim();

      if (before !== after) {
        // Re-validate and update version
        const meta = validateRepo(reg.local_path);
        reg.version = meta.version;
        reg.description = meta.description || '';
        reg.output_dir = meta.output_dir || null;
        reg.report_pattern = meta.report_pattern || null;
        reg.global_timeout = meta.global_timeout || null;
        reg.agent_timeout = meta.agent_timeout || null;
        updated++;
        console.log(`  ${colorize('↑', ANSI.brightYellow)} ${reg.name}: updated to v${meta.version}`);
      } else {
        console.log(`  ${colorize('✓', ANSI.dim)} ${reg.name}: already up to date`);
      }
    } catch (e) {
      console.log(`  ${colorize('✗', ANSI.red)} ${reg.name}: ${e.message}`);
      failed++;
    }
  }

  if (updated > 0 || failed > 0) {
    saveRegistry(registry);
  }

  console.log('');
  console.log(`  ${registry.registrations.length} skills — ${updated} updated, ${failed} failed`);
}

function list() {
  const registry = loadRegistry();
  if (registry.registrations.length === 0) {
    console.log(`  ${ANSI.dim}No registered skills. Use "cct register gh:user/repo" to add one.${ANSI.reset}`);
    console.log('');
    return;
  }

  console.log('');
  for (const reg of registry.registrations) {
    const scoped = reg.scope === 'project' ? colorize('[project]', ANSI.brightBlue) : colorize('[global]', ANSI.dim);
    console.log(`  ${colorize(reg.name, ANSI.bold)} ${scoped}  v${reg.version}`);
    if (reg.description) {
      console.log(`    ${ANSI.dim}${reg.description}${ANSI.reset}`);
    }
    console.log(`    ${ANSI.dim}targets: ${(reg.targets || []).join(', ') || 'unknown'}${ANSI.reset}`);
    console.log('');
  }
}

function getRegistry() {
  return loadRegistry();
}

function findSkill(name) {
  const registry = loadRegistry();
  const full = `skills/${name}`;
  const reg = registry.registrations.find((r) => r.name === name);
  if (reg) return reg;

  // Try with namespace prefix stripped
  if (full.startsWith('skills/')) {
    return registry.registrations.find((r) => r.name === full.slice(7));
  }
  return null;
}

module.exports = {
  expandGhRef,
  nameFromRef,
  validateRepo,
  register,
  unregister,
  update,
  list,
  getRegistry,
  findSkill,
};
