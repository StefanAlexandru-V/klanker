/**
 * Command safety classifier.
 *
 * Categorizes shell commands into three tiers:
 *   - safe:     read-only, auto-execute
 *   - approval: potentially destructive, requires user confirmation
 *   - blocked:  dangerous, never execute
 *
 * @module classify
 */

/**
 * @typedef {'safe' | 'approval' | 'blocked'} ClassificationLevel
 */

/**
 * @typedef {object} Classification
 * @property {ClassificationLevel} level
 * @property {string} reason
 */

const SAFE_COMMANDS = new Set([
  'ls', 'dir', 'cat', 'head', 'tail', 'wc', 'grep', 'egrep', 'fgrep',
  'find', 'which', 'whereis', 'whoami', 'pwd', 'echo', 'printf',
  'date', 'uptime', 'df', 'du', 'free', 'ps', 'top', 'htop',
  'lsof', 'file', 'stat', 'readlink', 'realpath', 'basename', 'dirname',
  'sort', 'uniq', 'cut', 'tr', 'diff', 'comm',
  'less', 'more',
  'hostname', 'uname', 'arch', 'id', 'groups', 'who', 'w',
  'sha256sum', 'md5sum', 'wc', 'nl', 'tac', 'rev',
  'tree', 'column', 'jq', 'yq',
]);

const SAFE_GIT_SUBCOMMANDS = new Set([
  'log', 'status', 'diff', 'branch', 'show', 'tag', 'remote',
  'stash', 'shortlog', 'describe', 'rev-parse', 'ls-files',
  'ls-tree', 'blame', 'reflog',
]);

const SAFE_DOCKER_SUBCOMMANDS = new Set([
  'ps', 'logs', 'images', 'inspect', 'stats', 'top',
  'port', 'version', 'info', 'network', 'volume',
]);

const SAFE_NODE_COMMANDS = new Set([
  'node -v', 'node --version',
  'npm -v', 'npm --version', 'npm list', 'npm ls', 'npm outdated', 'npm audit',
  'npx -v',
  'python3 --version', 'python --version', 'pip list', 'pip freeze',
]);

