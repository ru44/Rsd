import "./cesiumBase";
// Fonts are bundled from node_modules, so they work offline.
import "@fontsource-variable/geist";
import "@fontsource-variable/geist-mono";
import "@/assets/main.css";

import { createApp } from "vue";
import { createPinia } from "pinia";

import App from "./App.vue";
import router from "./router";

const app = createApp(App);

app.use(createPinia());
app.use(router);

app.mount("#app");
