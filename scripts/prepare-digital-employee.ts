import fs from 'node:fs';
import path from 'node:path';

// Explicit new-workspace preparation, never overwrite existing policy or user agents.
const target = path.resolve(process.argv[2] ?? 'data/digital-employee-demo');
if (fs.existsSync(target))
  throw new Error(
    'Choose a new workspace directory; existing policy is never overwritten',
  );
const source = path.resolve('examples/digital-employee');
fs.mkdirSync(path.join(target, '.pi', 'agents'), { recursive: true });
for (const role of ['retriever', 'analyst', 'reviewer'])
  fs.copyFileSync(
    path.join(source, 'agents', `${role}.md`),
    path.join(target, '.pi', 'agents', `${role}.md`),
  );
fs.copyFileSync(
  path.join(source, 'subagents.json'),
  path.join(target, '.pi', 'subagents.json'),
);
const skills = path.join(
  target,
  '.claude',
  'skills',
  'digital-employee-coordination',
);
fs.mkdirSync(skills, { recursive: true });
fs.copyFileSync(path.join(source, 'SKILL.md'), path.join(skills, 'SKILL.md'));
console.log(
  JSON.stringify({
    workspace: target,
    roles: ['retriever', 'analyst', 'reviewer'],
    note: 'Import the prepared directory as an authorized workspace before running an actual model task.',
  }),
);
