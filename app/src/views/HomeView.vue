<script setup>
import { onMounted, ref } from 'vue'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import 'leaflet-draw/dist/leaflet.draw.css'
import 'leaflet-draw'
import axios from 'axios'
import 'leaflet.vectorgrid' // Import leaflet.vectorgrid for PBF tiles

let map
let drawnItems
const drawnLayer = ref(null)

onMounted(() => {
  // Initialize the map
  map = L.map('map').setView([21.58919229802818, 39.20564534600111], 10)

  // ✅ Load Vector Tiles (PBF) from backend
  L.vectorGrid.protobuf('http://localhost:7000/api/tiles/{z}/{x}/{y}.pbf', {
  vectorTileLayerStyles: {
    // Example: If your MBTiles has a layer named "landuse" for land
    landuse: {
      fillColor: '#e5e3df',
      fill: true,
      fillOpacity: 1,
      stroke: false,
    },
    // Example: If there's a layer named "water"
    water: {
      fillColor: '#a0c8f0',
      fill: true,
      fillOpacity: 1,
      stroke: false,
    },
    // Example: If there's a layer named "building"
    building: {
      fillColor: '#d0d0d0',
      fillOpacity: 1,
      color: '#666',
      weight: 1,
    },
    // Roads
    road: {
      color: 'red',
      weight: 2,
    },
    // Fallback for everything else
    default: {
      weight: 1,
      color: '#666',
      fillColor: '#ccc',
      fillOpacity: 0.5,
    },
  },
  // ...
}).addTo(map);


  map.removeControl(map.attributionControl)

  // Initialize drawing controls
  drawnItems = new L.FeatureGroup()
  map.addLayer(drawnItems)

  const drawControl = new L.Control.Draw({
    edit: { featureGroup: drawnItems },
    draw: { polygon: true, marker: false, polyline: false, rectangle: false, circle: false }
  })
  map.addControl(drawControl)

  // Handle new drawn items
  map.on(L.Draw.Event.CREATED, (event) => {
    drawnLayer.value = event.layer
    drawnItems.addLayer(event.layer)
  })

  // Load existing drawn areas
  loadAreas()
})

// ✅ Save a drawn area as GeoJSON to backend
const saveArea = async () => {
  if (!drawnLayer.value) return
  const geojson = drawnLayer.value.toGeoJSON()
  console.log("Saving GeoJSON:", JSON.stringify(geojson, null, 2))

  await axios.post('http://localhost:7000/api/areas', {
    name: 'New Area',
    geojson,
  })

  alert('Area saved!')
}

// ✅ Load saved areas from backend
const loadAreas = async () => {
  const { data } = await axios.get('http://localhost:7000/api/areas')
  data.forEach(area => {
    L.geoJSON(JSON.parse(area.geojson)).addTo(map)
  })
}
</script>

<template>
  <div id="map"></div>
  <button @click="saveArea" class="absolute top-4 left-4  text-white p-2 rounded">Save Area</button>
</template>

<style>
#map {
  height: 100vh;
  width: 100vw;
}
</style>
