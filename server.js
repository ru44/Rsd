const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const app = express();
app.use(express.json());
app.use(cors({ origin: '*' }));
app.use(morgan('dev'));

// Middleware for CORS
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  next();
});

// Test API endpoint
app.get('/', (req, res) => {
  res.send('Welcome to the MBTiles API');
});

// Path to the MBTiles file
const mbtilesPath = path.join(__dirname, 'storage', 'test.mbtiles');

// ✅ Serve Vector Tiles (PBF format)
app.get('/api/tiles/:z/:x/:y.pbf', (req, res) => {
  const { z, x, y } = req.params;

  // Flip Y to match TMS format
  const tileY = (1 << z) - 1 - parseInt(y);

  console.log(`Fetching vector tile: z=${z}, x=${x}, y=${tileY}`);

  const db = new sqlite3.Database(mbtilesPath, sqlite3.OPEN_READONLY, (err) => {
    if (err) {
      console.error('Error opening MBTiles database:', err);
      return res.status(500).json({ error: 'Error opening MBTiles file' });
    }
  });

  db.get(
    `SELECT tile_data FROM tiles WHERE zoom_level = ? AND tile_column = ? AND tile_row = ?`,
    [parseInt(z), parseInt(x), tileY],
    (err, row) => {
      if (err || !row) {
        console.error(`Tile not found at z:${z}, x:${x}, y:${tileY}`, err);
        return res.status(404).json({ error: 'Tile not found' });
      }

      console.log(`Vector tile retrieved: ${z}/${x}/${y}, size=${row.tile_data.length} bytes`);

      // ✅ Set correct content type for vector tiles
      res.setHeader('Content-Type', 'application/x-protobuf');
      res.setHeader('Content-Encoding', 'gzip'); // Most vector tiles are compressed
      res.send(row.tile_data);
    }
  );

  db.close();
});

// ✅ PostgreSQL Connection using Knex.js (for storing geo data)
const knex = require('knex')({
  client: 'pg',
  connection: {
    host: 'localhost',
    user: 'myuser',
    password: 'mypassword',
    database: 'mydb',
    port: 5444,
  },
});

// ✅ Create table for Areas of Interest (AOI)
knex.schema.hasTable('areas').then((exists) => {
  if (!exists) {
    return knex.schema.createTable('areas', (table) => {
      table.increments('id').primary();
      table.string('name');
      table.specificType('geom', 'geometry(POLYGON, 4326)');
    }).then(() => console.log('Table created successfully'));
  }
}).catch(err => console.error('Error creating table:', err));

// ✅ Store Areas of Interest (AOI)
app.post('/api/areas', async (req, res) => {
  const { name, geojson } = req.body;
  console.log("Received GeoJSON:", JSON.stringify(geojson, null, 2));

  try {
    const result = await knex('areas')
      .insert({ name, geom: knex.raw('ST_GeomFromGeoJSON(?)', [JSON.stringify(geojson.geometry)]) })
      .returning('*');

    res.json(result[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ✅ Fetch all AOIs
app.get('/api/areas', async (req, res) => {
  try {
    const result = await knex('areas').select('id', 'name', knex.raw('ST_AsGeoJSON(geom) as geojson'));
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Start Server
const PORT = 7000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
