const fs = require('fs');

const content = fs.readFileSync('e:/Projects/RENS Ecosystem ERP/frontend/src/app/(dashboard)/assistant/page.tsx', 'utf8');

const lines = content.split('\n');

const startLine = 550;
const endLine = 1325;

console.log(`Analyzing lines ${startLine + 1} to ${endLine + 1}:`);

let p = 0;
let b = 0;

for (let i = startLine; i <= endLine; i++) {
  const line = lines[i];
  if (!line) continue;
  let lineP = 0;
  let lineB = 0;
  for (let j = 0; j < line.length; j++) {
    const char = line[j];
    if (char === '(') { p++; lineP++; }
    else if (char === ')') { p--; lineP--; }
    else if (char === '{') { b++; lineB++; }
    else if (char === '}') { b--; lineB--; }
  }
  if (Math.abs(lineP) > 0 || Math.abs(lineB) > 0 || i % 20 === 0 || i === startLine || i === endLine) {
    console.log(`${i + 1}: [P:${p} B:${b}] (diff P:${lineP} B:${lineB}) | ${line.trim().substring(0, 70)}`);
  }
}
