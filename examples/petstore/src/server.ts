import express from "express";
import connectDB from "../config/database";
import auth from "./routes/api/auth";
import profile from "./routes/api/profile";
import user from "./routes/api/user";

const app = express();

connectDB();

app.set("port", process.env.PORT || 5000);
app.use(express.json());

app.get("/", (_req, res) => {
  res.send("API Running");
});

app.use("/api/auth", auth);
app.use("/api/user", user);
app.use("/api/profile", profile);

const port = app.get("port");
const server = app.listen(port, () =>
  console.log(`Server started on port ${port}`)
);

export default server;
