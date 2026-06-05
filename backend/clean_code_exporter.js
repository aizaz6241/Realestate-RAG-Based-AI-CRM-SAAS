const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, 'src', 'ai');
const prismaFile = path.join(__dirname, 'prisma', 'schema.prisma');
const destDir = path.join(__dirname, 'ai-shared-clean');

// Ensure destination directories exist
if (!fs.existsSync(destDir)) {
  fs.mkdirSync(destDir, { recursive: true });
}
const destAiDir = path.join(destDir, 'src', 'ai');
if (!fs.existsSync(destAiDir)) {
  fs.mkdirSync(destAiDir, { recursive: true });
}
const destPrismaDir = path.join(destDir, 'prisma');
if (!fs.existsSync(destPrismaDir)) {
  fs.mkdirSync(destPrismaDir, { recursive: true });
}

// Helper to strip JS/TS comments safely (ignores URLs)
function stripTsComments(content) {
  // Replace multi-line comments /* ... */
  let cleaned = content.replace(/\/\*[\s\S]*?\*\//g, '');
  // Replace single-line comments // ... but preserve URLs (http:// or https://)
  // We match lines containing // but check that they are not part of an http:// or https:// string
  const lines = cleaned.split('\n');
  const processedLines = lines.map(line => {
    let inString = false;
    let quoteChar = '';
    let isComment = false;
    let commentStartIdx = -1;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      const nextChar = line[i + 1];

      // Handle strings
      if ((char === '"' || char === "'" || char === '`') && (i === 0 || line[i - 1] !== '\\')) {
        if (!inString) {
          inString = true;
          quoteChar = char;
        } else if (char === quoteChar) {
          inString = false;
        }
      }

      // Check for comment start //
      if (!inString && char === '/' && nextChar === '/') {
        // Prevent matching URLs in regexes or strings
        const precedingPart = line.substring(0, i);
        if (precedingPart.endsWith('http:') || precedingPart.endsWith('https:')) {
          continue; // It's a URL, not a comment
        }
        isComment = true;
        commentStartIdx = i;
        break;
      }
    }

    if (isComment && commentStartIdx !== -1) {
      return line.substring(0, commentStartIdx).trimEnd();
    }
    return line;
  });

  return processedLines.join('\n');
}

// Helper to strip Prisma schema comments (starts with // or ///)
function stripPrismaComments(content) {
  const lines = content.split('\n');
  const processedLines = lines.map(line => {
    const trimmed = line.trim();
    if (trimmed.startsWith('//') || trimmed.startsWith('///')) {
      return '';
    }
    // Remove inline comments
    const commentIndex = line.indexOf('//');
    if (commentIndex !== -1) {
      const preceding = line.substring(0, commentIndex);
      // Prisma schema urls usually have env("DATABASE_URL") so http:// isn't hardcoded in comments
      return preceding.trimEnd();
    }
    return line;
  });
  return processedLines.filter(line => line !== '').join('\n');
}

// Read and process AI folder
const files = fs.readdirSync(srcDir);
files.forEach(file => {
  const filePath = path.join(srcDir, file);
  const stat = fs.statSync(filePath);

  if (stat.isFile() && (file.endsWith('.ts') || file.endsWith('.js'))) {
    const content = fs.readFileSync(filePath, 'utf-8');
    const cleaned = stripTsComments(content);
    fs.writeFileSync(path.join(destAiDir, file), cleaned, 'utf-8');
    console.log(`Processed: ${file} (Cleaned and copied)`);
  }
});

// Read and process Prisma Schema
if (fs.existsSync(prismaFile)) {
  const content = fs.readFileSync(prismaFile, 'utf-8');
  const cleaned = stripPrismaComments(content);
  fs.writeFileSync(path.join(destPrismaDir, 'schema.prisma'), cleaned, 'utf-8');
  console.log(`Processed: schema.prisma (Cleaned and copied)`);
}

console.log(`\nSuccess! Cleaned files are available at: ${destDir}`);
