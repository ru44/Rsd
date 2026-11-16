# rsGIS

gis built in rust

## Data credits

- City names for search: [GeoNames](https://www.geonames.org/) `cities15000`, CC BY 4.0.
- Height and depth readout: Mapzen terrain tiles (ETOPO1, SRTM, GMTED2010 and others), averaged to about 14 km. Rebuild with `app/scripts/build-elevation.py`.
- Built-in base map: Natural Earth II, shipped with CesiumJS.
- Optional "Streets" base map: © OpenStreetMap contributors (online only; turn off with `VITE_ONLINE_MAPS=false`).
