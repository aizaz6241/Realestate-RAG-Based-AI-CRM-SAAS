const fs = require('fs');
const path = require('path');

const base = 'src/app';
const targetGroup = path.join(base, '(dashboard)');

const folders = ['dashboard', 'properties', 'clients', 'employees', 'leads', 'tasks'];

if (!fs.existsSync(targetGroup)) {
  fs.mkdirSync(targetGroup);
}

folders.forEach(folder => {
  const srcFolder = path.join(base, folder);
  const destFolder = path.join(targetGroup, folder);
  
  if (!fs.existsSync(destFolder)) {
    fs.mkdirSync(destFolder, { recursive: true });
  }

  const srcFile = path.join(srcFolder, 'page.tsx');
  const destFile = path.join(destFolder, 'page.tsx');

  if (fs.existsSync(srcFile)) {
    fs.renameSync(srcFile, destFile);
    console.log(`Moved ${srcFile} to ${destFile}`);
  }
});

// Now delete old folders if empty
folders.forEach(folder => {
  const srcFolder = path.join(base, folder);
  if (fs.existsSync(srcFolder)) {
    const files = fs.readdirSync(srcFolder);
    if (files.length === 0) {
      fs.rmdirSync(srcFolder);
    }
  }
});

console.log("Done");