const BLOCKED_PATTERNS = [
  // Recursive delete on root or home
  /rm\s+(-[a-zA-Z]*f[a-zA-Z]*\s+)?(-[a-zA-Z]*r[a-zA-Z]*\s+)?\//,
  /rm\s+(-[a-zA-Z]*r[a-zA-Z]*\s+)?(-[a-zA-Z]*f[a-zA-Z]*\s+)?\//,
  /rm\s+-[a-zA-Z]*r[a-zA-Z]*\s+~\s*$/,
  /rm\s+-[a-zA-Z]*r[a-zA-Z]*\s+\$HOME\s*$/,

  // Fork bombs
  /:\(\)\s*\{\s*:\|:&\s*\}\s*;?\s*:/,
  /\.\/bomb/,

  // Piped-from-network execution
  /curl\s.*\|\s*(ba)?sh/,
  /wget\s.*\|\s*(ba)?sh/,
  /curl\s.*\|\s*python/,
  /wget\s.*\|\s*python/,

  // Privilege escalation
  /\bsudo\s+su\b/,
  /\bpasswd\b/,

  // Network attack tools
  /\bnmap\b/,
  /\bnc\s+-[a-zA-Z]*l/,  // nc listener mode
  /\bnetcat\s+-[a-zA-Z]*l/,

  // Disk/filesystem destruction
  /\bmkfs\b/,
  /\bdd\s+.*of=\/dev\//,
  /\bfdisk\b/,

  // SSH to external hosts
  /\bssh\s+[^l]/,  // ssh but not ssh-related local commands

  // Eval/exec of arbitrary code from network
  /eval\s*\$\(curl/,
  /eval\s*\$\(wget/,
];

/**
 * Classify a shell command by safety level.
 * @param {string} cmd — the raw command string
 * @returns {Classification}
 */
export function classify(cmd) {
  const trimmed = cmd.trim();

  if (!trimmed) {
    return { level: 'blocked', reason: 'Empty command' };
  }

  // Check blocked patterns first (highest priority)
  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(trimmed)) {
      return { level: 'blocked', reason: `Matches blocked pattern: ${pattern}` };
    }
  }

  // Check for sudo prefix
  if (/^\s*sudo\s/.test(trimmed)) {
    return { level: 'blocked', reason: 'sudo is not allowed' };
  }

  // Check for chained commands (&&, ;, ||) — must come BEFORE pipe check
  // because || contains | and would be incorrectly split as a pipe
  if (/&&|;|\|\|/.test(trimmed)) {
    const segments = trimmed.split(/&&|;|\|\|/).map((s) => s.trim()).filter(Boolean);
    const results = segments.map((s) => classify(s));
    const blocked = results.find((r) => r.level === 'blocked');
    if (blocked) return blocked;
    const needsApproval = results.find((r) => r.level === 'approval');
    if (needsApproval) return needsApproval;
    return { level: 'safe', reason: 'All chained commands are safe' };
  }

  // Check for piped commands — classify each segment
  if (trimmed.includes('|')) {
    const segments = trimmed.split('|').map((s) => s.trim());
    const results = segments.map((s) => classify(s));
    const blocked = results.find((r) => r.level === 'blocked');
    if (blocked) return blocked;
    const needsApproval = results.find((r) => r.level === 'approval');
    if (needsApproval) return needsApproval;
    return { level: 'safe', reason: 'All pipe segments are safe' };
  }

  // Check for output redirection (write operation)
  if (/>>?\s/.test(trimmed) || />\s/.test(trimmed)) {
    return { level: 'approval', reason: 'Contains output redirection' };
  }

  // Extract the base command (first word)
  const parts = trimmed.split(/\s+/);
  const baseCmd = parts[0];

  // Exact match for safe node/python version commands
  for (const safeCmd of SAFE_NODE_COMMANDS) {
    if (trimmed === safeCmd || trimmed.startsWith(safeCmd + ' ')) {
      return { level: 'safe', reason: `Known safe command: ${safeCmd}` };
    }
  }

  // Git subcommand check
  if (baseCmd === 'git' && parts.length > 1) {
    const subCmd = parts[1];
    if (SAFE_GIT_SUBCOMMANDS.has(subCmd)) {
      const ambiguousSubs = new Set(['stash']);
      if (ambiguousSubs.has(subCmd)) {
        const action = parts[2];
        if (action === 'list' || action === 'show') {
          return { level: 'safe', reason: `Read-only git command: git ${subCmd} ${action}` };
        }
        return { level: 'approval', reason: `Git write command: git ${subCmd}${action ? ' ' + action : ''}` };
      }
      return { level: 'safe', reason: `Read-only git command: git ${subCmd}` };
    }
    return { level: 'approval', reason: `Git write command: git ${subCmd}` };
  }

  // Docker subcommand check
  if (baseCmd === 'docker' && parts.length > 1) {
    const subCmd = parts[1];
    if (SAFE_DOCKER_SUBCOMMANDS.has(subCmd)) {
      const ambiguousSubs = new Set(['network', 'volume']);
      if (ambiguousSubs.has(subCmd)) {
        const action = parts[2];
        if (action === 'ls' || action === 'list' || action === 'inspect') {
          return { level: 'safe', reason: `Read-only docker command: docker ${subCmd} ${action}` };
        }
        return { level: 'approval', reason: `Docker write command: docker ${subCmd}${action ? ' ' + action : ''}` };
      }
      return { level: 'safe', reason: `Read-only docker command: docker ${subCmd}` };
    }
    return { level: 'approval', reason: `Docker write command: docker ${subCmd}` };
  }

  // Simple safe command check
  if (SAFE_COMMANDS.has(baseCmd)) {
    return { level: 'safe', reason: `Known safe command: ${baseCmd}` };
  }

  // Default: requires approval
  return { level: 'approval', reason: `Unknown command: ${baseCmd}` };
}
