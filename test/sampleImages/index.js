const fs = require("fs");
const { join } = require("path");
const paths = fs.readdirSync(__dirname).filter((f) => f !== 'index.js');
const file = (path) => {
    return () => fs.promises.readFile(join(__dirname, path));
}

const files = {};

for (const p of paths) {
    files[p] = file(p);
}

module.exports = { paths, files };