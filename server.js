// Express.js Backend with PostgreSQL and PostGIS
const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const morgan = require('morgan');
const MBTiles = require('@mapbox/mbtiles');
const path = require('path');

const app = express();
app.use(express.json());
app.use(cors());

app.use(morgan('dev'));

// PostgreSQL Connection
const pool = new Pool({
  user: 'myuser',
  host: 'localhost',
  database: 'mydb',
  password: 'mypassword',
  port: 5444,
});

// Create table for Areas of Interest (AOI)
(async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS areas (
      id SERIAL PRIMARY KEY,
      name TEXT,
      geom GEOMETRY(POLYGON, 4326)
    )
  `);
})();

app.get('/', (req, res) => {
  res.send('Welcome to the API');
});

app.get('/api/tiles/:z/:x/:y.png', (req, res) => {
  const { z, x, y } = req.params;

  const mbtilesPath = path.join(__dirname, 'storage', 'saudi.mbtiles');

  console.log(`Requesting tile z: ${z}, x: ${x}, y: ${y}`);
  new MBTiles(mbtilesPath, (err, mbtiles) => {
    if (err) {
      console.error('Error loading MBTiles file:', err);
      res.status(500).json({ error: 'Error loading MBTiles file' });
      return;
    }

    mbtiles.getTile(z, x, y, (err, tile) => {
      if (err) {
        console.error('Tile not found:', err);
        res.status(404).json({ error: 'Tile not found' });
        return;
      }

      console.log('Tile retrieved successfully');
      res.setHeader('Content-Type', 'image/png');
      res.send(tile);

      // Log the tile data length to ensure it's being sent
      console.log(`Tile data length: ${tile.length}`);
    });
  });
});

app.post('/api/areas', async (req, res) => {
  const { name, geojson } = req.body;

  console.log("Received GeoJSON:", JSON.stringify(geojson, null, 2));

  try {
    // Ensure only the 'geometry' part is stored
    const geometry = geojson.geometry;
    const result = await pool.query(
      'INSERT INTO areas (name, geom) VALUES ($1, ST_GeomFromGeoJSON($2)) RETURNING *',
      [name, JSON.stringify(geometry)]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Fetch all AOIs
app.get('/api/areas', async (req, res) => {
  try {
    const result = await pool.query('SELECT id, name, ST_AsGeoJSON(geom) as geojson FROM areas');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(7000, () => console.log('Server running on port 7000'));
