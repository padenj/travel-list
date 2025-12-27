const fs = require('fs');
const path = require('path');

class SimpleJSONStorage {
  constructor(options = {}) {
    this.path = options.path || path.resolve(process.cwd(), './server/migrations/migrations.json');
    // Ensure file exists
    try {
      if (!fs.existsSync(this.path)) {
        fs.writeFileSync(this.path, JSON.stringify([]), 'utf8');
      }
    } catch (err) {
      throw new Error(`Unable to initialize storage file at ${this.path}: ${err.message}`);
    }
  }

  async executed() {
    const raw = fs.readFileSync(this.path, 'utf8');
    try {
      const arr = JSON.parse(raw || '[]');
      return arr;
    } catch (err) {
      throw new Error(`Invalid JSON in storage file ${this.path}: ${err.message}`);
    }
  }

  async logMigration(migrationName) {
    const arr = await this.executed();
    if (!arr.includes(migrationName)) {
      arr.push(migrationName);
      fs.writeFileSync(this.path, JSON.stringify(arr, null, 2), 'utf8');
    }
  }

  async unlogMigration(migrationName) {
    const arr = await this.executed();
    const idx = arr.indexOf(migrationName);
    if (idx !== -1) {
      arr.splice(idx, 1);
      fs.writeFileSync(this.path, JSON.stringify(arr, null, 2), 'utf8');
    }
  }
}

module.exports = SimpleJSONStorage;
