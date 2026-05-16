const fs = require('fs');
const path = require('path');
const { getPlatformPaths } = require('./platform-paths.js');
const { colorize, ANSI } = require('./colors.js');
const { getRegistry } = require('./registry.js');

function copyDirSync(src, dest) {
  if (!fs.existsSync(src)) {
    throw new Error(`Source directory not found: ${src}`);
  }
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      fs.mkdirSync(path.dirname(destPath), { recursive: true });
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function removeDirSync(dir) {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
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
    console.log(`  Run "ait update" to re-clone.`);
    return false;
  }

  console.log(`  Installing ${colorize(skillName, ANSI.bold)} v${reg.version}...`);
  console.log('');

  for (const platform of platforms) {
    const paths = getPlatformPaths(platform);
    if (!paths) {
      console.log(`  ${colorize('✗', ANSI.red)} Unknown platform: ${platform}`);
      continue;
    }

    const cliDir = path.join(repoPath, platform);
    if (!fs.existsSync(cliDir)) {
      console.log(`  ${colorize('!', ANSI.yellow)} No ${platform}/ directory in skill repo, skipping.`);
      continue;
    }

    // Install skill
    const skillDest = path.join(paths.skills, skillName);
    copyDirSync(cliDir, skillDest);
    console.log(`  ${colorize('✓', ANSI.brightGreen)} Skill → ${paths.skills}/${skillName}/`);

    // Install agents (if present)
    const agentsSrc = path.join(repoPath, platform, 'agents');
    if (fs.existsSync(agentsSrc)) {
      for (const file of fs.readdirSync(agentsSrc)) {
        const agentSrc = path.join(agentsSrc, file);
        const agentDest = path.join(paths.agents, file);
        fs.mkdirSync(paths.agents, { recursive: true });
        fs.copyFileSync(agentSrc, agentDest);
        console.log(`  ${colorize('✓', ANSI.brightGreen)} Agent: ${file} → ${paths.agents}/`);
      }
    }

    // Install shared references (if present)
    const refSrc = path.join(repoPath, 'references');
    const refDest = path.join(paths.skills, skillName, 'references');
    if (fs.existsSync(refSrc)) {
      copyDirSync(refSrc, refDest);
    }

    // Install shared workflows (if present)
    const wfSrc = path.join(repoPath, 'workflows');
    const wfDest = path.join(paths.skills, skillName, 'workflows');
    if (fs.existsSync(wfSrc)) {
      copyDirSync(wfSrc, wfDest);
    }
  }

  console.log('');
  console.log(`  ${colorize('Install complete!', ANSI.brightGreen)}`);
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
