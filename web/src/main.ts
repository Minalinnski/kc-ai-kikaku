import { createApp } from "vue";
import App from "./App.vue";
import "./style.css";
import { loadStatic, probeServer, loadLatestRun } from "./store";

probeServer().then(loadLatestRun);
loadStatic();
createApp(App).mount("#app");
