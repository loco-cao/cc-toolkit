const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const { getPlatformPaths } = require('./platform-paths.js');
const { colorize, ANSI } = require('./colors.js');
const { getRegistry } = require('./registry.js');

function copySync(src, dest) {
  if (!fs.existsSync(src)) {
    throw new Error(`Source not found: ${src}`);
  }
  const stat = fs.statSync(src);
  if (stat.isFile()) {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  } else if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    const entries = fs.readdirSync(src, { withFileTypes: true });
    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);
      copySync(srcPath, destPath);
    }
  } else {
    throw new Error(`Unsupported source type: ${src}`);
  }
}

function countFiles(src) {
  if (!fs.existsSync(src)) return 0;
  const stat = fs.statSync(src);
  if (stat.isFile()) return 1;
  if (stat.isDirectory()) {
    return fs.readdirSync(src, { recursive: true }).filter((f) => {
      const full = path.join(src, f);
      return fs.statSync(full).isFile();
    }).length;
  }
  return 0;
}

function removeDirSync(dir) {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function loadCctYaml(repoPath) {
  const cctYaml = path.join(repoPath, 'cct.yaml');
  if (!fs.existsSync(cctYaml)) {
    return null;
  }
  try {
    return yaml.load(fs.readFileSync(cctYaml, 'utf8'));
  } catch (e) {
    console.log(`  ${colorize('!', ANSI.yellow)} Failed to parse cct.yaml: ${e.message}`);
    return null;
  }
}

function installSkill(skillName, platforms) {
  const registry = getRegistry();
  const reg = registry.registrations.find((r) => r.name === skillName);
  if (!reg) {
    console.log(`  ${colorize('✗', ANSI.red)} Skill "${skillName}" not registered.`);
    return false;
  }

  const repoPath = reg.local_path;
  if (!fs.existsSync(repoPath)) {
    console.log(`  ${colorize('✗', ANSI.red)} Local repo not found at: ${repoPath}`);
    console.log('  Run "cct update" to re-clone.');
    return false;
  }

  const meta = loadCctYaml(repoPath);
  if (!meta) {
    console.log(`  ${colorize('✗', ANSI.red)} No valid cct.yaml found in repo.`);
    return false;
  }

  console.log(`  Installing ${colorize(skillName, ANSI.bold)} v${meta.version}...`);
  console.log('');

  for (const platform of platforms) {
    const paths = getPlatformPaths(platform);
    if (!paths) {
      console.log(`  ${colorize('✗', ANSI.red)} Unknown platform: ${platform}`);
      continue;
    }

    const target = meta.targets && meta.targets[platform];
    if (!target) {
      console.log(`  ${colorize('!', ANSI.yellow)} No ${platform} target defined in cct.yaml, skipping.`);
      continue;
    }

    const installList = target.install;
    if (!installList || installList.length === 0) {
      console.log(`  ${colorize('!', ANSI.yellow)} No install mappings for ${platform}, skipping.`);
      continue;
    }

    for (const mapping of installList) {
      const src = path.join(repoPath, mapping.from);
      if (!fs.existsSync(src)) {
        console.log(`  ${colorize('!', ANSI.yellow)} Source not found: ${mapping.from}, skipping.`);
        continue;
      }

      // Determine destination root
      let dest;
      if (mapping.to.startsWith('skills/') || mapping.to.startsWith('skills-cursor/')) {
        dest = path.join(paths.skills, mapping.to.replace(/^skills(?:-cursor)?\//, ''));
      } else if (mapping.to === 'agents' || mapping.to.startsWith('agents/')) {
        dest = mapping.to === 'agents' ? paths.agents : path.join(paths.agents, mapping.to.slice(7));
      } else {
        dest = path.join(paths.skills, skillName, mapping.to);
      }

      copySync(src, dest);
      const fileCount = countFiles(src);
      console.log(`  ${colorize('✓', ANSI.brightGreen)} ${mapping.from} → ${mapping.to}  (${fileCount} files)`);
    }
  }

  console.log('');
  console.log(`  ${colorize('Install complete!', ANSI.brightGreen)}`);
  console.log(`  Usage: ${colorize(meta.targets && meta.targets.claude ? meta.targets.claude.trigger : '/' + skillName, ANSI.bold)}`);
  return true;
}

function uninstallSkill(skillName, platforms) {
  for (const platform of platforms) {
    const paths = getPlatformPaths(platform);
    if (!paths) continue;

    const skillDir = path.join(paths.skills, skillName);
    if (fs.existsSync(skillDir)) {
      removeDirSync(skillDir);
      console.log(`  ${colorize('✗', ANSI.yellow)} Removed ${paths.skills}/${skillName}/`);
    }
  }
  console.log(`  ${colorize('✓', ANSI.brightGreen)} Uninstalled: ${skillName}`);
}

module.exports = {
  installSkill,
  uninstallSkill,
};
