const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const path = require('path');
const logger = require('./logger');

let db = null;

async function initializeDb() {
    try {
        db = await open({
            filename: path.join(__dirname, '../../database.sqlite'),
            driver: sqlite3.Database
        });

        logger.info('SQLite database connected successfully.');

        // Create table for message logs
        await db.exec(`
            CREATE TABLE IF NOT EXISTS message_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                phone TEXT NOT NULL,
                message TEXT NOT NULL,
                status TEXT NOT NULL,
                error TEXT,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        return db;
    } catch (err) {
        logger.error('Error initializing SQLite database:', err);
        throw err;
    }
}

function getDb() {
    if (!db) {
        throw new Error('Database not initialized. Call initializeDb first.');
    }
    return db;
}

module.exports = {
    initializeDb,
    getDb
};
