import "./styles.css";
import { bootstrapApplication } from "./app/bootstrap";
import { initializeTheme } from "./settings/theme";

document.title = "Nhịp Đôi";
initializeTheme();
void bootstrapApplication();
