import { createApp } from "vue";
import App from "./App.vue";
import "./style.css";
import { loadStatic, probeServer } from "./store";

probeServer();
loadStatic();
createApp(App).mount("#app");
