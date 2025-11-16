const { db } = require('../server');

class InspectionTask {
  static create(taskData) {
    return new Promise((resolve, reject) => {
      const { name, description, cycle } = taskData;
      const query = `INSERT INTO inspection_tasks (name, description, cycle) VALUES (?, ?, ?)`;
      db.run(query, [name, description, cycle], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ id: this.lastID, ...taskData });
        }
      });
    });
  }

  static findAll() {
    return new Promise((resolve, reject) => {
      const query = `SELECT * FROM inspection_tasks ORDER BY created_at DESC`;
      db.all(query, [], (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  static findById(id) {
    return new Promise((resolve, reject) => {
      const query = `SELECT * FROM inspection_tasks WHERE id = ?`;
      db.get(query, [id], (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row);
        }
      });
    });
  }

  static update(id, updateData) {
    return new Promise((resolve, reject) => {
      const { name, description, cycle, enabled } = updateData;
      const query = `UPDATE inspection_tasks SET name = ?, description = ?, cycle = ?, enabled = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`;
      db.run(query, [name, description, cycle, enabled, id], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ id, ...updateData });
        }
      });
    });
  }

  static delete(id) {
    return new Promise((resolve, reject) => {
      const query = `DELETE FROM inspection_tasks WHERE id = ?`;
      db.run(query, [id], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ changedRows: this.changes });
        }
      });
    });
  }
}

module.exports = InspectionTask;