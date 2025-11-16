const { db } = require('../server');

class InspectionRecord {
  static create(recordData) {
    return new Promise((resolve, reject) => {
      const { task_id, status, result, executed_at } = recordData;
      const query = `INSERT INTO inspection_records (task_id, status, result, executed_at) VALUES (?, ?, ?, ?)`;
      db.run(query, [task_id, status, result, executed_at], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ id: this.lastID, ...recordData });
        }
      });
    });
  }

  static findAll() {
    return new Promise((resolve, reject) => {
      const query = `SELECT * FROM inspection_records ORDER BY created_at DESC`;
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
      const query = `SELECT * FROM inspection_records WHERE id = ?`;
      db.get(query, [id], (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row);
        }
      });
    });
  }

  static findByTaskId(taskId) {
    return new Promise((resolve, reject) => {
      const query = `SELECT * FROM inspection_records WHERE task_id = ? ORDER BY created_at DESC`;
      db.all(query, [taskId], (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }
}

module.exports = InspectionRecord;