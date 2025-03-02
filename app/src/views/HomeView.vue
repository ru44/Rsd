<script setup>
import { onMounted, ref } from 'vue'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import 'leaflet-draw/dist/leaflet.draw.css'
import 'leaflet-draw'
import axios from 'axios'

let map
let drawnItems
const drawnLayer = ref(null)

onMounted(() => {
  map = L.map('map').setView([21.58919229802818, 39.20564534600111], 13)
  L.tileLayer('http://localhost:7000/api/tiles/{z}/{x}/{y}.png', {
    maxZoom: 19,
  }).addTo(map)
  
  map.removeControl(map.attributionControl);
  drawnItems = new L.FeatureGroup()
  map.addLayer(drawnItems)
  const drawControl = new L.Control.Draw({
    edit: { featureGroup: drawnItems },
    draw: { polygon: true, marker: false, polyline: false, rectangle: false, circle: false }
  })
  map.addControl(drawControl)

  map.on(L.Draw.Event.CREATED, (event) => {
    drawnLayer.value = event.layer
    drawnItems.addLayer(event.layer)
  })

  loadAreas()
})

const saveArea = async () => {
  if (!drawnLayer.value) return
  const geojson = drawnLayer.value.toGeoJSON()
  console.log(drawnLayer.value.toGeoJSON())
  await axios.post('http://localhost:7000/api/areas', {
    name: 'New Area',
    geojson,
  })
  alert('Area saved!')
}

const loadAreas = async () => {
  const { data } = await axios.get('http://localhost:7000/api/areas')
  data.forEach(area => {
    L.geoJSON(JSON.parse(area.geojson)).addTo(map)
  })
}
</script>

<template>
  <div id="map" class=""></div>
  <button @click="saveArea" class="absolute top-4 left-4 bg-blue-500 text-white p-2 rounded">Save Area</button>
</template>

<style>
#map {
  height: 100vh;
  width: 100vh;
}
</style>
