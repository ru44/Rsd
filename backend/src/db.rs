use deadpool_postgres::{ ManagerConfig, Pool, RecyclingMethod, Runtime };
use tokio_postgres::{ NoTls };

// The SQL to create the necessary tables and extensions if they don't exist.
const INIT_SQL: &str =
    r#"
    -- Creates the PostGIS extension if it's not already enabled
    CREATE EXTENSION IF NOT EXISTS postgis;

    -- Creates the table to store drawn shapes: polygons, rectangles, circles
    -- (all stored as polygons) and lines. `shape` says which one it was drawn as.
    CREATE TABLE IF NOT EXISTS areas (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        geom GEOMETRY(Geometry, 4326) NOT NULL,
        color TEXT NULL,
        shape TEXT NULL
    );

    -- Creates the table to store placed symbols (points)
    CREATE TABLE IF NOT EXISTS symbols (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        geom GEOMETRY(Point, 4326) NOT NULL,
        sidc VARCHAR(32) NOT NULL,
        image TEXT NULL
    );

    -- Migration for existing installations that previously stored images only
    ALTER TABLE symbols ADD COLUMN IF NOT EXISTS sidc VARCHAR(32);
    
    -- Force remove NOT NULL constraint from image column if it exists
    -- This handles existing databases that have the wrong constraint
    DO $$
    BEGIN
        -- Try to drop the NOT NULL constraint on image column
        ALTER TABLE symbols ALTER COLUMN image DROP NOT NULL;
    EXCEPTION
        WHEN OTHERS THEN
            -- If it fails (constraint doesn't exist), that's fine
            NULL;
    END $$;
    
    -- Ensure SIDC column has proper constraint for new approach
    DO $$
    BEGIN
        -- Try to set SIDC as NOT NULL
        ALTER TABLE symbols ALTER COLUMN sidc SET NOT NULL;
    EXCEPTION
        WHEN OTHERS THEN
            -- If it fails (column has nulls), update nulls first
            UPDATE symbols SET sidc = 'SFGPUCI----K' WHERE sidc IS NULL;
            ALTER TABLE symbols ALTER COLUMN sidc SET NOT NULL;
    END $$;

    -- Creates the table to store markers (points)
    CREATE TABLE IF NOT EXISTS markers (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        geom GEOMETRY(Point, 4326) NOT NULL,
        color TEXT NULL
    );

    -- Ensure existing installations get the color column if it wasn't present
    ALTER TABLE areas ADD COLUMN IF NOT EXISTS color TEXT;
    ALTER TABLE areas ADD COLUMN IF NOT EXISTS shape TEXT;

    -- Older installations only allowed polygons; lines are stored here too.
    DO $$
    BEGIN
        IF EXISTS (
            SELECT 1 FROM geometry_columns
            WHERE f_table_name = 'areas' AND f_geometry_column = 'geom' AND type <> 'GEOMETRY'
        ) THEN
            ALTER TABLE areas ALTER COLUMN geom TYPE GEOMETRY(Geometry, 4326);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'areas_geom_kind') THEN
            ALTER TABLE areas ADD CONSTRAINT areas_geom_kind
                CHECK (GeometryType(geom) IN ('POLYGON', 'LINESTRING'));
        END IF;
    END $$;
    ALTER TABLE markers ADD COLUMN IF NOT EXISTS color TEXT;
"#;

pub async fn init_pg_pool() -> Result<Pool, Box<dyn std::error::Error>> {
    // Prioritize DATABASE_URL from environment, but default to localhost for easy local dev
    let database_url = std::env
        ::var("DATABASE_URL")
        .unwrap_or_else(|_| "postgres://myuser:mypassword@localhost:5444/mydb".to_string());

    // Parse the connection string
    let cfg = database_url.parse()?;

    let mgr_config = ManagerConfig {
        recycling_method: RecyclingMethod::Fast,
    };

    let mgr = deadpool_postgres::Manager::from_config(cfg, NoTls, mgr_config);
    let pool = Pool::builder(mgr).max_size(16).runtime(Runtime::Tokio1).build()?;

    // Get a client from the pool to initialize the database schema
    let client = pool.get().await?;
    println!("Successfully connected to PostgreSQL database");

    // Run the initialization SQL
    client.batch_execute(INIT_SQL).await?;
    println!("Database schema initialized successfully (tables and extensions are ready).");

    Ok(pool)
}
