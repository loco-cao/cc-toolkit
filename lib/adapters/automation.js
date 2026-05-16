/**
 * PTY prompt automation — shared state machine and pattern matchers.
 *
 * Each adapter composes these building blocks with CLI-specific patterns
 * to produce detectState, answerTrust, and answerPermission exports.
 */

const AgentState = Object.freeze({
  IDLE: 'idle',
  WAITING_TRUST: 'waiting_trust',
  WAITING_PERMISSION: 'waiting_permission',
  EXECUTING: 'executing',
  ERROR: 'error',
});

// ── ANSI / control char stripping ──────────────────────────────────

function cleanOutput(output) {
  if (!output) return '';
  return output
    .replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, '')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
}

// ── Default pattern sets (cross-CLI heuristics) ────────────────────

const DEFAULT_TRUST_PATTERNS = [
  'do you trust',
  'trust this workspace',
  'trust this folder',
  'trust workspace',
  'trust folder',
  'allow execution',
  'mark this folder as trusted',
  'untrusted project',
  'untrusted workspace',
  'trust and continue',
];

const DEFAULT_PERMISSION_PATTERNS = [
  'allow command',
  'approve this action',
  'approve command',
  'allow execution',
  '(y/n)',
  '[y/n]',
  'run this command',
  'execute command',
  'do you want to proceed',
  'confirm execution',
  'permission required',
  'needs approval',
];

// ── Factory: build an answerer from a pattern list + reply string ──

function createAnswerer(patterns, reply) {
  return function answer(output) {
    if (!output) return null;
    const text = cleanOutput(output).toLowerCase();
    for (const p of patterns) {
      if (text.includes(p)) {
        return reply;
      }
    }
    return null;
  };
}

// ── State detector ─────────────────────────────────────────────────

function createStateDetector(trustPatterns, permPatterns) {
  const trustLower = trustPatterns.map((p) => p.toLowerCase());
  const permLower = permPatterns.map((p) => p.toLowerCase());

  return function detectState(output) {
    if (!output) return AgentState.IDLE;
    const text = cleanOutput(output).toLowerCase();

    for (const p of trustLower) {
      if (text.includes(p)) return AgentState.WAITING_TRUST;
    }
    for (const p of permLower) {
      if (text.includes(p)) return AgentState.WAITING_PERMISSION;
    }

    // Heuristic: right after trust/perm answered, CLI is executing
    // Caller manages this transition — we only detect explicit states.
    return AgentState.IDLE;
  };
}

module.exports = {
  AgentState,
  cleanOutput,
  DEFAULT_TRUST_PATTERNS,
  DEFAULT_PERMISSION_PATTERNS,
  createAnswerer,
  createStateDetector,
};
