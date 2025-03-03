<script setup>
import { onMounted } from 'vue'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'

onMounted(() => {
  new maplibregl.Map({
    container: 'map',
    style: '/style.json',
    center: [39.20564534600111, 21.58919229802818],
    zoom: 10,
  })
})
</script>

<template>
  <div id="map"></div>
</template>

<style>
#map {
  height: 100vh;
  width: 100vw;
}
</style>