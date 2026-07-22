import { createApp } from "vue";
import App from "./App.vue";
import "./style.css";
import { loadStatic } from "./store";

loadStatic();
createApp(App).mount("#app");
